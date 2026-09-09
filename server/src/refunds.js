const { paymentConfig, paystack } = require('./paystack')
const { logError } = require('./runtime')
const PROVIDER_STATES = new Set(['pending', 'processing', 'processed', 'needs-attention', 'failed'])

function matchesRefund(row, data) {
  return Number(data?.amount) === row.amount_kobo && data.currency === 'NGN' && data.domain === row.mode
    && (data.transaction_reference || data.transaction?.reference) === row.reference
}

async function recordRefund(pool, reference, data, authoritative = false) {
  if (!PROVIDER_STATES.has(data?.status)) return false
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query('SELECT * FROM customer_payments WHERE reference = $1 FOR UPDATE', [reference])
    const row = rows[0]
    if (!row?.cancelled_at || row.payment_source === 'wallet' || row.status !== 'paid' || !matchesRefund(row, data)) {
      await client.query('COMMIT')
      return false
    }
    // A delayed pending webhook must never undo a completed refund.
    const rank = { none: 0, queued: 0, submitting: 0, pending: 1, processing: 2, 'needs-attention': 3, failed: 3, processed: 4 }
    if (rank[data.status] >= rank[row.refund_status] || (authoritative && row.refund_status !== 'processed')) {
      await client.query(`UPDATE customer_payments SET refund_status = $2, refund_id = COALESCE($3, refund_id),
        refund_error = $4, refund_checked_at = NOW() WHERE reference = $1`,
      [reference, data.status, data.id ? String(data.id) : null,
        data.status === 'needs-attention' ? 'Review the refund in Paystack and supply the customer bank details if requested.'
          : data.status === 'failed' ? 'Paystack could not complete this refund. Review it in the Paystack dashboard.' : null])
    }
    await client.query('COMMIT')
    return true
  } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
}

async function processRefunds(pool, request = paystack) {
  const config = paymentConfig()
  if (!config.enabled) return
  // Claim before calling the provider. A crash or ambiguous response is reconciled,
  // never blindly POSTed again. SKIP LOCKED supports multiple API instances.
  const claimed = await pool.query(`UPDATE customer_payments SET refund_status = 'submitting', refund_checked_at = NOW()
    WHERE reference IN (SELECT reference FROM customer_payments
      WHERE cancelled_at IS NOT NULL AND status = 'paid' AND payment_source = 'paystack' AND refund_status = 'queued' AND mode = $1
      ORDER BY cancelled_at LIMIT 10 FOR UPDATE SKIP LOCKED) RETURNING *`, [config.mode])
  for (const row of claimed.rows) {
    try {
      const data = await request('/refund', { transaction: row.reference, amount: row.amount_kobo, currency: 'NGN', customer_note: row.cancellation_reason, merchant_note: `Cancelled by ${row.cancelled_by}` })
      if (!await recordRefund(pool, row.reference, data)) throw new Error('Unexpected refund response')
    } catch {
      await pool.query(`UPDATE customer_payments SET refund_status = 'needs-attention', refund_error = $2
        WHERE reference = $1 AND refund_status = 'submitting'`, [row.reference, 'Refund submission could not be confirmed. Check this transaction in Paystack before retrying there.'])
    }
  }
  const outstanding = await pool.query(`SELECT * FROM customer_payments WHERE cancelled_at IS NOT NULL AND status = 'paid' AND payment_source = 'paystack'
    AND mode = $1 AND refund_status IN ('submitting', 'pending', 'processing', 'needs-attention', 'failed')
    AND (refund_checked_at IS NULL OR refund_checked_at < NOW() - INTERVAL '60 seconds')
    ORDER BY refund_checked_at NULLS FIRST LIMIT 10`, [config.mode])
  for (const row of outstanding.rows) {
    await pool.query('UPDATE customer_payments SET refund_checked_at = NOW() WHERE reference = $1', [row.reference])
    try {
      const transaction = await request(`/transaction/verify/${encodeURIComponent(row.reference)}`)
      if (transaction.reference !== row.reference || transaction.amount !== row.amount_kobo || transaction.currency !== 'NGN' || transaction.domain !== row.mode || !transaction.id) continue
      const normalize = data => {
        const id = data?.transaction?.id || data?.transaction
        return String(id) === String(transaction.id) ? { ...data, transaction_reference: row.reference } : data
      }
      if (row.refund_id) {
        const data = await request(`/refund/${encodeURIComponent(row.refund_id)}`)
        await recordRefund(pool, row.reference, normalize(data), true)
      } else {
        const data = await request(`/refund?transaction=${encodeURIComponent(transaction.id)}&perPage=100`)
        // The list response has a numeric transaction ID. Fetch each candidate to
        // validate the original reference, amount, currency and environment.
        let found = false
        for (const entry of Array.isArray(data) ? data : []) {
          const refund = await request(`/refund/${encodeURIComponent(entry.id)}`)
          if (await recordRefund(pool, row.reference, normalize(refund), true)) { found = true; break }
        }
        if (!found && row.refund_status === 'submitting') {
          await pool.query(`UPDATE customer_payments SET refund_status = 'needs-attention', refund_error = $2
            WHERE reference = $1 AND refund_status = 'submitting'`, [row.reference, 'Submission was interrupted. Check Paystack before initiating any refund manually.'])
        }
      }
    } catch { /* Network failures remain durable and will be checked next time. */ }
  }
}
function startRefundWorker(pool) {
  let running = null
  let stopped = false
  const tick = () => {
    if (running || stopped) return
    running = processRefunds(pool).catch(error => logError('refund_worker_failed', error)).finally(() => { running = null })
  }
  const timer = setInterval(tick, 15000)
  timer.unref()
  void tick()
  return async () => {
    stopped = true
    clearInterval(timer)
    await running
  }
}
module.exports = { matchesRefund, recordRefund, processRefunds, startRefundWorker }
