const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const path = require('node:path')

test('wallet top-ups, concurrent spending, ownership and refunds', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
  process.env.PAYSTACK_MODE = 'test'
  process.env.PAYSTACK_SECRET_KEY = 'sk_test_wallet_mock'
  process.env.BUSINESS_PADI_OWNER_ID = crypto.randomUUID()
  const { pool, initializeDatabase } = require('../src/database')
  const { app } = require('../server')
  const { recordRefund, processRefunds } = require('../src/refunds')
  const { settlePayment } = require('../src/paystack')
  const { cancelOrder } = require(path.join(process.env.BUSINESS_PADI_DIR || path.resolve(__dirname, '../../../business_padi'), 'server/lib/cancelOrder'))
  await initializeDatabase()
  await initializeDatabase()
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  const base = `http://127.0.0.1:${server.address().port}/api`
  const originalFetch = global.fetch
  const payments = new Map()
  let initializes = 0, failInitialize = false, wrongAmount = false
  global.fetch = async (url, options) => {
    if (!String(url).startsWith('https://api.paystack.co')) return originalFetch(url, options)
    if (String(url).endsWith('/initialize')) {
      initializes++
      const data = JSON.parse(options.body)
      payments.set(data.reference, { ...data, id: initializes, domain: process.env.PAYSTACK_MODE, status: 'success', customer: { email: data.email } })
      if (failInitialize) throw new Error('Simulated lost response')
      return Response.json({ status: true, data: { authorization_url: 'https://checkout.paystack.com/wallet-test' } })
    }
    if (String(url).includes('/verify/')) {
      const data = payments.get(decodeURIComponent(String(url).split('/').pop()))
      return Response.json({ status: true, data: wrongAmount ? { ...data, amount: 1 } : data })
    }
    throw new Error(`Unexpected Paystack request: ${url}`)
  }
  const ids = []
  async function request(route, cookie, body) {
    const response = await fetch(`${base}${route}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    return { status: response.status, body: await response.json().catch(() => null), cookie: response.headers.getSetCookie()[0]?.split(';')[0] }
  }
  async function signup() {
    const result = await request('/auth/signup', null, { name: 'Wallet Test', email: `${crypto.randomUUID()}@example.com`, password: 'wallet-password-123' })
    assert.equal(result.status, 201)
    ids.push(result.body.user.id)
    return result
  }
  async function webhook(data, signature) {
    const body = JSON.stringify({ event: 'charge.success', data })
    return fetch(`${base}/payments/paystack/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-paystack-signature': signature || crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY).update(body).digest('hex') }, body })
  }
  const balance = async cookie => (await request('/customer/wallet', cookie)).body.wallet
  try {
    const one = await signup(), two = await signup()
    assert.equal((await request('/customer/wallet')).status, 401)
    assert.equal((await request('/customer/wallet/topups', null, {})).status, 401)
    assert.equal((await request('/customer/wallet/topups/unknown/verify', null, {})).status, 401)
    assert.equal((await balance(one.cookie)).balanceKobo, 0)
    for (const amountKobo of [0, -10000, 9999, 100000001, '10000', 10000.5, null]) {
      assert.equal((await request('/customer/wallet/topups', one.cookie, { amountKobo, checkoutId: crypto.randomUUID() })).status, 400)
    }
    assert.equal((await request('/customer/wallet/topups', one.cookie, { amountKobo: 10000, checkoutId: 'bad' })).status, 400)
    assert.equal(initializes, 0)
    const { products } = await import('../../shared/products.mjs')
    const amount = Math.round(products.find(item => item.id === 'cway').price * 100)
    const payload = { amountKobo: amount * 2, checkoutId: crypto.randomUUID() }
    const starts = await Promise.all([request('/customer/wallet/topups', one.cookie, payload), request('/customer/wallet/topups', one.cookie, payload)])
    const topup = starts[0].body.topup
    assert.equal(starts[1].body.topup.reference, topup.reference)
    assert.equal(initializes, 1)
    assert.equal((await balance(one.cookie)).balanceKobo, 0, 'Unconfirmed payment has no spendable value')
    assert.equal((await request('/customer/wallet/topups', one.cookie, { ...payload, amountKobo: payload.amountKobo + 1 })).status, 409)
    const verify = `/customer/wallet/topups/${topup.reference}/verify`
    assert.equal((await request(verify, two.cookie, {})).status, 404)
    wrongAmount = true
    assert.equal((await request(verify, one.cookie, {})).status, 409)
    wrongAmount = false
    assert.equal((await balance(one.cookie)).balanceKobo, 0)
    assert.equal((await webhook(payments.get(topup.reference), '0'.repeat(128))).status, 401)
    const settled = await Promise.all([webhook(payments.get(topup.reference)), webhook(payments.get(topup.reference)), request(verify, one.cookie, {})])
    assert.deepEqual(settled.map(result => result.status), [200, 200, 200])
    assert.equal((await balance(one.cookie)).balanceKobo, amount * 2)
    assert.equal((await balance(one.cookie)).entries.length, 1)
    assert.equal((await balance(one.cookie)).pendingTopups.length, 0)
    assert.equal((await balance(two.cookie)).entries.length, 0)
    const { emptyAddress } = await import('../../shared/commerce.mjs')
    const orderBody = { paymentMethod: 'wallet', checkoutId: crypto.randomUUID(), name: 'Wallet Test', phone: '08012345678', address: { ...emptyAddress(), street: 'Test St', houseNumber: '2' }, deliveryMode: 'now', items: [{ id: 'cway', qty: 1 }], total: 1 }
    const cartSaved = await request('/customer/cart', one.cookie, { userId: ids[0], operation: { id: crypto.randomUUID(), type: 'replace', items: { cway: 5 } } })
    assert.equal(cartSaved.status, 200)
    const orders = await Promise.all([request('/customer/payments', one.cookie, orderBody), request('/customer/payments', one.cookie, orderBody)])
    const order = orders[0].body.order
    assert.equal(order.paymentSource, 'wallet')
    assert.equal(order.paymentStatus, 'paid')
    assert.equal(order.total * 100, amount)
    assert.equal(orders[1].body.order.reference, order.reference)
    assert.equal((await balance(one.cookie)).balanceKobo, amount)
    assert.deepEqual((await request('/customer/cart', one.cookie)).body.cart, { cway: 4 })
    assert.equal(initializes, 1, 'Wallet checkout does not charge Paystack')
    const concurrent = await Promise.all([request('/customer/payments', one.cookie, { ...orderBody, checkoutId: crypto.randomUUID() }), request('/customer/payments', one.cookie, { ...orderBody, checkoutId: crypto.randomUUID() })])
    assert.deepEqual(concurrent.map(result => result.status).sort(), [201, 409])
    assert.equal((await balance(one.cookie)).balanceKobo, 0)
    assert.equal((await request('/customer/orders', one.cookie)).body.orders.length, 2, 'Insufficient funds roll back the order')
    const paymentRow = (await pool.query('SELECT * FROM customer_payments WHERE reference=$1', [order.reference])).rows[0]
    await assert.rejects(settlePayment(pool, { reference: order.reference }), /Wallet orders/)
    await Promise.all([cancelOrder(pool, order.reference, process.env.BUSINESS_PADI_OWNER_ID, 'No stock available'), cancelOrder(pool, order.reference, process.env.BUSINESS_PADI_OWNER_ID, 'No stock available')])
    assert.equal((await balance(one.cookie)).balanceKobo, amount)
    assert.equal((await balance(one.cookie)).entries.filter(entry => entry.kind === 'refund').length, 1)
    const cancelled = (await request('/customer/orders', one.cookie)).body.orders.find(item => item.reference === order.reference)
    assert.equal(cancelled.status, 'Cancelled')
    assert.equal(cancelled.refundStatus, 'processed')
    assert.equal(await recordRefund(pool, order.reference, { transaction_reference: order.reference, amount: paymentRow.amount_kobo, currency: 'NGN', domain: 'test', status: 'processed' }), false)
    await processRefunds(pool, () => { throw new Error('Wallet refunds must not go to Paystack') })
    process.env.PAYSTACK_MODE = 'live'; process.env.PAYSTACK_SECRET_KEY = 'sk_live_mock'
    assert.equal((await balance(one.cookie)).balanceKobo, 0)
    assert.equal((await balance(one.cookie)).entries.length, 0)
    assert.equal((await request('/customer/payments', one.cookie, { ...orderBody, checkoutId: crypto.randomUUID() })).status, 409)
    process.env.PAYSTACK_MODE = 'test'; process.env.PAYSTACK_SECRET_KEY = 'sk_test_wallet_mock'
    assert.equal((await balance(one.cookie)).balanceKobo, amount)
    failInitialize = true
    const lost = { checkoutId: crypto.randomUUID(), amountKobo: 10000 }
    assert.equal((await request('/customer/wallet/topups', one.cookie, lost)).status, 502)
    const retry = await request('/customer/wallet/topups', one.cookie, lost)
    assert.equal(initializes, 2, 'Lost initialization is not sent again')
    assert.equal(retry.body.topup.authorizationUrl, null)
    await request(`/customer/wallet/topups/${retry.body.topup.reference}/verify`, one.cookie, {})
    assert.equal((await balance(one.cookie)).balanceKobo, amount + 10000)
    const ledger = await pool.query('SELECT SUM(amount_kobo)::bigint AS total FROM customer_wallet_entries WHERE user_id=$1 AND mode=$2', [ids[0], 'test'])
    assert.equal(Number(ledger.rows[0].total), (await balance(one.cookie)).balanceKobo)
    assert.equal((await request('/customer/wallet?before=invalid', one.cookie)).status, 400)
    const firstEntries = (await balance(one.cookie)).entries
    const older = (await request(`/customer/wallet?before=${firstEntries[1].id}`, one.cookie)).body.wallet.entries
    assert.ok(older.every(entry => BigInt(entry.id) < BigInt(firstEntries[1].id)))
  } finally {
    global.fetch = originalFetch
    for (const id of ids) {
      await pool.query('DELETE FROM customer_payments WHERE user_id=$1', [id])
      await pool.query('DELETE FROM customer_users WHERE id=$1', [id])
    }
    await new Promise(resolve => server.close(resolve))
    await pool.end()
  }
})
