import { products } from './data/products.js'

const CART_KEY = 'sabi-cart'
const STORAGE_ERROR = 'Your cart could not be saved on this device. Keep this page open to avoid losing it.'

function validCart(value) {
  return Object.fromEntries(products
    .filter(product => Number.isInteger(value?.[product.id]) && value[product.id] > 0 && value[product.id] <= 99)
    .map(product => [product.id, value[product.id]]))
}

// Save every change immediately: mobile apps may close without an unload event.
export function createCartStore(getStorage) {
  let snapshot = { cart: {}, error: '' }
  try {
    const saved = getStorage().getItem(CART_KEY)
    if (saved) {
      try { snapshot.cart = validCart(JSON.parse(saved)) } catch { /* Ignore malformed saved data. */ }
    }
  } catch {
    snapshot.error = 'Your saved cart could not be loaded on this device.'
  }

  return {
    getSnapshot: () => snapshot,
    update(change) {
      const cart = validCart(typeof change === 'function' ? change(snapshot.cart) : change)
      let error = ''
      try {
        // An empty snapshot also persists intentional removals and completed checkout.
        getStorage().setItem(CART_KEY, JSON.stringify(cart))
      } catch {
        error = STORAGE_ERROR
      }
      snapshot = { cart, error }
      return snapshot
    },
  }
}
