import { useEffect, useRef, useState } from 'react'
import { AddressFields, OrderStatus } from './Delivery'
import { useCart } from './useCart'
import { useCustomerData } from './useCustomerData'
import { emptyAddress, normalizeAddress, addressText, isCovered, validateAddress, validateSchedule, matchesProduct, deliveryText } from '../../shared/commerce.mjs'
import { PaymentStatus } from './PaymentStatus'
import AuthPage from './AuthPage'
import { CustomerHome, CustomerOrders, CustomerAccount, Subscriptions } from './CustomerPages'
import { apiRequest } from './api'
import { products, money } from './data/products'

function CartIcon() {
  return <svg className="cart-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M3 3h2l2.4 12h11.2l2-8H6" /><circle cx="9" cy="20" r="1" /><circle cx="18" cy="20" r="1" /></svg>
}

function Bottle({ product }) {
  if (product.image) return <img className={`product-photo ${product.id === 'exchange' ? 'dispenser-photo' : 'pack-photo'}`} src={product.image} alt={product.imageAlt} />
  return <div aria-hidden="true" className={`bottle ${product.category === 'Dispenser' ? 'jug' : ''}`} style={{ '--bottle-color': product.color }}><div className="cap" /><div className="neck" /><div className="bottle-body"><div className="bottle-label"><span>≈</span><strong>{product.brand}</strong><small>{product.size}</small></div><div className="ridges" /></div></div>
}

const pageLabels = {
  landing: 'Home',
  shop: 'Shop',
  checkout: 'Cart',
  orders: 'Orders',
  confirmation: 'Order confirmation',
  'payment-return': 'Payment status',
  subscriptions: 'Subscriptions',
  account: 'Account',
  signin: 'Sign in',
  signup: 'Create account',
}

function activeDestination(screen) {
  if (screen === 'checkout') return 'checkout'
  if (screen === 'confirmation' || screen === 'payment-return') return 'orders'
  if (screen === 'signin' || screen === 'signup') return 'account'
  return screen
}

function App() {
  const [menuOpen, setMenuOpen] = useState(false)
  const headerRef = useRef(null)
  const menuButtonRef = useRef(null)
  useEffect(() => {
    if (!menuOpen) return
    function closeOutside(event) {
      if (!headerRef.current?.contains(event.target)) setMenuOpen(false)
    }
    function closeOnEscape(event) {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        menuButtonRef.current?.focus()
      }
    }
    const desktop = window.matchMedia('(min-width: 851px)')
    function closeOnDesktop(event) { if (event.matches) setMenuOpen(false) }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('focusin', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    desktop.addEventListener('change', closeOnDesktop)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('focusin', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
      desktop.removeEventListener('change', closeOnDesktop)
    }
  }, [menuOpen])
  const [category, setCategory] = useState('All water')
  const [search, setSearch] = useState('')
  const [checkoutAddress, setCheckoutAddress] = useState(emptyAddress)
  const [deliveryMode, setDeliveryMode] = useState('now')
  const [scheduledTime, setScheduledTime] = useState('')
  const [saveForLater, setSaveForLater] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [screen, setScreen] = useState(new URLSearchParams(window.location.search).has('reference') ? 'payment-return' : 'landing')
  const [payment, setPayment] = useState('card')
  const [paymentConfig, setPaymentConfig] = useState(null)
  const [order, setOrder] = useState(null)
  const [error, setError] = useState('')
  const [user, setUser] = useState(null)
  const { cart, cartError, cartLoading, cartSyncing, updateCart, prepareCartLogout } = useCart(user)
  const customer = useCustomerData(user)
  const history = customer.data.orders
  const covered = isCovered(checkoutAddress)
  const filteredProducts = products.filter(p => (category === 'All water' || p.category === ({ 'Bottled water': 'Table water', 'Dispenser bottles': 'Dispenser' }[category] || category)) && matchesProduct(p, search))
  const lines = products.filter(p => cart[p.id]).map(p => ({ ...p, qty: cart[p.id] }))
  const count = lines.reduce((sum, p) => sum + p.qty, 0)
  const total = lines.reduce((sum, p) => sum + p.price * p.qty, 0)
  useEffect(() => {
    apiRequest('/payments/config').then(setPaymentConfig).catch(() => setPaymentConfig({ enabled: false }))
    apiRequest('/auth/me').then(({ user: currentUser }) => setUser(currentUser)).catch(() => {})
  }, [])
  useEffect(() => {
    document.title = `${pageLabels[screen] || 'Sabi Water'} | Sabi Water`
  }, [screen])
  function changeQuantity(id, delta) {
    if (cartLoading) return
    updateCart(current => ({ ...current, [id]: Math.max(0, Math.min(99, (current[id] || 0) + delta)) }))
  }
  function reorder(previous) {
    if (cartLoading) return
    const next = Object.fromEntries(previous.lines.filter(line => products.some(p => p.id === line.id)).map(line => [line.id, line.qty]))
    updateCart(next)
    navigate('checkout')
    setCheckoutAddress({ ...previous.address, id: undefined })
  }
  function navigate(next) { setMenuOpen(false); if (next === 'shop' && ['signin', 'signup'].includes(screen) && new URLSearchParams(window.location.search).has('reference')) next = 'payment-return'; if (next === 'checkout' && customer.address) setCheckoutAddress({ ...customer.address }); setScreen(next); setError(''); window.scrollTo({ top: 0, behavior: next === 'signup' || next === 'signin' ? 'instant' : 'smooth' }) }
  async function signOut() {
    try { await prepareCartLogout() } catch (error) { setError(error.message); return }
    try { await apiRequest('/auth/signout', { method: 'POST' }) } catch (error) { setError(error.message); return }
    setUser(null)
    setOrder(null)
    setCheckoutAddress(emptyAddress())
    navigate('landing')
  }
  async function submitOrder(event) {
    event.preventDefault(); setError('')
    if (submitting || cartLoading || cartSyncing) return
    const data = new FormData(event.currentTarget)
    if (!lines.length) return setError('Add water to your cart first.')
    const scheduledAt = deliveryMode === 'later' && scheduledTime ? new Date(`${scheduledTime}:00+01:00`).toISOString() : null
    const validation = validateAddress(checkoutAddress) || (!covered && 'We currently deliver only within Brains & Hammers, Galadimawa.') || validateSchedule(deliveryMode, scheduledAt)
    if (validation) return setError(validation)
    if ((payment !== 'delivery' || paymentConfig?.businessConnected) && !user) return setError('Sign in from Account before placing this order. Your cart will be kept.')
    const phone = String(data.get('phone')).replace(/[\s()-]/g, '')
    if (!/^(?:0[789]\d{9}|\+234[789]\d{9})$/.test(phone)) return setError('Enter a valid Nigerian mobile number, such as 08012345678.')
    setSubmitting(true)
    try {
      if (saveForLater) await customer.saveAddress(checkoutAddress)
      const details = { name: String(data.get('name')).trim(), phone, address: normalizeAddress(checkoutAddress), deliveryMode, scheduledAt, exchange: data.get('exchange') === 'on' }
      if (payment !== 'delivery') {
        const currentConfig = await apiRequest('/payments/config')
        setPaymentConfig(currentConfig)
        if (!currentConfig.enabled) throw new Error('Online payments are not configured yet.')
        const payload = { ...details, paymentMethod: payment, items: lines.map(({ id, qty }) => ({ id, qty })) }
        const fingerprint = JSON.stringify({ userId: user.id, ...payload })
        let attempt
        try { attempt = JSON.parse(sessionStorage.getItem('sabi-payment-attempt')) } catch { /* Use a fresh attempt. */ }
        if (attempt?.fingerprint !== fingerprint) {
          attempt = { fingerprint, id: crypto.randomUUID() }
          sessionStorage.setItem('sabi-payment-attempt', JSON.stringify(attempt))
        }
        const { order: pending } = await apiRequest('/customer/payments', { method: 'POST', body: JSON.stringify({ ...payload, checkoutId: attempt.id }) })
        if (pending.paymentStatus === 'paid') {
          sessionStorage.removeItem('sabi-payment-attempt')
          navigate('orders')
          return
        }
        if (!pending.authorizationUrl) throw new Error('This payment is awaiting confirmation. Open Orders and check its status before starting another payment.')
        window.location.assign(pending.authorizationUrl)
        return
      }
      const createdOrder = user ? (await apiRequest('/customer/orders', { method: 'POST', body: JSON.stringify({ ...details, items: lines.map(({ id, qty }) => ({ id, qty })) }) })).order : { ...details, reference: `TEST-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, total, lines, status: 'Confirmed', preview: true, createdAt: new Date().toISOString() }
      setOrder(createdOrder)
      customer.addOrder(createdOrder)
      updateCart(current => {
        const remaining = { ...current }
        for (const line of lines) remaining[line.id] = Math.max(0, (remaining[line.id] || 0) - line.qty)
        return remaining
      })
      navigate('confirmation')
    } catch (error) { setError(error.message) } finally { setSubmitting(false) }
  }
  function quantity(p) { return <div className="quantity"><button type="button" aria-label={`Remove one ${p.name}`} onClick={() => changeQuantity(p.id, -1)}>−</button><span aria-live="polite">{cart[p.id]}</span><button type="button" disabled={cart[p.id] === 99} aria-label={`Add one ${p.name}`} onClick={() => changeQuantity(p.id, 1)}>+</button></div> }
  const currentPage = pageLabels[screen] || 'Sabi Water'
  const activePage = activeDestination(screen)
  return <>
    <header ref={headerRef} className="header wrap"><button className="wordmark" onClick={() => navigate('landing')} aria-label="Sabi Water home"><img className="brand-logo" src="/images/sabi-water-logo.png" alt="Sabi Water" /></button><button ref={menuButtonRef} type="button" className="menu-toggle" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} aria-controls="customer-menu" onClick={() => setMenuOpen(open => !open)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d={menuOpen ? 'M6 6l12 12M6 18L18 6' : 'M4 6h16M4 12h16M4 18h16'} /></svg></button><nav id="customer-menu" className={menuOpen ? 'is-open' : ''} aria-label="Customer menu">{[['landing', 'Home'], ['shop', 'Shop'], ['orders', 'Orders'], ['subscriptions', 'Subscriptions'], ['account', 'Account']].map(([page, label]) => <button key={page} aria-current={activePage === page ? 'page' : undefined} className={activePage === page ? 'active' : ''} onClick={() => navigate(page)}>{label}</button>)}</nav><button className={`cart-button${activePage === 'checkout' ? ' active' : ''}`} aria-current={activePage === 'checkout' ? 'page' : undefined} onClick={() => navigate('checkout')} aria-label={`Cart, ${count} items`}><CartIcon />Cart <span>{count}</span></button></header>
    <div className="mobile-page-context wrap" aria-live="polite" aria-atomic="true"><svg className="footprints-icon" viewBox="0 0 28 20" aria-hidden="true"><g transform="rotate(-18 7 12)"><ellipse cx="7" cy="13" rx="3.4" ry="5" /><circle cx="4.1" cy="6.6" r="1.25" /><circle cx="6.5" cy="5.2" r="1.35" /><circle cx="9.2" cy="5.6" r="1.15" /></g><g transform="rotate(18 20 8)"><ellipse cx="20" cy="9" rx="3.4" ry="5" /><circle cx="17.1" cy="2.6" r="1.25" /><circle cx="19.5" cy="1.2" r="1.35" /><circle cx="22.2" cy="1.6" r="1.15" /></g></svg><strong>{currentPage}</strong></div>
    <main>{screen === 'account' && error && <p className="error wrap" role="alert">{error}</p>}{cartLoading ? <p className="wrap" role="status">Restoring your account cart…</p> : cartSyncing && <p className="wrap" role="status">Saving your cart to your account…</p>}{cartError && <p className="error wrap" role="alert">{cartError}</p>}{screen === 'landing' && <>
      <CustomerHome customer={customer} user={user} history={history} navigate={navigate} reorder={reorder} />
      <section className="hero wrap"><div className="hero-copy"><div className="eyebrow">● YOUR NEIGHBOURHOOD WATER RUN</div><h1>Water sorted.<br />One less thing<br />on your mind.</h1><p>Your favourite water, delivered straight to your home or office. No stress. No heavy lifting. Just order and get on with your day.</p><button className="primary" onClick={() => navigate('shop')}>Order Water <CartIcon /></button><div className="hero-benefits"><span>✓ Free estate delivery</span><span>✓ Easy bottle exchanges</span></div></div><div className="hero-visual"><div className="hero-art hero-composed"><img className="hero-product-scene" src="/images/water-brands-hero-blue.png" alt="CWAY dispenser and bottled water, Nestlé Pure Life, Swan, and Aquafina together on a softly lit pale blue background" fetchPriority="high" width="1254" height="1254" /></div><img className="delivery-van" src="/images/delivery-van.png" alt="Sabi Water delivery van heading towards your door" width="1672" height="941" /></div></section>
      <section className="service-strip wrap"><span className="location-icon">⌖</span><div><strong>Keeping your neighbourhood hydrated</strong><span>Now delivering in Abuja.</span></div><span className="zone-tag">Your Address. Our route.</span></section>

      <section className="customer-page wrap"><h2>Popular products</h2><div className="customer-grid">{products.slice(0, 3).map(p => <article className="customer-card" key={p.id}><h3>{p.name}</h3><p>{p.detail}</p><strong>{money(p.price)}</strong><div className="card-actions">{cart[p.id] > 0 ? quantity(p) : <button className="add-button" onClick={() => changeQuantity(p.id, 1)}>Add to cart +</button>}</div></article>)}</div><div className="customer-card promotion"><h2>Promotions</h2><p>Free delivery within Brains &amp; Hammers, Galadimawa. No code needed.</p></div></section>

      <section className="recurring wrap"><span className="eyebrow">A LITTLE FURTHER DOWN THE ROAD</span><h2>Your usual water.<br />On repeat.</h2><p>We’re exploring regular deliveries that fit your routine.<br />For now, order whenever you need a top-up.</p><span className="coming">Recurring deliveries · Coming later</span></section>
    </>}
    {screen === 'shop' && <>
      <section className="shop wrap" id="shop"><div className="eyebrow">STOCK UP, SLOW DOWN</div><h1>What’s your water?</h1><p className="section-description">From the kitchen dispenser to the meeting-room table.</p><label className="shop-search">Search products<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by brand, product or size" /></label><div className="shop-toolbar"><div className="tabs" aria-label="Water categories">{['All water', 'Sachet water', 'Bottled water', 'Dispenser bottles', 'Ice & other products'].map(tab => <button key={tab} aria-pressed={category === tab} className={category === tab ? 'selected' : ''} onClick={() => setCategory(tab)}>{tab}</button>)}</div></div><div className="products">{filteredProducts.map(p => <article className="product" key={p.id}><div className={`product-art ${p.id}`}><span className="product-tag">{p.category === 'Dispenser' ? 'EXCHANGE & REFRESH' : 'BY THE PACK'}</span><Bottle product={p} /><span className="art-volume">{p.size}</span></div><div className="product-info"><span className="product-category">{p.category}</span><h3>{p.name}</h3><p>{p.detail}</p><div className="product-bottom"><strong>{money(p.price)}</strong>{cart[p.id] > 0 ? quantity(p) : <button className="add-button" aria-label={`Add ${p.name} to cart`} onClick={() => changeQuantity(p.id, 1)}>Add <span>+</span></button>}</div></div></article>)}</div><p role="status" className="search-result">{filteredProducts.length ? `${filteredProducts.length} products` : "No products available for this selection. Try another category or search."}</p><p className="test-note">Preview catalogue · Illustrative packaging. Table-water prices and pack sizes are provisional.</p></section>
    </>}
    {screen === 'payment-return' && <PaymentStatus reference={new URLSearchParams(window.location.search).get('reference') || ''} user={user} navigate={navigate} />}
    {screen === 'orders' && <CustomerOrders customer={customer} user={user} history={history} navigate={navigate} reorder={reorder} />}
    {screen === 'subscriptions' && <Subscriptions navigate={navigate} />}
    {screen === 'account' && <CustomerAccount user={user} customer={customer} navigate={navigate} signOut={signOut} />}
    {(screen === 'signin' || screen === 'signup') && <AuthPage key={screen} mode={screen} navigate={navigate} onAuthenticated={setUser} />}
    {screen === 'checkout' && <section className="checkout wrap"><button className="back" onClick={() => navigate('shop')}>← Continue shopping</button><div className="eyebrow">YOUR NEXT TOP-UP</div><h1>Your cart, delivered.</h1><p className="test-banner">{payment !== 'delivery' ? (paymentConfig?.enabled ? (paymentConfig.mode === 'live' ? (paymentConfig.businessConnected ? 'Live payment. You will be charged real money and the order will be sent to Business Padi.' : 'Live payment is unavailable until Business Padi fulfilment is connected.') : 'Test payment. No real money is charged.') : 'Online payments are not configured yet.') : (paymentConfig?.businessConnected ? 'Pay when your order is delivered. This order will appear in Business Padi.' : 'Pay-on-delivery preview. No payment is taken or delivery dispatched.')}</p>{!count ? <div className="empty"><h2>A fresh start.</h2><p>Your cart is empty. Let’s find your water.</p><button className="primary" onClick={() => navigate('shop')}>Shop water ↗</button></div> : <div className="checkout-grid"><form onSubmit={submitOrder}><h2>Where are we heading?</h2><label>Recipient name<input name="name" defaultValue={user?.name || ''} autoComplete="name" required maxLength={100} pattern=".*\S.*" /></label><label>Phone number<input name="phone" type="tel" autoComplete="tel" required placeholder="08012345678" /></label>{customer.data.addresses.length > 0 && <label>Use a saved address<select value={checkoutAddress.id || ''} onChange={event => setCheckoutAddress({ ...(customer.data.addresses.find(a => a.id === event.target.value) || emptyAddress()) })}><option value="">New address</option>{customer.data.addresses.map(a => <option key={a.id} value={a.id}>{a.label} · {addressText(a)}</option>)}</select></label>}<AddressFields value={checkoutAddress} onChange={setCheckoutAddress} /><label className="checkbox"><input type="checkbox" checked={saveForLater} onChange={event => setSaveForLater(event.target.checked)} /><span>Save these address details for next time{!user && ' in this browser'}</span></label><fieldset><legend>When should we deliver?</legend><label className="payment-option"><input type="radio" name="deliveryMode" checked={deliveryMode === 'now'} onChange={() => setDeliveryMode('now')} />Deliver now</label><label className="payment-option"><input type="radio" name="deliveryMode" checked={deliveryMode === 'later'} onChange={() => setDeliveryMode('later')} />Schedule for later</label>{deliveryMode === 'later' && <label>Delivery date and time (Abuja time)<input type="datetime-local" required value={scheduledTime} min={new Date(Date.now() + 3600000).toISOString().slice(0, 16)} onChange={event => setScheduledTime(event.target.value)} /><small>Choose a future time. All delivery times use Abuja time (WAT).</small></label>}</fieldset>{cart.exchange > 0 && <label className="checkbox"><input name="exchange" type="checkbox" required /><span>I have {cart.exchange} empty dispenser {cart.exchange === 1 ? 'bottle' : 'bottles'} ready to exchange.</span></label>}<fieldset disabled={submitting}><legend>How would you like to pay?</legend>{[['card', 'Card'], ['bank_transfer', 'Bank transfer'], ['ussd', 'USSD'], ['bank', 'Bank account']].map(([method, label]) => <label className="payment-option" key={method}><input type="radio" name="payment" value={method} checked={payment === method} onChange={() => setPayment(method)} />{label} <small>{paymentConfig?.enabled ? (paymentConfig.mode === 'live' ? 'Live payment' : 'Test payment') : 'Unavailable'}</small></label>)}<label className="payment-option"><input type="radio" name="payment" checked={payment === 'delivery'} onChange={() => setPayment('delivery')} />Pay on delivery <small>{paymentConfig?.businessConnected ? 'On delivery' : 'Preview only'}</small></label></fieldset>{error && <p className="error" role="alert">{error}</p>}<button className="primary submit" type="submit" disabled={submitting || customer.loading || cartLoading || cartSyncing || Boolean(cartError)}>{submitting ? (payment !== 'delivery' ? 'Opening payment…' : (paymentConfig?.businessConnected ? 'Sending order…' : 'Saving test order…')) : (payment !== 'delivery' ? 'Continue to payment' : (paymentConfig?.businessConnected ? 'Place order' : 'Place test order'))} <span>↗</span></button></form><aside className="order-summary"><h2>Your water</h2>{lines.map(p => <div className="summary-line" key={p.id}><div><strong>{p.name}</strong><small>{p.detail}</small>{quantity(p)}</div><strong>{money(p.price * p.qty)}</strong></div>)}<div className="summary-total"><span>Subtotal</span><span>{money(total)}</span></div><div className="summary-total"><span>Delivery</span><span className="free">Free</span></div><div className="summary-total grand"><strong>Total</strong><strong>{money(total)}</strong></div><p>On-demand delivery · 24/7 availability for testing.</p></aside></div>}</section>}
    {screen === 'confirmation' && order && <section className="confirmation wrap"><span className="confirmation-check">✓</span><div className="eyebrow">{order.preview ? 'TEST ORDER COMPLETE' : 'ORDER RECEIVED'}</div><h1>That’s your water<br />run, sorted.</h1><p>Thanks, {order.name}. {order.preview ? 'You’ve completed the checkout preview.' : 'Business Padi has received your order.'}</p><div className="confirmation-details"><strong>{order.reference}</strong><p>{addressText(order.address)}</p>{order.address.landmark && <p>Landmark: {order.address.landmark}</p>}{order.address.instructions && <p>{order.address.instructions}</p>}<p>{deliveryText(order)}</p><OrderStatus order={history.find(item => item.reference === order.reference) || order} />{order.lines.map(p => <p key={p.id}>{p.qty} × {p.name}</p>)}<strong>{money(order.total)} · Pay on delivery</strong></div><p className="test-banner">{order.preview ? `This is a demonstration only. Your order is saved ${user ? 'to your account' : 'in this browser'} for testing and has not been sent to Business Padi. No delivery has been booked.` : 'Your order has been sent to Business Padi. Return to Orders to follow its delivery status.'}</p><button className="primary" onClick={() => navigate('orders')}>View order status →</button></section>}
    </main><footer className="footer wrap"><a className="footer-brand" href="#" onClick={(event) => { event.preventDefault(); navigate('landing') }} aria-label="Sabi Water home"><img className="brand-logo" src="/images/sabi-water-logo.png" alt="Sabi Water" /></a><p>Good water. Closer to home.</p><span>Abuja, Nigeria · Made for the everyday.</span></footer>
  </>
}
export default App
