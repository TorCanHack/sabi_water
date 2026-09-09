const crypto = require('node:crypto')

function paymentConfig() {
  const mode = process.env.PAYSTACK_MODE || 'test'
  const key = process.env.PAYSTACK_SECRET_KEY || ''
  if (!['test', 'live'].includes(mode)) throw new Error('PAYSTACK_MODE must be test or live.')
  if (key && !key.startsWith(`sk_${mode}_`)) throw new Error('Paystack secret key does not match PAYSTACK_MODE.')
  const callback = process.env.PAYSTACK_CALLBACK_URL || 'http://localhost:5174/?payment=return'
  const url = new URL(callback)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid Paystack callback URL.')
  return { mode, key, callback, enabled: Boolean(key) }
}
async function paystack(path, body) {
  const { key } = paymentConfig()
  if (!key) throw Object.assign(new Error('Online payments are not configured yet.'), { status: 503 })
  let response, result
  try {
    response = await fetch(`https://api.paystack.co${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000),
    })
    result = await response.json()
  } catch {
    throw Object.assign(new Error('Could not reach Paystack. Check this payment status before trying again.'), { status: 502 })
  }
  if (!response.ok || !result.status) throw Object.assign(new Error('Paystack could not process this request. Check the payment status before trying again.'), { status: 502 })
  return result.data
}
function validSignature(raw, signature, key) {
  if (!key || !Buffer.isBuffer(raw) || typeof signature !== 'string' || !/^[a-f0-9]{128}$/i.test(signature)) return false
  return crypto.timingSafeEqual(crypto.createHmac('sha512', key).update(raw).digest(), Buffer.from(signature, 'hex'))
}
function matchesPayment(row, data) {
  return data?.status === 'success' && data.reference === row.reference && data.amount === row.amount_kobo && data.currency === 'NGN' && data.domain === row.mode && data.customer?.email?.toLowerCase() === row.email.toLowerCase()
}
async function settlePayment(pool, data) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await client.query('SELECT * FROM customer_payments WHERE reference = $1 FOR UPDATE', [data.reference])
    const row = result.rows[0]
    if (!row) { await client.query('COMMIT'); return null }
    if (!matchesPayment(row, data)) throw Object.assign(new Error('Payment details do not match this order.'), { status: 409 })
    if (row.status !== 'paid') {
      await client.query("UPDATE customer_payments SET status = 'paid', paid_at = NOW() WHERE reference = $1", [row.reference])
      await client.query('INSERT INTO customer_carts (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [row.user_id])
      const cartResult = await client.query('SELECT items FROM customer_carts WHERE user_id = $1 FOR UPDATE', [row.user_id])
      const cart = cartResult.rows[0].items
      for (const line of row.details.lines) {
        const remaining = Math.max(0, (cart[line.id] || 0) - line.qty)
        if (remaining) cart[line.id] = remaining
        else delete cart[line.id]
      }
      await client.query('UPDATE customer_carts SET items = $2, updated_at = NOW() WHERE user_id = $1', [row.user_id, cart])
    }
    await client.query('COMMIT')
    return paymentOrder({ ...row, status: 'paid' })
  } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
}
function paymentOrder(row) {
  return { ...row.details, reference: row.reference, status: row.status === 'paid' ? (row.delivery_status || 'Confirmed') : 'Awaiting payment', paymentStatus: row.status, paymentMode: row.mode, preview: row.mode === 'test', authorizationUrl: row.authorization_url || null }
}
module.exports = { paymentConfig, paystack, validSignature, matchesPayment, settlePayment, paymentOrder }
