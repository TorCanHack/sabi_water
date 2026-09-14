import { useState } from 'react'
import { addressText, orderStatus } from '../../shared/commerce.mjs'
import { products, money } from './data/products'
import { OrderStatus } from './Delivery'
import { PaymentActions } from './PaymentStatus'
import { downloadReceipt } from './orderReceipt'
import './OrdersPage.css'

const filters = ['All orders', 'In progress', 'Delivered', 'Cancelled']
const isActive = order => !['Delivered', 'Cancelled'].includes(orderStatus(order.status))
const matchesFilter = (order, filter) => filter === 'All orders' || (filter === 'In progress' ? isActive(order) : orderStatus(order.status) === filter)

function OrdersIcon({ name }) {
  const paths = {
    bag: <><path d="M4 7h16l1 14H3L4 7Z" /><path d="M8 8V6a4 4 0 0 1 8 0v2" /></>,
    delivery: <><path d="M2 5h12v12H2zM14 9h4l4 5v3h-8" /><circle cx="6" cy="18" r="2" /><circle cx="18" cy="18" r="2" /></>,
    check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
    receipt: <><path d="M5 3h14v19l-3-2-4 2-4-2-3 2V3Z" /><path d="M9 8h6M9 12h6" /></>,
    repeat: <><path d="M20 7h-6m6 0V1M4 17h6m-6 0v6" /><path d="M4 8a8 8 0 0 1 14-4l2 3M4 17l2 3a8 8 0 0 0 14-4" /></>,
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function OrderDate({ value }) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? <span>Date unavailable</span> : <time dateTime={date.toISOString()}>{new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Lagos' }).format(date)}</time>
}

function ProductImage({ line }) {
  const product = products.find(product => product.id === line.id)
  return product?.image ? <img src={product.image} alt={line.name} width="64" height="64" loading="lazy" /> : <OrdersIcon name="bag" />
}

function OrderCard({ order, reorder, cartLoading }) {
  const status = order.status === 'Cancelled' ? 'Cancelled' : order.paymentStatus === 'pending' ? 'Awaiting payment' : orderStatus(order.status)
  const tone = status === 'Cancelled' ? 'cancelled' : status === 'Delivered' ? 'delivered' : status === 'Awaiting payment' ? 'pending' : 'active'
  const itemCount = order.lines.reduce((sum, line) => sum + line.qty, 0)
  const testOrder = order.preview || order.paymentMode === 'test'
  const paymentLabel = order.paymentStatus === 'paid' ? (order.paymentSource === 'wallet' ? 'Paid from wallet' : 'Paid with Paystack') : order.paymentStatus === 'pending' ? 'Payment pending' : 'Pay on delivery · Unpaid'
  return <article className="orders-card" aria-label={`Order ${order.reference}`}>
    <div className="orders-card-header"><div className="orders-reference"><span>ORDER REFERENCE</span><h3>{order.reference}</h3><div className="orders-date"><OrderDate value={order.createdAt} /><span aria-hidden="true">·</span><span>{itemCount} {itemCount === 1 ? 'item' : 'items'}</span></div></div><div className="orders-badges">{testOrder && <span className="orders-test-badge">Test order</span>}<span className={`orders-status ${tone}`}><span aria-hidden="true" />{status}</span></div></div>
    <div className="orders-card-summary"><div className="orders-product-preview"><div className="orders-thumbnails" aria-hidden="true">{order.lines.slice(0, 3).map(line => <span key={line.id}><ProductImage line={line} /></span>)}</div><div><strong>{order.lines[0]?.name || 'Water order'}{order.lines.length > 1 && <span> + {order.lines.length - 1} more</span>}</strong><p>{addressText(order.address)}</p></div></div><div className="orders-total"><span>Order total</span><strong>{money(order.total)}</strong><small>{testOrder ? 'Test · ' : ''}{paymentLabel}</small></div></div>
    <div className={`orders-progress ${tone}`}><OrderStatus order={order} /></div>
    {order.paymentStatus === 'pending' && <div className="orders-payment-actions"><PaymentActions order={order} /></div>}
    <details className="orders-details"><summary>Order details <span aria-hidden="true">⌄</span></summary><div className="orders-detail-grid"><div><h4>What’s in your order</h4><ul className="orders-line-items">{order.lines.map(line => <li key={line.id}><span className="orders-line-image"><ProductImage line={line} /></span><div><strong>{line.name}</strong><span>{line.qty} × {money(line.price)}</span></div><strong>{money(line.qty * line.price)}</strong></li>)}</ul></div><div className="orders-address"><h4>Delivery details</h4>{order.name && <strong>{order.name}</strong>}{order.phone && <p>{order.phone}</p>}<p>{addressText(order.address)}</p>{order.address.estate && <p>{order.address.estate}</p>}{order.address.landmark && <p><span>Landmark</span>{order.address.landmark}</p>}{order.address.instructions && <p><span>Delivery instructions</span>{order.address.instructions}</p>}</div></div></details>
    <div className="orders-card-actions"><button className="orders-receipt" onClick={() => downloadReceipt(order)}><OrdersIcon name="receipt" />{order.paymentStatus === 'paid' ? 'Download receipt' : 'Download order summary'}</button><button className="orders-reorder" disabled={cartLoading} onClick={() => reorder(order)}><OrdersIcon name="repeat" />Order again</button></div>
  </article>
}

export default function OrdersPage({ history, navigate, reorder, customer, user, cartLoading }) {
  const [filter, setFilter] = useState('All orders')
  const [search, setSearch] = useState('')
  const query = search.trim().toLocaleLowerCase()
  const visibleOrders = history.filter(order => matchesFilter(order, filter) && (!query || [order.reference, ...order.lines.map(line => line.name)].some(value => value.toLocaleLowerCase().includes(query))))
  const counts = Object.fromEntries(filters.map(filter => [filter, history.filter(order => matchesFilter(order, filter)).length]))
  function clearFilters() { setFilter('All orders'); setSearch('') }

  return <section className="orders-page wrap" aria-labelledby="orders-heading">
    <div className="orders-page-heading"><div><span className="eyebrow">EVERY WATER RUN, IN ONE PLACE</span><h1 id="orders-heading">My orders</h1><p>Follow your deliveries, find your favourites, and make your next refill easy.</p></div><button className="primary" onClick={() => navigate('shop')}>Shop water <OrdersIcon name="arrow" /></button></div>
    {!user && <div className="orders-guest-notice"><span className="orders-icon-tile"><OrdersIcon name="bag" /></span><div><strong>Your orders, wherever you are.</strong><p>These are test orders saved in this browser. Sign in to view orders saved to your account.</p></div><button onClick={() => navigate('signin')}>Sign in <span aria-hidden="true">↗</span></button></div>}
    <div className="orders-overview" aria-label="Order overview">{[['bag', 'All orders', 'Your water runs'], ['delivery', 'In progress', 'From checkout to your door'], ['check', 'Delivered', 'Completed deliveries']].map(([icon, label, detail]) => <div key={label}><span className="orders-icon-tile"><OrdersIcon name={icon} /></span><div><span>{label}</span><strong>{customer.loading ? '—' : counts[label]}</strong><small>{detail}</small></div></div>)}</div>
    {customer.error && <div className="orders-error" role="alert"><strong>We couldn’t refresh your orders.</strong><p>{customer.error}</p><button className="text-button" onClick={() => window.dispatchEvent(new Event('sabi-orders-changed'))}>Try again</button></div>}
    <div className="orders-toolbar"><div className="orders-filters" role="group" aria-label="Filter orders">{filters.map(label => <button key={label} aria-pressed={filter === label} onClick={() => setFilter(label)}>{label}<span>{customer.loading ? '—' : counts[label]}</span></button>)}</div><div className="orders-search"><OrdersIcon name="search" /><label className="orders-sr-only" htmlFor="orders-search">Search orders by reference or product</label><input id="orders-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search orders or products" /></div></div>
    <div className="orders-list-heading"><h2>{filter}</h2><span role="status">{customer.loading ? 'Loading orders…' : `${visibleOrders.length} ${visibleOrders.length === 1 ? 'order' : 'orders'}`}{user && !customer.loading && !customer.error ? ' · Updates automatically' : ''}</span></div>
    {customer.loading ? <div className="orders-loading" aria-hidden="true">{[0, 1].map(item => <div key={item}><span /><span /><span /></div>)}</div> : visibleOrders.length ? <div className="orders-list">{visibleOrders.map(order => <OrderCard key={order.reference} order={order} reorder={reorder} cartLoading={cartLoading} />)}</div> : <div className="orders-empty"><span className="orders-icon-tile"><OrdersIcon name={history.length ? 'search' : 'bag'} /></span><h3>{history.length ? 'No orders to show here.' : customer.error ? 'Your orders are unavailable.' : 'Your first water run starts here.'}</h3><p>{history.length ? 'Try another order status or search by product name or order reference.' : customer.error ? 'Try refreshing your orders again in a moment.' : 'Once you place an order, you can follow its progress and reorder your favourites here.'}</p>{history.length ? <button className="primary" onClick={clearFilters}>Show all orders <OrdersIcon name="arrow" /></button> : !customer.error && <button className="primary" onClick={() => navigate('shop')}>Find your water <OrdersIcon name="arrow" /></button>}</div>}
    <div className="orders-footer-note"><OrdersIcon name="repeat" /><p>Order again uses your previous quantities and current catalogue prices, replacing any items already in your cart.</p></div>
  </section>
}
