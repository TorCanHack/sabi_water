import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { createCartStore } from './cartStore'
import { createAccountCart } from './accountCart'
import { apiRequest } from './api'

export function useCart(user) {
  const userId = user?.id
  const [guestStore] = useState(() => createCartStore(() => localStorage))
  const [guest, setGuest] = useState(() => guestStore.getSnapshot())
  const account = useMemo(() => userId ? createAccountCart({ userId, storage: () => localStorage, request: apiRequest, uuid: () => crypto.randomUUID() }) : null, [userId])
  const remote = useSyncExternalStore(account?.subscribe || noSubscribe, account?.getSnapshot || emptySnapshot)
  useEffect(() => {
    if (!account) return
    void account.start()
    const refresh = () => { void account.sync() }
    const interval = setInterval(refresh, 10000)
    window.addEventListener('online', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      account.stop()
      clearInterval(interval)
      window.removeEventListener('online', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [account])
  function updateCart(change) {
    if (account) account.update(change)
    else setGuest(guestStore.update(change))
  }
  async function prepareCartLogout() {
    if (account) await account.prepareLogout()
    setGuest(guestStore.update({}))
  }
  return { cart: account ? remote.cart : guest.cart, cartError: account ? remote.error : guest.error, cartLoading: account && remote.loading, cartSyncing: account && remote.syncing, updateCart, prepareCartLogout }
}
const EMPTY = { cart: {}, error: '', loading: false, syncing: false }
const emptySnapshot = () => EMPTY
const noSubscribe = () => () => {}
