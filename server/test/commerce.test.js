const test = require('node:test')
const assert = require('node:assert/strict')

test('coverage, address validation, scheduling and product search', async () => {
  const { ESTATE, emptyAddress, normalizeAddress, isCovered, validateAddress, validateSchedule, matchesProduct } = await import('../../shared/commerce.mjs')
  const address = { ...emptyAddress(), estate: ESTATE, street: 'Water Street', houseNumber: '4' }
  assert.equal(validateAddress(address), '')
  assert.equal(validateAddress({ ...address, street: '   ' }), 'Enter a street.')
  for (const estate of ['', '   ', undefined, null]) {
    const legacyAddress = { ...address, estate }
    assert.equal(validateAddress(legacyAddress), '')
    assert.equal(isCovered(legacyAddress), true)
    assert.equal(normalizeAddress(legacyAddress).estate, ESTATE)
    assert.equal(normalizeAddress(legacyAddress).street, address.street)
  }
  assert.equal(validateAddress({ label: 'Home', street: 'Water Street', houseNumber: '4' }), '')
  assert.equal(validateAddress({ ...address, label: ' ' }), 'Enter an address label.')
  assert.equal(validateAddress({ ...address, houseNumber: '' }), 'Enter a house / office number.')
  assert.equal(isCovered(address), true)
  assert.equal(isCovered(null), false)
  assert.equal(isCovered({ ...address, estate: 'Other estate' }), false)
  assert.equal(isCovered({ ...address, estate: 'Galadimawa' }), false)
  const now = Date.parse('2026-09-07T12:00:00Z')
  assert.equal(validateSchedule('later', '2026-09-07T13:00:00+01:00', now), 'Choose a future delivery date and time.')
  assert.equal(validateSchedule('later', 'invalid', now), 'Choose a future delivery date and time.')
  assert.equal(validateSchedule('later', '2026-09-07T14:00:00+01:00', now), '')
  assert.equal(validateSchedule('now', null, now), '')
  const { products } = await import('../../front_end/src/data/products.js')
  assert.equal(products.filter(p => matchesProduct(p, 'nestle 60 cl')).length, 1)
  assert.equal(products.filter(p => matchesProduct(p, '75cl CWAY')).length, 1)
  assert.equal(products.filter(p => matchesProduct(p, 'unknown')).length, 0)
})

test('customer address and preview order API', { skip: !process.env.TEST_DATABASE_URL }, async t => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
  const { pool, initializeDatabase } = require('../src/database')
  const { app } = require('../server')
  await initializeDatabase()
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  const base = `http://127.0.0.1:${server.address().port}/api`
  const emails = []
  async function request(path, cookie, body, method = body ? 'POST' : 'GET') {
    const response = await fetch(`${base}${path}`, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
    return { status: response.status, body: await response.json().catch(() => null), cookie: response.headers.getSetCookie()[0]?.split(';')[0] }
  }
  async function signup() {
    const email = `delivery-test-${crypto.randomUUID()}@example.com`
    emails.push(email)
    const result = await request('/auth/signup', null, { name: 'Delivery Test', email, password: 'Test-delivery-password' })
    assert.equal(result.status, 201)
    return result.cookie
  }
  try {
    const one = await signup(), two = await signup()
    await t.test('cart recovers across sessions, merges once and remains private', async () => {
      const me = await request('/auth/me', one)
      const userId = me.body.user.id
      const operation = { id: crypto.randomUUID(), type: 'merge', items: { cway: 2 } }
      assert.equal((await request('/customer/cart')).status, 401)
      assert.equal((await request('/customer/cart', one, { userId, operation })).status, 200)
      await request('/customer/cart', one, { userId, operation })
      const phone = await request('/auth/signin', null, { email: emails[0], password: 'Test-delivery-password' })
      assert.equal(phone.status, 200)
      assert.deepEqual((await request('/customer/cart', phone.cookie)).body.cart, { cway: 2 })
      await Promise.all([one, phone.cookie].map(cookie => request('/customer/cart', cookie, { userId, operation: { id: crypto.randomUUID(), type: 'adjust', items: { cway: 1 } } })))
      assert.deepEqual((await request('/customer/cart', phone.cookie)).body.cart, { cway: 4 })
      assert.deepEqual((await request('/customer/cart', two)).body.cart, {})
      assert.equal((await request('/customer/cart', two, { userId, operation })).status, 403)
      assert.equal((await request('/customer/cart', one, { userId, operation: { id: crypto.randomUUID(), type: 'replace', items: { cway: 100 } } })).status, 400)
      await request('/auth/signout', phone.cookie, null, 'POST')
      const replacement = await request('/auth/signin', null, { email: emails[0], password: 'Test-delivery-password' })
      assert.deepEqual((await request('/customer/cart', replacement.cookie)).body.cart, { cway: 4 })
      await request('/customer/cart', replacement.cookie, { userId, operation: { id: crypto.randomUUID(), type: 'replace', items: {} } })
      assert.deepEqual((await request('/customer/cart', one)).body.cart, {})
    })
    const { ESTATE, emptyAddress } = await import('../../shared/commerce.mjs')
    const address = { ...emptyAddress(), label: 'Office', estate: ESTATE, street: 'Water Street', houseNumber: '4', landmark: 'Blue gate', instructions: 'Ring the bell' }
    let saved
    await t.test('requires authentication and saves structured addresses', async () => {
      assert.equal((await request('/customer/addresses')).status, 401)
      const result = await request('/customer/addresses', one, address)
      assert.equal(result.status, 200)
      saved = result.body.address
      assert.equal(saved.instructions, 'Ring the bell')
      assert.equal((await request('/customer/addresses', one)).body.addresses.length, 1)
    })
    await t.test('prevents cross-customer address reads, updates and deletion', async () => {
      assert.equal((await request('/customer/addresses', two)).body.addresses.length, 0)
      assert.equal((await request('/customer/addresses', two, { ...saved, label: 'Stolen' })).status, 404)
      await request(`/customer/addresses/${saved.id}`, two, null, 'DELETE')
      assert.equal((await request('/customer/addresses', one)).body.addresses[0].label, 'Office')
    })
    const payload = { address: saved, name: 'Delivery Test', phone: '08012345678', deliveryMode: 'later', scheduledAt: new Date(Date.now() + 86400000).toISOString(), items: [{ id: 'cway', qty: 3 }] }
    let order
    await t.test('rejects unsupported coverage, past schedules and invalid quantities', async () => {
      for (const body of [{ ...payload, address: { ...saved, estate: 'Other estate' } }, { ...payload, scheduledAt: '2000-01-01' }, { ...payload, items: [{ id: 'cway', qty: -1 }] }, { ...payload, items: [{ id: 'exchange', qty: 1 }] }]) {
        assert.equal((await request('/customer/orders', one, body)).status, 400)
      }
    })
    await t.test('persists immutable snapshots and calculates prices on the server', async () => {
      const result = await request('/customer/orders', one, { ...payload, total: 1 })
      assert.equal(result.status, 201)
      order = result.body.order
      assert.equal(order.total, 6600)
      assert.equal(order.status, 'Confirmed')
      assert.equal(order.scheduledAt, payload.scheduledAt)
      await request('/customer/addresses', one, { ...saved, street: 'New Street' })
      const orders = (await request('/customer/orders', one)).body.orders
      assert.equal(orders[0].address.street, 'Water Street')
      assert.equal((await request('/customer/orders', two)).body.orders.length, 0)
    })
    await t.test('checkout accepts legacy addresses without an estate and saves the delivery area', async () => {
      for (const estate of ['', undefined, null]) {
        const result = await request('/customer/orders', one, { ...payload, address: { ...saved, estate } })
        assert.equal(result.status, 201)
        assert.equal(result.body.order.address.estate, ESTATE)
      }
    })
    await t.test('reads current status without allowing customer status mutation', async () => {
      await pool.query("UPDATE customer_preview_orders SET status = 'Out for Delivery' WHERE reference = $1", [order.reference])
      assert.equal((await request('/customer/orders', one)).body.orders.find(item => item.reference === order.reference).status, 'Out for Delivery')
      assert.equal((await request(`/customer/orders/${order.reference}`, one, { status: 'Delivered' }, 'PATCH')).status, 404)
      await request(`/customer/addresses/${saved.id}`, one, null, 'DELETE')
      assert.equal((await request('/customer/addresses', one)).body.addresses.length, 0)
    })
    await t.test('saves completed addresses without the removed estate field', async () => {
      for (const estate of ['', undefined]) {
        const result = await request('/customer/addresses', one, { label: 'Home', street: 'Water Street', houseNumber: '4', estate })
        assert.equal(result.status, 200)
        assert.equal(result.body.address.estate, ESTATE)
        assert.equal(result.body.address.landmark, '')
        assert.equal(result.body.address.instructions, '')
      }
    })
  } finally {
    await new Promise(resolve => server.close(resolve))
    await pool.query('DELETE FROM customer_users WHERE email = ANY($1)', [emails])
    await pool.end()
  }
})
