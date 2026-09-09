const { paymentOrder } = require('./paystack')

async function updateDelivery(pool, reference, nextStatus) {
  const { STATUSES } = await import('../../shared/commerce.mjs')
  if (!STATUSES.includes(nextStatus)) throw Object.assign(new Error('Invalid delivery status.'), { status: 400 })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await client.query('SELECT * FROM customer_payments WHERE reference = $1 FOR UPDATE', [reference])
    const row = result.rows[0]
    if (!row) throw Object.assign(new Error('Order not found.'), { status: 404 })
    if (row.cancelled_at) throw Object.assign(new Error('Cancelled orders cannot be dispatched.'), { status: 409 })
    if (row.status !== 'paid') throw Object.assign(new Error('Confirm payment before updating delivery.'), { status: 409 })
    const current = row.delivery_status || 'Confirmed'
    if (nextStatus !== current && STATUSES.indexOf(nextStatus) !== STATUSES.indexOf(current) + 1) {
      throw Object.assign(new Error('Delivery must move forward one stage at a time.'), { status: 409 })
    }
    await client.query('UPDATE customer_payments SET delivery_status = $2 WHERE reference = $1', [reference, nextStatus])
    await client.query('COMMIT')
    return paymentOrder({ ...row, delivery_status: nextStatus })
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally { client.release() }
}
module.exports = { updateDelivery }
