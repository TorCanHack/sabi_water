export const ESTATE = 'Brains & Hammers, Galadimawa'
export const STATUSES = ['Confirmed', 'Getting a dispatch', 'Out for delivery', 'Delivered']
export const orderStatus = status => ({ Preparing: 'Getting a dispatch', 'Out for Delivery': 'Out for delivery', 'Awaiting fulfilment': 'Confirmed' }[status] || status)
export const emptyAddress = () => ({ label: 'Home', estate: ESTATE, street: '', houseNumber: '', landmark: '', instructions: '' })
export const addressText = address => [address.houseNumber, address.street].filter(Boolean).join(', ')
// The address form is scoped to this estate; older saved addresses omitted it.
export const normalizeAddress = address => address && ({ ...address, estate: address.estate == null || (typeof address.estate === 'string' && !address.estate.trim()) ? ESTATE : address.estate })
export const isCovered = address => normalizeAddress(address)?.estate === ESTATE
export function validateAddress(address) {
  for (const [key, label] of [['label', 'an address label'], ['street', 'a street'], ['houseNumber', 'a house / office number']]) {
    if (typeof address?.[key] !== 'string' || !address[key].trim()) return `Enter ${label}.`
  }
  if (['label', 'estate', 'street', 'houseNumber', 'landmark', 'instructions'].some(key => address[key] != null && (typeof address[key] !== 'string' || address[key].length > (key === 'instructions' ? 500 : 200)))) return 'Address details are too long or invalid.'
  return ''
}
export function validateSchedule(mode, scheduledAt, now = Date.now()) {
  if (!['now', 'later'].includes(mode)) return 'Choose a delivery option.'
  if (mode === 'later' && (!scheduledAt || !Number.isFinite(Date.parse(scheduledAt)) || Date.parse(scheduledAt) <= now)) return 'Choose a future delivery date and time.'
  return ''
}
const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/(\d)\s+(cl|ml|l)\b/g, '$1$2')
export function matchesProduct(product, search) {
  const haystack = normalize(`${product.name} ${product.brand} ${product.size} ${product.detail}`)
  return normalize(search).trim().split(/\s+/).every(word => haystack.includes(word))
}
export const deliveryText = order => order.deliveryMode === 'later' ? `Scheduled: ${new Intl.DateTimeFormat('en-NG', { timeZone: 'Africa/Lagos', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(order.scheduledAt))} (Abuja time)` : 'Deliver now'
