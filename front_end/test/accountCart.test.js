import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createAccountCart } from '../src/accountCart.js'

function device() {
  const values = new Map()
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
}
function backend() {
  let cart = {}
  const seen = new Set()
  let online = true
  let loseResponse = false
  return {
    setOnline: value => { online = value },
    loseNextResponse: () => { loseResponse = true },
    async request(_path, options) {
      if (!online) throw new Error('Offline')
      if (options) {
        const { operation } = JSON.parse(options.body)
        if (!seen.has(operation.id)) {
          seen.add(operation.id)
          if (operation.type === 'replace') cart = {}
          for (const [id, qty] of Object.entries(operation.items)) {
            cart[id] = operation.type === 'replace' ? qty : Math.max(0, Math.min(99, (cart[id] || 0) + qty))
            if (!cart[id]) delete cart[id]
          }
        }
        if (loseResponse) { loseResponse = false; throw new Error('Lost response') }
      }
      return { cart: { ...cart }, userId: '1' }
    },
  }
}
const controller = (storage, server) => createAccountCart({ userId: '1', storage: () => storage, request: server.request, uuid: randomUUID })

test('a second device recovers the account cart, and logout keeps the server copy', async () => {
  const server = backend(), laptopStorage = device()
  const laptop = controller(laptopStorage, server)
  await laptop.start()
  laptop.update({ cway: 4, exchange: 2 })
  await laptop.sync()
  await laptop.prepareLogout()
  laptop.stop()
  assert.equal(laptopStorage.getItem('sabi-account-cart-1'), null)
  const phone = controller(device(), server)
  await phone.start()
  assert.deepEqual(phone.getSnapshot().cart, { cway: 4, exchange: 2 })
})

test('guest items merge once, even when the first response is lost and the app restarts', async () => {
  const server = backend(), storage = device()
  storage.setItem('sabi-cart', JSON.stringify({ cway: 3 }))
  server.loseNextResponse()
  const first = controller(storage, server)
  await first.start()
  assert.ok(first.getSnapshot().error)
  assert.equal(storage.getItem('sabi-cart'), null)
  first.stop()
  const reopened = controller(storage, server)
  await reopened.start()
  assert.deepEqual(reopened.getSnapshot().cart, { cway: 3 })
  assert.equal(reopened.getSnapshot().error, '')
})

test('offline changes survive a restart and sync without losing changes from another device', async () => {
  const server = backend(), storage = device()
  const laptop = controller(storage, server)
  await laptop.start()
  server.setOnline(false)
  laptop.update(cart => ({ ...cart, cway: 2 }))
  await laptop.sync()
  await assert.rejects(laptop.prepareLogout(), /hasn’t synced/)
  laptop.stop()
  server.setOnline(true)
  const phone = controller(device(), server)
  await phone.start()
  phone.update(cart => ({ ...cart, swan: 1 }))
  await phone.sync()
  const reopened = controller(storage, server)
  await reopened.start()
  assert.deepEqual(reopened.getSnapshot().cart, { cway: 2, swan: 1 })
  await phone.sync()
  assert.deepEqual(phone.getSnapshot().cart, { cway: 2, swan: 1 })
})

test('concurrent same-product increments are both retained and removals propagate', async () => {
  const server = backend()
  const laptop = controller(device(), server), phone = controller(device(), server)
  await Promise.all([laptop.start(), phone.start()])
  laptop.update(cart => ({ ...cart, cway: (cart.cway || 0) + 1 }))
  phone.update(cart => ({ ...cart, cway: (cart.cway || 0) + 1 }))
  await Promise.all([laptop.sync(), phone.sync()])
  await laptop.sync()
  assert.equal(laptop.getSnapshot().cart.cway, 2)
  laptop.update({})
  await laptop.sync()
  await phone.sync()
  assert.deepEqual(phone.getSnapshot().cart, {})
})

test('ignores an old account response after leaving that account', async () => {
  let finish
  const cart = createAccountCart({ userId: '1', storage: () => device(), uuid: randomUUID, request: () => new Promise(resolve => { finish = resolve }) })
  const loading = cart.start()
  cart.stop()
  finish({ cart: { cway: 9 }, userId: '1' })
  await loading
  assert.deepEqual(cart.getSnapshot().cart, {})
})
