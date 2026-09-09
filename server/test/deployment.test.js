const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { runtimeConfig, validatePaymentCallback, logError, installShutdown } = require('../src/runtime')
const { databaseConfig } = require('../src/databaseConfig')
const { spawnSync } = require('node:child_process')
const path = require('node:path')

test('deployment configuration supports direct hosting and trusted production proxies', () => {
  assert.equal(runtimeConfig({}).trustProxy, 0)
  assert.deepEqual(runtimeConfig({ NODE_ENV: 'production', FRONTEND_URL: 'https://shop.example.com', PORT: '10000', TRUST_PROXY: '1' }), {
    host: '0.0.0.0', port: 10000, trustProxy: 1, origins: ['https://shop.example.com'],
  })
  assert.throws(() => runtimeConfig({ NODE_ENV: 'production' }), /Set FRONTEND_URL/)
  assert.throws(() => runtimeConfig({ FRONTEND_URL: 'https://shop.example.com/' }), /origins/)
  assert.throws(() => runtimeConfig({ PORT: 'invalid' }), /PORT/)
  assert.throws(() => runtimeConfig({ TRUST_PROXY: 'true' }), /TRUST_PROXY/)
})

test('production allows explicit loopback frontend testing but rejects public HTTP origins', () => {
  for (const origin of ['http://localhost:5174', 'http://127.0.0.1:5174', 'http://[::1]:5174']) {
    assert.deepEqual(runtimeConfig({ NODE_ENV: 'production', FRONTEND_URL: origin }).origins, [origin])
  }
  for (const origin of ['http://shop.example.com', 'http://localhost.example.com', 'http://192.168.1.2:5174']) {
    assert.throws(() => runtimeConfig({ NODE_ENV: 'production', FRONTEND_URL: origin }), /HTTPS/)
  }
})

test('HTTP loopback payment returns require test mode and a configured frontend origin', () => {
  const env = { NODE_ENV: 'production' }
  const origins = ['http://localhost:5174']
  const payment = { enabled: true, mode: 'test', callback: 'http://localhost:5174/?payment=return' }
  assert.doesNotThrow(() => validatePaymentCallback(payment, origins, env))
  assert.throws(() => validatePaymentCallback({ ...payment, mode: 'live' }, origins, env), /HTTPS/)
  assert.throws(() => validatePaymentCallback(payment, [], env), /HTTPS/)
  assert.throws(() => validatePaymentCallback({ ...payment, callback: 'http://example.com' }, origins, env), /HTTPS/)
  assert.doesNotThrow(() => validatePaymentCallback({ ...payment, mode: 'live', callback: 'https://shop.example.com/?payment=return' }, origins, env))
})

test('database TLS verifies certificates and rejects conflicting configuration', () => {
  const config = databaseConfig({ DATABASE_URL: 'postgresql://localhost/sabi', DATABASE_SSL: 'true', DATABASE_CA_CERT: 'first\\nsecond' })
  assert.deepEqual(config.ssl, { rejectUnauthorized: true, ca: 'first\nsecond' })
  assert.equal(config.connectionTimeoutMillis, 3000)
  assert.equal(databaseConfig({ PGHOST: 'localhost', DATABASE_SSL: 'false' }).ssl, false)
  assert.equal(databaseConfig({ PGHOST: 'database.example.com' }).ssl.rejectUnauthorized, true)
  assert.equal(databaseConfig({ DATABASE_URL: 'postgresql://localhost/sabi?sslmode=verify-full' }).ssl, undefined)
  assert.throws(() => databaseConfig({ DATABASE_URL: 'postgresql://localhost/sabi?sslmode=require', DATABASE_SSL: 'true' }), /not both/)
  assert.throws(() => databaseConfig({ DATABASE_POOL_MAX: '-1' }), /positive/)
  assert.throws(() => databaseConfig({ DATABASE_URL: 'private-password' }), error => {
    assert.equal(error.message, 'DATABASE_URL must be a valid PostgreSQL URL.')
    assert.equal(error.input, undefined)
    return true
  })
})

test('error logging never serializes sensitive error details', t => {
  const entries = []
  t.mock.method(console, 'error', line => entries.push(JSON.parse(line)))
  logError('request_failed', { code: '23505', message: 'secret-password', detail: 'customer@example.com', stack: 'secret-stack' })
  logError('startup_failed', { code: 'postgres://private:password@database' })
  assert.deepEqual(entries, [
    { event: 'request_failed', code: '23505' },
    { event: 'startup_failed', code: 'UNEXPECTED_ERROR' },
  ])
})

test('failed startup identifies configuration problems without disclosing credentials', () => {
  const baseEnv = { NODE_ENV: 'production', FRONTEND_URL: 'https://shop.example.com', PAYSTACK_MODE: 'test' }
  const cases = [
    { env: {}, stage: 'database_initialization', code: 'DATABASE_CONFIG_MISSING' },
    { env: { PAYSTACK_SECRET_KEY: 'sk_test_do_not_print' }, stage: 'payment_configuration', code: 'PAYSTACK_CALLBACK_HTTPS_REQUIRED' },
    { env: { PAYSTACK_SECRET_KEY: 'sk_live_do_not_print' }, stage: 'payment_configuration', code: 'PAYSTACK_KEY_MODE_MISMATCH' },
    { env: { PAYSTACK_CALLBACK_URL: 'invalid-do-not-print' }, stage: 'payment_configuration', code: 'PAYSTACK_CALLBACK_INVALID' },
  ]
  for (const scenario of cases) {
    // No .env loading or inherited database/payment credentials in these children.
    const result = spawnSync(process.execPath, [path.join(__dirname, '..', 'server.js')], {
      env: { ...baseEnv, ...scenario.env }, encoding: 'utf8', timeout: 5000,
    })
    assert.equal(result.status, 1, result.stderr)
    const stages = result.stdout.trim().split('\n').map(line => JSON.parse(line))
    assert.equal(stages.at(-1).stage, scenario.stage)
    const failure = JSON.parse(result.stderr.trim())
    assert.equal(failure.event, 'startup_failed')
    assert.equal(failure.code, scenario.code)
    assert.ok(failure.hint)
    assert.doesNotMatch(result.stdout + result.stderr, /do_not_print|do-not-print/)
  }
})

test('shutdown waits for requests and refund work before closing the pool, once', async () => {
  const events = []
  let finishRequest, finishWorker
  const server = { close(callback) { events.push('stop-http'); finishRequest = callback } }
  const pool = { async end() { events.push('close-db') } }
  const worker = () => { events.push('stop-worker'); return new Promise(resolve => { finishWorker = resolve }) }
  const processRef = new EventEmitter()
  processRef.exit = () => assert.fail('Shutdown should not force exit')
  const shutdown = installShutdown(server, pool, worker, processRef)
  processRef.emit('SIGTERM')
  const pending = shutdown()
  assert.equal(shutdown(), pending)
  finishRequest()
  await Promise.resolve()
  assert.deepEqual(events, ['stop-http', 'stop-worker'])
  finishWorker()
  await pending
  assert.deepEqual(events, ['stop-http', 'stop-worker', 'close-db'])
  assert.equal(processRef.exitCode, 0)
  assert.equal(processRef.listenerCount('SIGTERM'), 0)
})

test('shutdown forces a failed exit when work cannot drain', async () => {
  const processRef = new EventEmitter()
  const exit = new Promise(resolve => { processRef.exit = resolve })
  let finish
  const shutdown = installShutdown({ close(callback) { finish = callback } }, { async end() {} }, async () => {}, processRef, 10)
  const pending = shutdown()
  assert.equal(await exit, 1)
  finish()
  await pending
})

test('health endpoint reports database readiness without exposing failures', async t => {
  const { app } = require('../server')
  const { pool } = require('../src/database')
  let fails = false
  t.mock.method(pool, 'query', async () => {
    if (fails) throw new Error('private database details')
    return { rows: [{ '?column?': 1 }] }
  })
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject) })
  t.after(() => new Promise(resolve => server.close(resolve)))
  const url = `http://127.0.0.1:${server.address().port}`
  let response = await fetch(`${url}/api/health`)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await response.json(), { ok: true })
  fails = true
  response = await fetch(`${url}/api/health`)
  assert.equal(response.status, 503)
  assert.deepEqual(await response.json(), { ok: false })
})
