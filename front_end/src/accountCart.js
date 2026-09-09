import { products } from './data/products.js'

const clean = cart => Object.fromEntries(products.filter(p => Number.isInteger(cart?.[p.id]) && cart[p.id] > 0 && cart[p.id] <= 99).map(p => [p.id, cart[p.id]]))
function apply(cart, operation) {
  const next = operation.type === 'replace' ? {} : { ...cart }
  for (const [id, qty] of Object.entries(operation.items)) {
    next[id] = operation.type === 'replace' ? qty : Math.max(0, Math.min(99, (next[id] || 0) + qty))
  }
  return clean(next)
}

export function createAccountCart({ userId, storage, request, uuid }) {
  const key = `sabi-account-cart-${userId}`
  let pending = []
  let snapshot = { cart: {}, error: '', loading: true, syncing: false }
  try {
    const cached = JSON.parse(storage().getItem(key) || 'null')
    if (cached && Array.isArray(cached.pending)) {
      pending = cached.pending
      snapshot = { ...snapshot, cart: clean(cached.cart) }
    }
  } catch { /* Recover from server if the local cache is unavailable. */ }
  const listeners = new Set()
  let active = false
  let running = null
  function emit(values) {
    snapshot = { ...snapshot, ...values }
    for (const listener of listeners) listener()
  }
  function persist() {
    try { storage().setItem(key, JSON.stringify({ cart: snapshot.cart, pending })); return true } catch { return false }
  }
  function enqueue(type, items) {
    const operation = { id: uuid(), type, items }
    pending.push(operation)
    emit({ cart: apply(snapshot.cart, operation), syncing: true })
    if (!persist()) emit({ error: 'Device storage is unavailable. Keep this page open until your cart syncs.' })
  }
  async function sync() {
    if (running) return running
    if (!active) return false
    running = (async () => {
      try {
        emit({ syncing: pending.length > 0 })
        if (!pending.length) {
          const result = await request('/customer/cart')
          if (!active) return false
          if (String(result.userId) !== String(userId)) throw new Error('Account changed')
          emit({ cart: pending.reduce(apply, clean(result.cart)) })
          persist()
        }
        while (active && pending.length) {
          const operation = pending[0]
          const result = await request('/customer/cart', { method: 'POST', body: JSON.stringify({ userId, operation }) })
          if (!active) return false
          pending.shift()
          emit({ cart: pending.reduce(apply, clean(result.cart)) })
          persist()
        }
        emit({ loading: false, syncing: false, error: '' })
        return true
      } catch {
        if (active) emit({ loading: false, syncing: false, error: 'Your cart has not synced. Check your connection and sign-in; we’ll retry automatically.' })
        return false
      } finally { running = null }
    })()
    return running
  }
  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    getSnapshot: () => snapshot,
    start() {
      active = true
      // Persist the merge operation before consuming the guest cart so retries are safe.
      try {
        const guest = clean(JSON.parse(storage().getItem('sabi-cart') || '{}'))
        if (Object.keys(guest).length) {
          const previous = pending.find(op => op.type === 'merge')
          if (!previous) enqueue('merge', guest)
          if (persist()) storage().removeItem('sabi-cart')
        }
      } catch { /* Server recovery remains available without browser storage. */ }
      return sync()
    },
    stop() { active = false },
    sync,
    update(change) {
      if (typeof change === 'function') {
        const next = clean(change(snapshot.cart))
        const changes = Object.fromEntries(products.map(p => [p.id, (next[p.id] || 0) - (snapshot.cart[p.id] || 0)]).filter(([, delta]) => delta))
        if (Object.keys(changes).length) enqueue('adjust', changes)
      } else enqueue('replace', clean(change))
      void sync()
    },
    async prepareLogout() {
      if (!(await sync())) throw new Error('Your cart hasn’t synced yet. Reconnect and try logging out again so it is available on your other devices.')
      try { storage().removeItem(key) } catch { /* Account data is never loaded into a guest session. */ }
    },
  }
}
