import { useEffect, useState } from 'react'
import { validateAddress, validateSchedule, STATUSES, orderStatus } from '../../shared/commerce.mjs'
import { apiRequest } from './api'

const blank = { addresses: [], orders: [], selectedId: '' }
function readGuest() {
  try {
    const data = JSON.parse(localStorage.getItem('sabi-guest-deliveries'))
    if (Array.isArray(data?.addresses) && Array.isArray(data?.orders)) return {
      addresses: data.addresses.filter(address => !validateAddress(address) && typeof address.id === 'string'),
      orders: data.orders.filter(order => order && typeof order.reference === 'string' && !validateAddress(order.address) && STATUSES.includes(orderStatus(order.status)) && !validateSchedule(order.deliveryMode, order.scheduledAt, 0) && Number.isFinite(order.total) && Array.isArray(order.lines) && order.lines.every(line => line && typeof line.id === 'string' && typeof line.name === 'string' && Number.isInteger(line.qty) && line.qty > 0 && line.qty <= 99 && Number.isFinite(line.price))),
      selectedId: typeof data.selectedId === 'string' ? data.selectedId : '',
    }
  } catch { /* Start fresh if browser storage is unavailable. */ }
  return blank
}
export function useCustomerData(user) {
  const owner = user?.id || 'guest'
  const [state, setState] = useState({ owner: 'guest', data: readGuest(), loading: false, error: '' })
  const current = state.owner === owner ? state : { data: blank, loading: true, error: '' }
  useEffect(() => {
    let active = true
    async function refresh() {
      try {
        const data = user ? await Promise.all([apiRequest('/customer/addresses'), apiRequest('/customer/orders')]).then(([a, o]) => ({ addresses: a.addresses, orders: o.orders })) : readGuest()
        if (active) setState(previous => ({ owner, loading: false, error: '', data: { ...data, selectedId: previous.owner === owner && data.addresses.some(a => a.id === previous.data.selectedId) ? previous.data.selectedId : data.selectedId || data.addresses[0]?.id || '' } }))
      } catch (error) {
        if (active) setState(previous => ({ owner, data: previous.owner === owner ? previous.data : blank, loading: false, error: error.message }))
      }
    }
    refresh()
    window.addEventListener('sabi-orders-changed', refresh)
    const timer = user ? setInterval(refresh, 15000) : null
    return () => { active = false; clearInterval(timer); window.removeEventListener('sabi-orders-changed', refresh) }
  }, [owner, user])
  function update(change) {
    setState(previous => {
      const data = change(previous.owner === owner ? previous.data : blank)
      if (!user) {
        try { localStorage.setItem('sabi-guest-deliveries', JSON.stringify(data)) } catch { return { owner, data, loading: false, error: 'Browser storage is unavailable. Your details will last for this visit only.' } }
      }
      return { owner, data, loading: false, error: '' }
    })
  }
  async function saveAddress(address) {
    const saved = user ? (await apiRequest('/customer/addresses', { method: 'POST', body: JSON.stringify(address) })).address : { ...address, id: address.id || crypto.randomUUID() }
    update(data => ({ ...data, addresses: [saved, ...data.addresses.filter(a => a.id !== saved.id)], selectedId: saved.id }))
    return saved
  }
  async function removeAddress(id) {
    if (user) await apiRequest(`/customer/addresses/${id}`, { method: 'DELETE' })
    update(data => ({ ...data, addresses: data.addresses.filter(a => a.id !== id), selectedId: data.selectedId === id ? data.addresses.find(a => a.id !== id)?.id || '' : data.selectedId }))
  }
  return { ...current, address: current.data.addresses.find(a => a.id === current.data.selectedId) || null, saveAddress, removeAddress, selectAddress: id => update(data => ({ ...data, selectedId: id })), addOrder: order => update(data => ({ ...data, orders: [order, ...data.orders] })) }
}
