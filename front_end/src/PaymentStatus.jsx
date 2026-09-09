import { useEffect, useState } from 'react'
import { apiRequest } from './api'
import { OrderStatus } from './Delivery'
import { money } from './data/products'

export function PaymentStatus({ reference, user, navigate }) {
  const [result, setResult] = useState({ busy: false, order: null, error: '' })
  async function verify() {
    setResult({ busy: true, order: null, error: '' })
    try {
      const { order } = await apiRequest(`/customer/payments/${encodeURIComponent(reference)}/verify`, { method: 'POST' })
      setResult({ busy: false, order, error: '' })
      window.dispatchEvent(new Event('sabi-orders-changed'))
      try { sessionStorage.removeItem('sabi-payment-attempt') } catch { /* Payment remains saved on the server. */ }
    } catch (error) { setResult({ busy: false, order: null, error: error.message }) }
  }
  useEffect(() => {
    if (!user) return
    let active = true
    apiRequest(`/customer/payments/${encodeURIComponent(reference)}/verify`, { method: 'POST' }).then(({ order }) => {
      if (active) {
        setResult({ busy: false, order, error: '' })
      window.dispatchEvent(new Event('sabi-orders-changed'))
        try { sessionStorage.removeItem('sabi-payment-attempt') } catch { /* Payment remains saved on the server. */ }
      }
    }).catch(error => { if (active) setResult({ busy: false, order: null, error: error.message }) })
    return () => { active = false }
  }, [reference, user])
  return <section className="confirmation wrap"><div className="eyebrow">PAYSTACK PAYMENT</div><h1>{result.order ? (result.order.status === 'Cancelled' ? 'Order cancelled.' : result.order.preview ? 'Test payment confirmed.' : 'Payment received.') : 'Check your payment.'}</h1><p>{reference}</p>{!user ? <><p>Sign in to the account used for this payment to check its status.</p><button className="primary" onClick={() => navigate('signin')}>Sign in</button></> : <>{result.order ? <><p>{money(result.order.total)} · {result.order.preview ? 'Paystack test payment' : 'Paid with Paystack'}</p><p>Your order is saved to your account. Track its delivery progress below.</p><OrderStatus order={result.order} /><button className="primary" onClick={() => { window.history.replaceState({}, '', window.location.pathname); navigate('orders') }}>View orders</button></> : <><p>We confirm payments with Paystack before marking your order paid.</p>{result.error && <p className="error" role="alert">{result.error}</p>}<button className="primary" disabled={result.busy} onClick={verify}>{result.busy ? 'Checking…' : 'Check payment status'}</button></>}</>}</section>
}

export function PaymentActions({ order }) {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  if (order.paymentStatus !== 'pending') return null
  async function check() {
    setBusy(true)
    try {
      const { order: updated } = await apiRequest(`/customer/payments/${encodeURIComponent(order.reference)}/verify`, { method: 'POST' })
      window.dispatchEvent(new Event('sabi-orders-changed'))
      setMessage(updated.status === 'Cancelled' ? 'Order cancelled. Updating refund status…' : 'Payment confirmed. Updating your order…')
    } catch (error) { setMessage(error.message) } finally { setBusy(false) }
  }
  return <div>{order.status !== 'Cancelled' && order.authorizationUrl && <a className="text-button" href={order.authorizationUrl}>Continue to payment →</a>}<button className="text-button" disabled={busy} onClick={check}>{busy ? 'Checking…' : 'Check payment status'}</button>{message && <p role="status">{message}</p>}</div>
}
