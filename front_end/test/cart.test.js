import test from 'node:test'
import assert from 'node:assert/strict'
import { createCartStore } from '../src/cartStore.js'

function browserStorage(initial = null) {
  let saved = initial
  return { getItem: () => saved, setItem: (_key, value) => { saved = value } }
}

test('restores the latest quantities after an abrupt close, without lifecycle events', () => {
  const storage = browserStorage()
  const cart = createCartStore(() => storage)
  cart.update({ cway: 2, exchange: 1 })
  cart.update(current => ({ ...current, cway: current.cway + 1 }))
  assert.deepEqual(createCartStore(() => storage).getSnapshot().cart, { exchange: 1, cway: 3 })
})

test('reorder replacements and item removals survive reopening', () => {
  const storage = browserStorage()
  const cart = createCartStore(() => storage)
  cart.update({ cway: 3 })
  cart.update({ swan: 4, nestle: 2 })
  cart.update(current => ({ ...current, nestle: 0 }))
  assert.deepEqual(createCartStore(() => storage).getSnapshot().cart, { swan: 4 })
  cart.update({})
  assert.deepEqual(createCartStore(() => storage).getSnapshot().cart, {})
})

test('keeps existing carts from the previous storage format and discards invalid entries', () => {
  const storage = browserStorage(JSON.stringify({ cway: 2, exchange: 99, nestle: -1, swan: 100, aquafina: '2', lasena: 1.5, unknown: 4 }))
  assert.deepEqual(createCartStore(() => storage).getSnapshot().cart, { exchange: 99, cway: 2 })
  for (const value of ['broken json', 'null', '[]']) {
    assert.deepEqual(createCartStore(() => browserStorage(value)).getSnapshot().cart, {})
  }
})

test('reports storage failures while keeping the current cart usable and retries on the next change', () => {
  const storage = browserStorage()
  let blocked = true
  const cart = createCartStore(() => {
    if (blocked) throw new Error('Storage blocked')
    return storage
  })
  assert.ok(cart.getSnapshot().error)
  assert.deepEqual(cart.update({ cway: 2 }).cart, { cway: 2 })
  assert.ok(cart.getSnapshot().error)
  blocked = false
  cart.update(current => ({ ...current, cway: 3 }))
  assert.equal(cart.getSnapshot().error, '')
  assert.deepEqual(createCartStore(() => storage).getSnapshot().cart, { cway: 3 })
})
