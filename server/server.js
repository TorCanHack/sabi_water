const crypto = require('node:crypto')
const express = require('express')
const cors = require('cors')
const { pool, initializeDatabase } = require('./src/database')
const { hashPassword, verifyPassword } = require('./src/passwords')
const { runtimeConfig, validatePaymentCallback, logError, startupStep, installShutdown } = require('./src/runtime')

const { paymentConfig, paystack, validSignature, matchesPayment, settlePayment, paymentOrder, consumeOrderCart } = require('./src/paystack')

const { initializeTopup, settleTopup, debitWallet, walletView, topupView } = require('./src/wallet')

const { recordRefund, startRefundWorker } = require('./src/refunds')

const app = express()
const config = runtimeConfig()
const SESSION_COOKIE = 'sabi_session'
const SESSION_DAYS = 30
const AUTH_WINDOW_MS = 15 * 60 * 1000
const AUTH_ATTEMPT_LIMIT = 20
const authAttempts = new Map()
const allowedOrigins = config.origins

function businessPadiOwnerId() {
  const value = String(process.env.BUSINESS_PADI_OWNER_ID || '').trim()
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null
}

app.set('trust proxy', config.trustProxy)
app.disable('x-powered-by')
app.use(cors({ origin: allowedOrigins, credentials: true }))
app.post('/api/payments/paystack/webhook', express.raw({ type: 'application/json', limit: '100kb' }), async (request, response, next) => {
  try {
    if (!validSignature(request.body, request.get('x-paystack-signature'), paymentConfig().key)) return response.sendStatus(401)
    let event
    try { event = JSON.parse(request.body.toString('utf8')) } catch { return response.sendStatus(400) }
    if (event.event === 'charge.success') {
      if (!event.data?.reference) return response.sendStatus(400)
      if (String(event.data.reference).startsWith('WALLET-')) await settleTopup(pool, event.data)
      else await settlePayment(pool, event.data)
    }
    if (['refund.pending', 'refund.processing', 'refund.processed', 'refund.failed', 'refund.needs-attention'].includes(event.event)) {
      const reference = event.data?.transaction_reference || event.data?.transaction?.reference
      if (!reference || event.data?.status !== event.event.slice(7)) return response.sendStatus(400)
      await recordRefund(pool, reference, event.data)
    }
    response.sendStatus(200)
  } catch (error) { next(error) }
})
app.use(express.json({ limit: '20kb' }))
app.get('/api/payments/config', (_request, response) => {
  const { enabled, mode } = paymentConfig()
  response.set('Cache-Control', 'no-store').json({ enabled, mode, walletEnabled: true, businessConnected: Boolean(businessPadiOwnerId()) })
})

function limitAuthAttempts(request, response, next) {
  const now = Date.now()
  const key = request.ip
  const current = authAttempts.get(key)
  if (!current || current.resetAt <= now) {
    authAttempts.set(key, { count: 1, resetAt: now + AUTH_WINDOW_MS })
    return next()
  }
  if (current.count >= AUTH_ATTEMPT_LIMIT) {
    response.set('Retry-After', String(Math.ceil((current.resetAt - now) / 1000)))
    return response.status(429).json({ error: 'Too many attempts. Please wait a few minutes and try again.' })
  }
  current.count += 1
  next()
}

function cookieValue(request, name) {
  const cookies = request.headers.cookie?.split(';') || []
  for (const cookie of cookies) {
    const [key, ...value] = cookie.trim().split('=')
    if (key === name) return decodeURIComponent(value.join('='))
  }
  return null
}

function sessionHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function setSessionCookie(response, token) {
  response.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
  })
}

function clearSessionCookie(response) {
  response.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  })
}

async function createSession(client, userId) {
  const token = crypto.randomBytes(32).toString('base64url')
  await client.query(
    `INSERT INTO customer_sessions (token_hash, user_id, expires_at)
     VALUES ($1, $2, NOW() + ($3 * INTERVAL '1 day'))`,
    [sessionHash(token), userId, SESSION_DAYS],
  )
  return token
}

function publicUser(row) {
  return { id: String(row.id), name: row.full_name, email: row.email }
}

app.get('/api/health', async (_request, response) => {
  response.set('Cache-Control', 'no-store')
  try {
    await pool.query({ text: 'SELECT 1', query_timeout: 3000 })
    response.json({ ok: true })
  } catch {
    response.status(503).json({ ok: false })
  }
})

app.post('/api/auth/signup', limitAuthAttempts, async (request, response, next) => {
  const name = String(request.body?.name || '').trim().replace(/\s+/g, ' ')
  const email = String(request.body?.email || '').trim().toLowerCase()
  const password = String(request.body?.password || '')

  if (name.length < 2 || name.length > 100) return response.status(400).json({ error: 'Enter your full name.' })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return response.status(400).json({ error: 'Enter a valid email address.' })
  }
  if (password.length < 8 || password.length > 128) {
    return response.status(400).json({ error: 'Use a password between 8 and 128 characters.' })
  }

  const client = await pool.connect()
  try {
    const passwordHash = await hashPassword(password)
    await client.query('BEGIN')
    const result = await client.query(
      `INSERT INTO customer_users (full_name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, full_name, email`,
      [name, email, passwordHash],
    )
    const token = await createSession(client, result.rows[0].id)
    await client.query('COMMIT')
    setSessionCookie(response, token)
    response.status(201).json({ user: publicUser(result.rows[0]) })
  } catch (error) {
    await client.query('ROLLBACK')
    if (error.code === '23505') return response.status(409).json({ error: 'An account already exists for this email.' })
    next(error)
  } finally {
    client.release()
  }
})

app.post('/api/auth/signin', limitAuthAttempts, async (request, response, next) => {
  const email = String(request.body?.email || '').trim().toLowerCase()
  const password = String(request.body?.password || '')
  if (!email || !password) return response.status(400).json({ error: 'Enter your email and password.' })

  try {
    const result = await pool.query(
      `SELECT id, full_name, email, password_hash FROM customer_users WHERE email = $1`,
      [email],
    )
    const user = result.rows[0]
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return response.status(401).json({ error: 'Email or password is incorrect.' })
    }
    const token = await createSession(pool, user.id)
    setSessionCookie(response, token)
    response.json({ user: publicUser(user) })
  } catch (error) {
    next(error)
  }
})

app.get('/api/auth/me', async (request, response, next) => {
  const token = cookieValue(request, SESSION_COOKIE)
  if (!token) return response.status(401).json({ error: 'Not signed in.' })
  try {
    const result = await pool.query(
      `SELECT u.id, u.full_name, u.email
       FROM customer_sessions s JOIN customer_users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
      [sessionHash(token)],
    )
    if (!result.rows[0]) {
      clearSessionCookie(response)
      return response.status(401).json({ error: 'Your session has expired.' })
    }
    response.json({ user: publicUser(result.rows[0]) })
  } catch (error) {
    next(error)
  }
})

app.post('/api/auth/signout', async (request, response, next) => {
  const token = cookieValue(request, SESSION_COOKIE)
  try {
    if (token) await pool.query('DELETE FROM customer_sessions WHERE token_hash = $1', [sessionHash(token)])
    clearSessionCookie(response)
    response.status(204).end()
  } catch (error) {
    next(error)
  }
})

async function requireCustomer(request, response, next) {
  try {
    const token = cookieValue(request, SESSION_COOKIE)
    if (!token) return response.status(401).json({ error: 'Sign in to continue.' })
    const result = await pool.query('SELECT user_id FROM customer_sessions WHERE token_hash = $1 AND expires_at > NOW()', [sessionHash(token)])
    if (!result.rows[0]) return response.status(401).json({ error: 'Your session has expired. Please sign in again.' })
    request.customerId = result.rows[0].user_id
    next()
  } catch (error) { next(error) }
}

app.get('/api/customer/cart', requireCustomer, async (request, response, next) => {
  try {
    const result = await pool.query('SELECT items FROM customer_carts WHERE user_id = $1', [request.customerId])
    response.set('Cache-Control', 'no-store').json({ cart: result.rows[0]?.items || {}, userId: String(request.customerId) })
  } catch (error) { next(error) }
})
app.post('/api/customer/cart', requireCustomer, async (request, response, next) => {
  const { userId, operation } = request.body || {}
  if (String(userId) !== String(request.customerId)) return response.status(403).json({ error: 'Sign in to the account that owns this cart.' })
  const { products } = await import('../shared/products.mjs')
  if (!operation || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(operation.id) || !['adjust', 'replace', 'merge'].includes(operation.type) || !operation.items || typeof operation.items !== 'object' || Array.isArray(operation.items) || Object.entries(operation.items).some(([id, qty]) => !products.some(p => p.id === id) || !Number.isInteger(qty) || qty < (operation.type === 'adjust' ? -99 : 0) || qty > 99)) return response.status(400).json({ error: 'Invalid cart change.' })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('INSERT INTO customer_carts (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [request.customerId])
    const result = await client.query('SELECT items FROM customer_carts WHERE user_id = $1 FOR UPDATE', [request.customerId])
    let cart = result.rows[0].items
    const applied = await client.query('INSERT INTO customer_cart_operations (user_id, operation_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING operation_id', [request.customerId, operation.id])
    if (applied.rows.length) {
      if (operation.type === 'replace') cart = {}
      for (const [id, qty] of Object.entries(operation.items)) {
        const next = Math.max(0, Math.min(99, operation.type === 'replace' ? qty : (cart[id] || 0) + qty))
        if (next) cart[id] = next
        else delete cart[id]
      }
      await client.query('UPDATE customer_carts SET items = $2, updated_at = NOW() WHERE user_id = $1', [request.customerId, cart])
    }
    await client.query('COMMIT')
    response.set('Cache-Control', 'no-store').json({ cart })
  } catch (error) {
    await client.query('ROLLBACK')
    next(error)
  } finally { client.release() }
})

app.get('/api/customer/addresses', requireCustomer, async (request, response, next) => {
  try {
    const result = await pool.query('SELECT id, details FROM customer_addresses WHERE user_id = $1 ORDER BY updated_at DESC', [request.customerId])
    response.json({ addresses: result.rows.map(row => ({ ...row.details, id: row.id })) })
  } catch (error) { next(error) }
})
app.post('/api/customer/addresses', requireCustomer, async (request, response, next) => {
  try {
    const { validateAddress, normalizeAddress } = await import('../shared/commerce.mjs')
    const address = normalizeAddress(request.body)
    const error = validateAddress(address)
    if (error) return response.status(400).json({ error })
    const id = address.id || crypto.randomUUID()
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return response.status(400).json({ error: 'Invalid address ID.' })
    const details = Object.fromEntries(['label', 'estate', 'street', 'houseNumber', 'landmark', 'instructions'].map(key => [key, (address[key] ?? '').trim()]))
    const result = await pool.query(`INSERT INTO customer_addresses (id, user_id, details) VALUES ($1, $2, $3)
      ON CONFLICT (id) DO UPDATE SET details = EXCLUDED.details, updated_at = NOW()
      WHERE customer_addresses.user_id = $2 RETURNING id`, [id, request.customerId, details])
    if (!result.rows.length) return response.status(404).json({ error: 'Address not found.' })
    response.json({ address: { ...details, id } })
  } catch (error) { next(error) }
})
app.delete('/api/customer/addresses/:id', requireCustomer, async (request, response, next) => {
  try {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(request.params.id)) return response.status(400).json({ error: 'Invalid address ID.' })
    await pool.query('DELETE FROM customer_addresses WHERE id = $1 AND user_id = $2', [request.params.id, request.customerId])
    response.status(204).end()
  } catch (error) { next(error) }
})
app.get('/api/customer/orders', requireCustomer, async (request, response, next) => {
  try {
    const result = await pool.query('SELECT reference, details, status, cancelled_at, cancellation_reason FROM customer_preview_orders WHERE user_id = $1 ORDER BY created_at DESC', [request.customerId])
    const payments = await pool.query('SELECT * FROM customer_payments WHERE user_id = $1 ORDER BY created_at DESC', [request.customerId])
    response.set('Cache-Control', 'no-store').json({ orders: [...payments.rows.map(paymentOrder), ...result.rows.map(row => ({ ...row.details, reference: row.reference, status: row.cancelled_at ? 'Cancelled' : row.status, cancelledAt: row.cancelled_at, cancellationReason: row.cancellation_reason }))].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) })
  } catch (error) { next(error) }
})
async function buildOrder(body) {
    const { validateAddress, isCovered, validateSchedule, normalizeAddress } = await import('../shared/commerce.mjs')
    const { products } = await import('../shared/products.mjs')
    const { address, deliveryMode, scheduledAt, name, phone, items, exchange } = body || {}
    const error = validateAddress(address) || (!isCovered(address) && 'This area is outside our delivery coverage.') || validateSchedule(deliveryMode, scheduledAt)
    if (error) throw Object.assign(new Error(error), { status: 400 })
    if (typeof name !== 'string' || !name.trim() || name.length > 100 || !/^(?:0[789]\d{9}|\+234[789]\d{9})$/.test(phone)) throw Object.assign(new Error('Enter a valid recipient name and Nigerian phone number.'), { status: 400 })
    if (!Array.isArray(items) || !items.length || items.length > products.length || new Set(items.map(item => item?.id)).size !== items.length || items.some(item => !item || !products.some(p => p.id === item.id) || !Number.isInteger(item.qty) || item.qty < 1 || item.qty > 99)) throw Object.assign(new Error('Invalid cart.'), { status: 400 })
    if (items.some(item => item.id === 'exchange') && exchange !== true) throw Object.assign(new Error('Confirm your empty bottles are ready.'), { status: 400 })
    const lines = items.map(item => ({ ...products.find(p => p.id === item.id), qty: item.qty }))
    const order = { reference: `TEST-${crypto.randomUUID().toUpperCase()}`, name: name.trim(), phone, address: normalizeAddress(address), deliveryMode, scheduledAt: deliveryMode === 'later' ? new Date(scheduledAt).toISOString() : null, lines, total: lines.reduce((sum, line) => sum + line.price * line.qty, 0), status: 'Confirmed', preview: true, createdAt: new Date().toISOString() }
    return order
}
app.post('/api/customer/orders', requireCustomer, async (request, response, next) => {
  try {
    const order = await buildOrder(request.body)
    const businessId = businessPadiOwnerId()
    if (businessId) {
      order.reference = `SABI-${crypto.randomUUID()}`
      order.preview = false
      order.paymentStatus = 'unpaid'
    }
    await pool.query(
      'INSERT INTO customer_preview_orders (reference, user_id, business_user_id, details) VALUES ($1, $2, $3, $4)',
      [order.reference, request.customerId, businessId, order],
    )
    response.status(201).json({ order })
  } catch (error) { next(error) }
})

app.get('/api/customer/wallet', requireCustomer, async (request, response, next) => {
  try {
    const wallet = await walletView(pool, request.customerId, request.query.before)
    wallet.topupsEnabled = wallet.topupsEnabled && (wallet.mode !== 'live' || Boolean(businessPadiOwnerId()))
    response.set('Cache-Control', 'no-store').json({ wallet })
  }
  catch (error) { next(error) }
})
app.post('/api/customer/wallet/topups', requireCustomer, async (request, response, next) => {
  try {
    if (paymentConfig().mode === 'live' && !businessPadiOwnerId()) return response.status(503).json({ error: 'Wallet top-ups are unavailable until store fulfilment is connected.' })
    response.status(201).json({ topup: await initializeTopup(pool, request.customerId, request.body) })
  } catch (error) { next(error) }
})
app.post('/api/customer/wallet/topups/:reference/verify', requireCustomer, async (request, response, next) => {
  try {
    const result = await pool.query('SELECT * FROM customer_wallet_topups WHERE reference = $1 AND user_id = $2', [request.params.reference, request.customerId])
    const row = result.rows[0]
    if (!row) return response.status(404).json({ error: 'Top-up not found.' })
    if (row.status === 'paid') return response.json({ topup: topupView(row) })
    if (row.mode !== paymentConfig().mode) return response.status(409).json({ error: 'This top-up belongs to a different payment mode.' })
    const data = await paystack(`/transaction/verify/${encodeURIComponent(row.reference)}`)
    if (data.status !== 'success') return response.status(409).json({ error: 'Top-up payment is not confirmed yet. If you have paid, wait and check again.' })
    if (!matchesPayment(row, data)) return response.status(409).json({ error: 'Payment details do not match this wallet top-up.' })
    response.json({ topup: await settleTopup(pool, data) })
  } catch (error) { next(error) }
})

app.post('/api/customer/payments', requireCustomer, async (request, response, next) => {
  let client
  try {
    const config = paymentConfig()
    if (!config.enabled && request.body?.paymentMethod !== 'wallet') return response.status(503).json({ error: 'Online payments are not configured yet.' })
    const businessId = businessPadiOwnerId()
    if (config.mode === 'live' && !businessId) return response.status(503).json({ error: 'Business Padi order fulfilment is not configured yet.' })
    const paymentMethod = request.body?.paymentMethod || 'card'
    if (!['card', 'bank_transfer', 'ussd', 'bank', 'wallet'].includes(paymentMethod)) return response.status(400).json({ error: 'Choose a valid payment method.' })
    const checkoutId = request.body?.checkoutId
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(checkoutId)) return response.status(400).json({ error: 'Invalid checkout ID.' })
    client = await pool.connect()
    // Serialize retries before contacting Paystack, including simultaneous tabs.
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`${request.customerId}:${checkoutId}`])
    const existing = await client.query('SELECT * FROM customer_payments WHERE user_id = $1 AND checkout_id = $2', [request.customerId, checkoutId])
    if (existing.rows[0]) {
      if (existing.rows[0].mode !== config.mode || (existing.rows[0].payment_source === 'wallet') !== (paymentMethod === 'wallet')) throw Object.assign(new Error('This checkout ID belongs to a different payment method or mode.'), { status: 409 })
      await client.query('COMMIT')
      return response.json({ order: paymentOrder(existing.rows[0]) })
    }
    const order = await buildOrder(request.body)
    order.paymentMethod = paymentMethod
    order.reference = `SABI-${crypto.randomUUID()}`
    const amount = Math.round(order.total * 100)
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 2147483647) throw Object.assign(new Error('Invalid order total.'), { status: 400 })
    const customer = await client.query('SELECT email FROM customer_users WHERE id = $1', [request.customerId])
    await client.query('INSERT INTO customer_payments (reference, user_id, business_user_id, checkout_id, email, amount_kobo, mode, details, payment_source) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [order.reference, request.customerId, businessId, checkoutId, customer.rows[0].email, amount, config.mode, order, paymentMethod === 'wallet' ? 'wallet' : 'paystack'])
    if (paymentMethod === 'wallet') {
      const row = { reference: order.reference, user_id: request.customerId, amount_kobo: amount, mode: config.mode, details: order, payment_source: 'wallet' }
      await debitWallet(client, row)
      await consumeOrderCart(client, row)
      await client.query('COMMIT')
      return response.status(201).json({ order: paymentOrder({ ...row, status: 'paid' }) })
    }
    // Persist the reference before a network call so an ambiguous timeout never loses a charge.
    await client.query('COMMIT')
    const transaction = await paystack('/transaction/initialize', { reference: order.reference, amount, email: customer.rows[0].email, currency: 'NGN', channels: [paymentMethod], callback_url: config.callback })
    const url = new URL(transaction.authorization_url)
    if (url.protocol !== 'https:' || url.hostname !== 'checkout.paystack.com') throw new Error('Unexpected Paystack checkout URL.')
    const saved = await client.query('UPDATE customer_payments SET authorization_url = $2 WHERE reference = $1 RETURNING *', [order.reference, url.href])
    response.status(201).json({ order: paymentOrder(saved.rows[0]) })
  } catch (error) { if (client) await client.query('ROLLBACK'); next(error) } finally { client?.release() }
})
app.post('/api/customer/payments/:reference/verify', requireCustomer, async (request, response, next) => {
  try {
    const result = await pool.query('SELECT * FROM customer_payments WHERE reference = $1 AND user_id = $2', [request.params.reference, request.customerId])
    const row = result.rows[0]
    if (!row) return response.status(404).json({ error: 'Payment not found.' })
    if (row.status === 'paid') return response.json({ order: paymentOrder(row) })
    if (row.mode !== paymentConfig().mode) return response.status(409).json({ error: 'This payment belongs to a different payment mode. Contact support.' })
    const data = await paystack(`/transaction/verify/${encodeURIComponent(row.reference)}`)
    if (data.status !== 'success') return response.status(409).json({ error: 'Payment is not confirmed yet. If you have paid, wait a moment and check again.' })
    if (!matchesPayment(row, data)) return response.status(409).json({ error: 'Payment details do not match this order.' })
    response.json({ order: await settlePayment(pool, data) })
  } catch (error) { next(error) }
})

app.use((error, _request, response, _next) => {
  logError('request_failed', error)
  const status = Number.isInteger(error.status) && error.status >= 400 && error.status <= 599 ? error.status : 500
  response.status(status).json({ error: status < 500 ? error.message : 'Something went wrong. Please try again.' })
})

async function start() {
  await startupStep('payment_configuration', () => {
    const payment = paymentConfig()
    validatePaymentCallback(payment, config.origins)
  })
  await startupStep('database_initialization', initializeDatabase)
  await startupStep('session_cleanup', () => pool.query('DELETE FROM customer_sessions WHERE expires_at <= NOW()'))
  const server = await startupStep('http_listen', () => new Promise((resolve, reject) => {
    const listener = app.listen(config.port, config.host, () => resolve(listener))
    listener.once('error', reject)
  }))
  const stopWorker = startRefundWorker(pool)
  installShutdown(server, pool, stopWorker)
  console.log(`Sabi Water API listening on ${config.host}:${config.port}`)
  return server
}

if (require.main === module) {
  start().catch((error) => {
    logError('startup_failed', error)
    process.exitCode = 1
    void pool.end()
  })
}

module.exports = { app, start }
