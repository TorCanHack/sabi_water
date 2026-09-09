import { PaymentActions } from './PaymentStatus'
import { AddressBook, OrderStatus } from './Delivery'
import { addressText, deliveryText } from '../../shared/commerce.mjs'
import { money } from './data/products'

export function CustomerHome({ customer, user, history, navigate, reorder }) {
  return <section className="customer-home-shell wrap" aria-label="Your delivery overview"><div className="customer-home"><AddressBook customer={customer} user={user} /><div className="home-order"><strong>Current order status</strong>{history.length ? <><strong>{history[0].reference}</strong><OrderStatus order={history[0]} /><button className="text-button" onClick={() => reorder(history[0])}>Reorder previous purchase →</button></> : <p>No orders yet.</p>}<button className="text-button" onClick={() => navigate('orders')}>View orders →</button></div></div></section>
}

function downloadReceipt(order) {
  const text = [order.paymentStatus === 'paid' && !order.preview ? 'SABI WATER — PAYMENT RECEIPT' : 'SABI WATER — TEST / UNPAID ORDER', order.paymentStatus === 'paid' ? `Payment confirmed. Delivery status: ${order.status}.` : 'No confirmed payment or delivery.', order.reference, addressText(order.address), order.address.landmark, order.address.instructions, deliveryText(order), ...order.lines.map(p => `${p.qty} × ${p.name}: ${money(p.price * p.qty)}`), `Total: ${money(order.total)}`, order.paymentStatus ? `Paystack ${order.paymentMode} — ${order.paymentStatus}` : 'Payment on delivery — unpaid'].join('\n')
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${order.reference}-receipt.txt`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function CustomerOrders({ history, navigate, reorder, customer, user }) {
  return <section className="customer-page wrap"><div className="eyebrow">YOUR WATER RUNS</div><h1>Orders</h1><p className="section-description">{user ? 'Account orders refresh every 15 seconds.' : 'Test orders saved in this browser.'} Reorder uses current catalogue prices and quantities from your previous order.</p>{customer.error && <p className="error" role="alert">{customer.error}</p>}{customer.loading ? <p role="status">Loading orders…</p> : history.length ? <div className="customer-grid">{history.map(order => <article className="customer-card" key={order.reference}><span className="status-tag">{order.paymentMode === 'live' ? 'Order' : 'Test order'} · {order.status}</span><h3>{order.reference}</h3><OrderStatus order={order} /><p>{addressText(order.address)}</p>{order.address.landmark && <p>Landmark: {order.address.landmark}</p>}{order.address.instructions && <p>{order.address.instructions}</p>}{order.lines.map(p => <p key={p.id}>{p.qty} × {p.name}</p>)}<strong>{money(order.total)}</strong><PaymentActions order={order} /><div className="card-actions"><button className="primary" onClick={() => reorder(order)}>Reorder</button><button className="text-button" onClick={() => downloadReceipt(order)}>Download receipt</button></div></article>)}</div> : <div className="customer-card"><p>You haven’t placed an order yet.</p><button className="primary" onClick={() => navigate('shop')}>Order Water →</button></div>}</section>
}

export function Subscriptions({ navigate }) {
  return <section className="customer-page wrap"><div className="eyebrow">YOUR USUAL, ON REPEAT</div><h1>Subscriptions</h1><article className="customer-card subscription-card"><span className="status-tag">Coming later</span><h2>Water deliveries that fit your routine.</h2><p>Recurring deliveries are planned for a future release. You can schedule a one-time delivery at checkout.</p><p>For now, order whenever you need a top-up.</p><button className="primary" onClick={() => navigate('shop')}>Order Water →</button></article></section>
}

export function CustomerAccount({ user, customer, navigate, signOut }) {
  return <section className="customer-page wrap"><div className="eyebrow">MAKE YOURSELF AT HOME</div><h1>Account</h1>{!user && <div className="customer-card account-intro"><p>Sign in to access your personal details.</p><button className="primary" onClick={() => navigate('signin')}>Sign in →</button><button className="text-button" onClick={() => navigate('signup')}>Create an account</button></div>}<div className="account-menu">
    <details open><summary>Personal details</summary>{user ? <div><p>{user.name}</p><p>{user.email}</p><small>Profile editing is not available yet.</small></div> : <p>Your personal details appear here after you sign in.</p>}</details>
    <details><summary>Saved addresses</summary><AddressBook customer={customer} user={user} /></details>
    <details className="account-wallet"><summary>Wallet</summary>
      <div className="customer-card wallet-card">
        <div className="wallet-heading"><h2>Your water wallet</h2><span className="status-tag">Coming soon</span></div>
        <p>Keep money here for water orders and recurring deliveries.</p>
        <div className="wallet-balance"><span>Preview balance</span><strong>{money(0)}</strong></div>
        <button type="button" className="primary" disabled aria-describedby="wallet-topup-hint">Top up wallet</button>
        <p id="wallet-topup-hint">Wallet top-ups and automatic deductions are not available yet. No money is held in this preview.</p>
      </div>
      <div className="wallet-history"><h3>Transaction history</h3><p>No wallet activity yet. Your top-ups, payments, and deductions will appear here once wallet payments launch.</p></div>
    </details>
    <details><summary>Payment methods</summary><p>Pay by card, bank transfer, USSD, or bank account when online payments are enabled. Pay on delivery remains a preview. Saved payment methods are not available yet.</p></details>
    <details><summary>Notifications</summary><p>No notifications. Order and delivery alerts will be available with live ordering.</p></details>
    <details><summary>Help and support</summary><section className="help-guide" id="how-it-works"><div><div className="eyebrow">LESS LIFTING. MORE LIVING.</div><h2>Water runs,<br />without the run.</h2></div><div className="steps">{[['01', 'Pick your favourites', 'Choose your brand and how much you need.'], ['02', 'Tell us where', 'Add your home or office address in the estate.'], ['03', 'We’ll take it from here', 'We bring your water. Have your empties ready for exchanges.']].map(([n, title, detail]) => <div className="step" key={n}><span>{n}</span><div><h3>{title}</h3><p>{detail}</p></div></div>)}</div></section><p>Delivery coverage: Brains &amp; Hammers, Galadimawa, Abuja.</p><p>Have an empty bottle ready for each dispenser exchange. Paystack checkout displays whether payments are live or test. Delivery dispatch is not yet connected.</p><p>A customer support contact and issue reporting will be available before launch.</p></details>
    <details><summary>Settings</summary><p>Account preferences will be available in a future release.</p></details>
    {user && <button className="logout-button" onClick={signOut}>Log out →</button>}
  </div></section>
}
