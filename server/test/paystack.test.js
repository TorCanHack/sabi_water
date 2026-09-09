const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { validSignature, matchesPayment, paymentConfig, paymentOrder } = require('../src/paystack')

test('webhook signatures authenticate the exact payload and reject malformed signatures', () => {
  const raw = Buffer.from('{"event":"charge.success"}')
  const signature = crypto.createHmac('sha512', 'secret').update(raw).digest('hex')
  assert.equal(validSignature(raw, signature, 'secret'), true)
  for (const sig of [undefined, '', 'xyz', 'a'.repeat(128)]) assert.equal(validSignature(raw, sig, 'secret'), false)
  assert.equal(validSignature(Buffer.from('{}'), signature, 'secret'), false)
  assert.equal(validSignature(raw, signature, ''), false)
})
test('payment verification checks reference, amount, currency, customer, mode and success', () => {
  const row = { reference: 'SABI-123', amount_kobo: 10000, email: 'buyer@example.com', mode: 'live' }
  const data = { reference: row.reference, amount: 10000, currency: 'NGN', customer: { email: row.email }, domain: 'live', status: 'success' }
  assert.equal(matchesPayment(row, data), true)
  for (const change of [{ reference: 'other' }, { amount: 100 }, { amount: '10000' }, { currency: 'USD' }, { domain: 'test' }, { status: 'failed' }, { customer: { email: 'other@example.com' } }]) assert.equal(matchesPayment(row, { ...data, ...change }), false)
})
test('payment mode is independent of NODE_ENV and rejects mismatched keys', () => {
  const previous = { ...process.env }
  try {
    process.env.NODE_ENV = 'development'
    process.env.PAYSTACK_MODE = 'live'
    process.env.PAYSTACK_SECRET_KEY = 'sk_live_fake'
    assert.equal(paymentConfig().mode, 'live')
    process.env.PAYSTACK_SECRET_KEY = 'sk_test_fake'
    assert.throws(paymentConfig, /does not match/)
  } finally { process.env = previous }
})
test('checkout, ownership, webhook and callback are idempotent', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
  process.env.PAYSTACK_MODE = 'test'
  process.env.PAYSTACK_SECRET_KEY = 'sk_test_fake'
  const { pool, initializeDatabase } = require('../src/database')
  const { app } = require('../server')
  await initializeDatabase()
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  const base = `http://127.0.0.1:${server.address().port}/api`
  const originalFetch = global.fetch
  let initialized = 0, payment, failInitialize = false
  global.fetch = async (url, options) => {
    if (String(url).startsWith('https://api.paystack.co')) {
      if (String(url).endsWith('/initialize')) {
        initialized++
        if (failInitialize) throw new Error('Simulated network timeout')
        const body = JSON.parse(options.body)
        payment = { ...body, domain: 'test', status: 'success', customer: { email: body.email } }
        return Response.json({ status: true, data: { authorization_url: 'https://checkout.paystack.com/test-code' } })
      }
      return Response.json({ status: true, data: payment })
    }
    return originalFetch(url, options)
  }
  const ids = []
  async function request(path, cookie, body) {
    const response = await fetch(`${base}${path}`, { method: body ? 'POST' : 'GET', headers: { ...(cookie ? { Cookie: cookie } : {}), 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
    return { status: response.status, body: await response.json().catch(() => null), cookie: response.headers.getSetCookie()[0]?.split(';')[0] }
  }
  async function signup() {
    const result = await request('/auth/signup', null, { name: 'Payment Test', email: `${crypto.randomUUID()}@example.com`, password: 'test-password-123' })
    ids.push(result.body.user.id)
    return result
  }
  async function webhook(data, signature) {
    const body = JSON.stringify({ event: 'charge.success', data })
    return fetch(`${base}/payments/paystack/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-paystack-signature': signature || crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY).update(body).digest('hex') }, body })
  }
  try {
    const one = await signup(), two = await signup()
    await request('/customer/cart', one.cookie, { userId: ids[0], operation: { id: crypto.randomUUID(), type: 'replace', items: { cway: 5 } } })
    const { emptyAddress } = await import('../../shared/commerce.mjs')
    const payload = { paymentMethod: 'bank_transfer', checkoutId: crypto.randomUUID(), name: 'Payment Test', phone: '08012345678', address: { ...emptyAddress(), street: 'Water St', houseNumber: '4' }, deliveryMode: 'now', items: [{ id: 'cway', qty: 2 }], total: 1 }
    assert.equal((await request('/customer/payments', null, payload)).status, 401)
    assert.equal((await request('/customer/payments', one.cookie, { ...payload, paymentMethod: 'invalid' })).status, 400)
    assert.equal(initialized, 0)
    const results = await Promise.all([request('/customer/payments', one.cookie, payload), request('/customer/payments', one.cookie, payload)])
    const order = results[0].body.order
    assert.equal(order.reference, results[1].body.order.reference)
    assert.equal(initialized, 1)
    assert.equal(order.paymentStatus, 'pending')
    assert.deepEqual(payment.channels, ['bank_transfer'])
    assert.equal(order.paymentMethod, 'bank_transfer')
    assert.equal(payment.amount, order.total * 100)
    assert.notEqual(order.total, 1)
    const verify = `/customer/payments/${order.reference}/verify`
    assert.equal((await request(verify, two.cookie, {})).status, 404)
    payment.status = 'failed'
    assert.equal((await request(verify, one.cookie, {})).status, 409)
    payment.status = 'success'
    assert.equal((await webhook(payment, 'a'.repeat(128))).status, 401)
    assert.equal((await webhook({ ...payment, amount: 1 })).status, 409)
    assert.deepEqual((await request('/customer/cart', one.cookie)).body.cart, { cway: 5 })
    await Promise.all([webhook(payment), webhook(payment), request(verify, one.cookie, {})])
    assert.equal((await request(verify, one.cookie, {})).body.order.paymentStatus, 'paid')
    assert.deepEqual((await request('/customer/cart', one.cookie)).body.cart, { cway: 3 })
    assert.equal((await request('/customer/orders', two.cookie)).body.orders.length, 0)
    assert.equal((await request('/customer/orders', one.cookie)).body.orders[0].status, 'Confirmed')
    const { updateDelivery } = require('../src/delivery')
    await assert.rejects(updateDelivery(pool, order.reference, 'Delivered'), /one stage/)
    await assert.rejects(updateDelivery(pool, order.reference, 'Invalid'), /Invalid delivery/)
    for (const stage of ['Getting a dispatch', 'Out for delivery', 'Delivered']) {
      assert.equal((await updateDelivery(pool, order.reference, stage)).status, stage)
      assert.equal((await updateDelivery(pool, order.reference, stage)).status, stage)
      await webhook(payment)
      assert.equal((await request(verify, one.cookie, {})).body.order.status, stage)
      assert.equal((await request('/customer/orders', one.cookie)).body.orders.find(item => item.reference === order.reference).status, stage)
    }
    await assert.rejects(updateDelivery(pool, order.reference, 'Confirmed'), /one stage/)
    assert.equal((await request(`/customer/orders/${order.reference}`, one.cookie, { status: 'Confirmed' })).status, 404)
    failInitialize = true
    const retryPayload = { ...payload, checkoutId: crypto.randomUUID() }
    assert.equal((await request('/customer/payments', one.cookie, retryPayload)).status, 502)
    const retry = await request('/customer/payments', one.cookie, retryPayload)
    assert.equal(retry.body.order.paymentStatus, 'pending')
    assert.equal(retry.body.order.authorizationUrl, null)
    await assert.rejects(updateDelivery(pool, retry.body.order.reference, 'Getting a dispatch'), /Confirm payment/)
    assert.equal(initialized, 2, 'An ambiguous initialization is not issued twice')
    assert.deepEqual((await request('/customer/cart', one.cookie)).body.cart, { cway: 3 })
  } finally {
    global.fetch = originalFetch
    for (const id of ids) {
      await pool.query('DELETE FROM customer_payments WHERE user_id = $1', [id])
      await pool.query('DELETE FROM customer_users WHERE id = $1', [id])
    }
    await new Promise(resolve => server.close(resolve))
    await pool.end()
  }
})

test('paid orders show their delivery stage while pending payments never show confirmation', () => {
  const row = { reference: 'SABI-test', mode: 'test', details: {} }
  assert.equal(paymentOrder({ ...row, status: 'paid' }).status, 'Confirmed')
  for (const delivery_status of ['Confirmed', 'Getting a dispatch', 'Out for delivery', 'Delivered']) {
    assert.equal(paymentOrder({ ...row, status: 'paid', delivery_status }).status, delivery_status)
    assert.equal(paymentOrder({ ...row, status: 'pending', delivery_status }).status, 'Awaiting payment')
  }
})
