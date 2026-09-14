import { useState } from 'react'
import { ESTATE, STATUSES, orderStatus, emptyAddress, addressText, isCovered, validateAddress, deliveryText } from '../../shared/commerce.mjs'

function AddressIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></svg>
}

export function AddressFields({ value, onChange }) {
  const custom = !['Home', 'Office'].includes(value.label)
  const field = (key, title, required = false) => <label>{title}{!required && ' (optional)'}<input value={value[key] ?? ''} required={required} maxLength={200} onChange={event => onChange({ ...value, [key]: event.target.value })} /></label>
  return <div className="address-fields">
    <label>Address label<select value={custom ? 'Custom' : value.label} onChange={event => onChange({ ...value, label: event.target.value === 'Custom' ? '' : event.target.value })}><option>Home</option><option>Office</option><option>Custom</option></select></label>
    {custom && field('label', 'Custom label', true)}
    <p className="section-description">Delivery area: {ESTATE}, Abuja.</p>
    {field('street', 'Street', true)}{field('houseNumber', 'House / office number', true)}{field('landmark', 'Nearby landmark')}
    <label>Delivery instructions (optional)<textarea value={value.instructions ?? ''} maxLength={500} onChange={event => onChange({ ...value, instructions: event.target.value })} placeholder="Gate access, floor, or directions from the landmark" /></label>
    {isCovered(value) && <p className="coverage-message" role="status">Eligible for free delivery within Brains &amp; Hammers.</p>}
  </div>
}
export function AddressBook({ customer, user, startAdding = false }) {
  const [draft, setDraft] = useState(() => startAdding ? emptyAddress() : null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function save(event) {
    event.preventDefault()
    const validation = validateAddress(draft)
    if (validation) return setError(validation)
    setBusy(true); setError('')
    try { await customer.saveAddress(draft); setDraft(null) } catch (error) { setError(error.message) } finally { setBusy(false) }
  }
  async function remove(id) {
    setBusy(true); setError('')
    try { await customer.removeAddress(id) } catch (error) { setError(error.message) } finally { setBusy(false) }
  }
  return <div className="address-book"><strong className="address-book-heading"><span><AddressIcon /></span>Saved addresses</strong><p className="section-description">{user ? 'Saved to your account.' : 'Saved on this browser. Sign in to save addresses to your account.'}</p>{customer.loading ? <p role="status">Loading addresses…</p> : <>
    <div className="saved-addresses">{customer.data.addresses.map(address => <article className="saved-address" key={address.id}><label><input type="radio" name="savedAddress" checked={customer.data.selectedId === address.id} onChange={() => customer.selectAddress(address.id)} /><span><strong>{address.label}</strong><small>{addressText(address)}</small>{address.landmark && <small>Landmark: {address.landmark}</small>}{address.instructions && <small>{address.instructions}</small>}</span></label><div className="address-actions"><button type="button" className="text-button" disabled={busy} onClick={() => { setDraft({ ...address }); setError('') }}>Edit {address.label}</button><button type="button" className="text-button" disabled={busy} onClick={() => remove(address.id)}>Delete {address.label}</button></div></article>)}</div>
    {!draft && <button className="text-button" type="button" onClick={() => setDraft(emptyAddress())}>+ Add address</button>}
    {draft && <form className="address-editor" onSubmit={save}><AddressFields value={draft} onChange={next => { setDraft(next); setError('') }} /><div className="address-actions"><button className="primary" disabled={busy}>Save address</button><button type="button" className="text-button" disabled={busy} onClick={() => setDraft(null)}>Cancel</button></div></form>}
  </>}{(error || customer.error) && <p className="error" role="alert">{error || customer.error}</p>}</div>
}
export function OrderStatus({ order }) {
  if (order.status === 'Cancelled') return <div className="order-tracking" role="status"><p><strong>Order cancelled</strong></p><p>{order.cancellationReason}</p><p>{({ queued: 'Your full refund is queued.', submitting: 'Your refund is being submitted.', pending: 'Your refund is pending.', processing: 'Your refund is processing.', processed: order.paymentSource === 'wallet' ? 'Your full refund is back in your wallet and ready to spend.' : 'Paystack has processed your refund. Your bank may take up to 10 business days to credit it.', failed: 'Your refund needs assistance. Please contact the store.', 'needs-attention': 'Your refund needs assistance. Please contact the store.' })[order.refundStatus] || (order.paymentStatus === 'pending' ? 'No payment confirmed. If your payment arrives, it will be refunded automatically.' : 'No payment was taken; no refund is needed.')}</p>{order.paymentStatus === 'paid' && <p>{order.preview ? 'Test refund — no real money moved.' : order.paymentSource === 'wallet' ? 'The full payment has been returned to your wallet.' : 'The full payment is returned through Paystack to your original payment method.'}</p>}</div>

  const status = orderStatus(order.status)
  const step = order.paymentStatus === 'pending' ? -1 : STATUSES.indexOf(status)
  const note = order.preview
    ? 'Test order · No delivery booked.'
    : order.paymentStatus === 'paid'
      ? `${order.paymentSource === 'wallet' ? 'Paid from wallet' : 'Payment confirmed'} · ${status}`
      : order.paymentStatus === 'pending'
        ? 'Awaiting online payment confirmation'
        : `Pay on delivery · ${status}`
  return <div className="order-tracking"><p>{deliveryText(order)}</p><ol className="status-steps" aria-label="Order progress">{STATUSES.map((status, index) => <li key={status} className={index <= step ? 'reached' : ''} aria-current={index === step ? 'step' : undefined}><span aria-hidden="true">{index < step ? '✓' : index + 1}</span>{status}</li>)}</ol><p className="test-note">{note}</p></div>
}
