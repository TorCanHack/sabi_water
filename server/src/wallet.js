const crypto = require('node:crypto')
const { paymentConfig, paystack, matchesPayment } = require('./paystack')
const fail = (message, status = 400) => Object.assign(new Error(message), { status })
const validId = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)

function topupView(row) {
  return { reference: row.reference, amountKobo: row.amount_kobo, mode: row.mode, status: row.status, authorizationUrl: row.status === 'paid' ? null : row.authorization_url, createdAt: row.created_at }
}
async function initializeTopup(pool, userId, body, request = paystack) {
  const { amountKobo, checkoutId } = body || {}
  if (!Number.isSafeInteger(amountKobo) || amountKobo < 10000 || amountKobo > 100000000) throw fail('Enter a top-up between ₦100 and ₦1,000,000, with at most two decimal places.')
  if (!validId(checkoutId)) throw fail('Invalid top-up request ID.')
  const config = paymentConfig()
  if (!config.enabled) throw fail('Wallet top-ups are not configured yet.', 503)
  const client = await pool.connect()
  let row
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`wallet:${userId}:${checkoutId}`])
    const existing = await client.query('SELECT * FROM customer_wallet_topups WHERE user_id = $1 AND checkout_id = $2', [userId, checkoutId])
    if (existing.rows[0]) {
      row = existing.rows[0]
      if (row.amount_kobo !== amountKobo || row.mode !== config.mode) throw fail('This request ID was already used for a different top-up.', 409)
      await client.query('COMMIT')
      return topupView(row)
    }
    const customer = await client.query('SELECT email FROM customer_users WHERE id = $1', [userId])
    if (!customer.rows[0]) throw fail('Customer not found.', 404)
    const result = await client.query(`INSERT INTO customer_wallet_topups(reference,user_id,checkout_id,email,amount_kobo,mode)
      VALUES($1,$2,$3,$4,$5,$6) RETURNING *`, [`WALLET-${crypto.randomUUID()}`, userId, checkoutId, customer.rows[0].email, amountKobo, config.mode])
    row = result.rows[0]
    // Save before contacting Paystack. A lost response must not initialize twice.
    await client.query('COMMIT')
  } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
  const transaction = await request('/transaction/initialize', { reference: row.reference, amount: row.amount_kobo, email: row.email, currency: 'NGN', callback_url: config.callback, metadata: { purpose: 'wallet_topup' } })
  const url = new URL(transaction.authorization_url)
  if (url.protocol !== 'https:' || url.hostname !== 'checkout.paystack.com') throw fail('Unexpected payment checkout URL.', 502)
  const result = await pool.query('UPDATE customer_wallet_topups SET authorization_url = $2 WHERE reference = $1 RETURNING *', [row.reference, url.href])
  return topupView(result.rows[0])
}
async function settleTopup(pool, data) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await client.query('SELECT * FROM customer_wallet_topups WHERE reference = $1 FOR UPDATE', [data.reference])
    const row = result.rows[0]
    if (!row) { await client.query('COMMIT'); return null }
    if (!matchesPayment(row, data)) throw fail('Payment details do not match this wallet top-up.', 409)
    if (row.status !== 'paid') {
      await client.query('INSERT INTO customer_wallets(user_id,mode) VALUES($1,$2) ON CONFLICT DO NOTHING', [row.user_id, row.mode])
      const balance = await client.query('UPDATE customer_wallets SET balance_kobo = balance_kobo + $3, updated_at = NOW() WHERE user_id = $1 AND mode = $2 RETURNING balance_kobo', [row.user_id, row.mode, row.amount_kobo])
      await client.query(`INSERT INTO customer_wallet_entries(user_id,mode,kind,reference,amount_kobo,balance_after_kobo)
        VALUES($1,$2,'topup',$3,$4,$5)`, [row.user_id, row.mode, row.reference, row.amount_kobo, balance.rows[0].balance_kobo])
      await client.query("UPDATE customer_wallet_topups SET status = 'paid', paid_at = NOW() WHERE reference = $1", [row.reference])
    }
    await client.query('COMMIT')
    return topupView({ ...row, status: 'paid' })
  } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
}
// Called within the same transaction that creates the order and consumes its cart.
async function debitWallet(client, row) {
  const result = await client.query(`UPDATE customer_wallets SET balance_kobo = balance_kobo - $3, updated_at = NOW()
    WHERE user_id = $1 AND mode = $2 AND balance_kobo >= $3 RETURNING balance_kobo`, [row.user_id, row.mode, row.amount_kobo])
  if (!result.rows[0]) throw fail('Insufficient wallet balance. Top up your wallet or choose another payment method.', 409)
  await client.query(`INSERT INTO customer_wallet_entries(user_id,mode,kind,reference,amount_kobo,balance_after_kobo)
    VALUES($1,$2,'purchase',$3,$4,$5)`, [row.user_id, row.mode, row.reference, -row.amount_kobo, result.rows[0].balance_kobo])
  await client.query("UPDATE customer_payments SET status = 'paid', paid_at = NOW() WHERE reference = $1", [row.reference])
}
async function walletView(pool, userId, before) {
  if (before !== undefined && (typeof before !== 'string' || (!/^[1-9]\d{0,18}$/.test(before) || BigInt(before) > 9223372036854775807n))) throw fail('Invalid wallet history cursor.')
  const { mode, enabled } = paymentConfig()
  // A consistent snapshot keeps the displayed balance and ledger in agreement.
  const client = await pool.connect()
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    const balance = await client.query('SELECT balance_kobo FROM customer_wallets WHERE user_id = $1 AND mode = $2', [userId, mode])
    const entries = await client.query('SELECT * FROM customer_wallet_entries WHERE user_id = $1 AND mode = $2 AND ($3::bigint IS NULL OR id < $3) ORDER BY id DESC LIMIT 21', [userId, mode, before || null])
    const pending = await client.query("SELECT * FROM customer_wallet_topups WHERE user_id = $1 AND mode = $2 AND status = 'pending' ORDER BY created_at DESC LIMIT 20", [userId, mode])
    await client.query('COMMIT')
    return { mode, topupsEnabled: enabled, balanceKobo: Number(balance.rows[0]?.balance_kobo || 0), entries: entries.rows.slice(0, 20).map(row => ({ id: row.id, kind: row.kind, reference: row.reference, amountKobo: row.amount_kobo, balanceAfterKobo: Number(row.balance_after_kobo), createdAt: row.created_at })), nextCursor: entries.rows.length > 20 ? entries.rows[19].id : null, pendingTopups: pending.rows.map(topupView) }
  } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
}
module.exports = { initializeTopup, settleTopup, debitWallet, walletView, topupView }
