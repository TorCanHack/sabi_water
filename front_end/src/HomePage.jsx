import CartIcon from './CartIcon'
import { useRef, useState } from 'react'
import { CustomerHome } from './CustomerPages'
import { AddressBook } from './Delivery'
import { addressText } from '../../shared/commerce.mjs'
import { products, money } from './data/products'
import './HomePage.css'

function HomeIcon({ name }) {
  if (name === 'bag') return <CartIcon />
  const paths = {
    pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    delivery: <><path d="M2 5h12v12H2zM14 9h4l4 5v3h-8" /><circle cx="6" cy="18" r="2" /><circle cx="18" cy="18" r="2" /></>,
    exchange: <><path d="M20 7h-6m6 0V1M4 17h6m-6 0v6" /><path d="M4 8a8 8 0 0 1 14-4l2 3M4 17l2 3a8 8 0 0 0 14-4" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function HomeDeliveryAddress({ customer, user }) {
  const [open, setOpen] = useState(false)
  const trigger = useRef(null)
  const address = customer.address
  function close() { setOpen(false); trigger.current?.focus() }
  const editorCustomer = {
    ...customer,
    async saveAddress(value) {
      const saved = await customer.saveAddress(value)
      close()
      return saved
    },
    selectAddress(id) { customer.selectAddress(id); close() },
  }
  return <section className="home-deliver-to wrap" aria-label="Delivery address">
    <div className="home-deliver-to-card">
      <button ref={trigger} className="home-deliver-to-trigger" aria-expanded={open} aria-controls="home-delivery-editor" onClick={() => setOpen(value => !value)}>
        <span className="home-icon-tile"><HomeIcon name="pin" /></span>
        <span className="home-deliver-to-copy"><span>DELIVER TO{address?.label ? ` · ${address.label}` : ''}</span><strong>{customer.loading ? 'Loading your address…' : address ? addressText(address) : customer.error ? 'Delivery address unavailable' : 'Add delivery address'}</strong></span>
        <span className="home-deliver-to-action">{open ? 'Close' : customer.loading ? 'View' : address ? 'Change' : customer.error ? 'Review' : 'Add'}<span aria-hidden="true">{open ? '⌃' : '›'}</span></span>
      </button>
      <div id="home-delivery-editor" hidden={!open}>{open && <div className="home-delivery-editor-body"><AddressBook customer={editorCustomer} user={user} startAdding={!address && !customer.loading && !customer.error} /><button className="text-button" onClick={close}>Done</button></div>}</div>
    </div>
  </section>
}

export default function HomePage({ customer, user, history, navigate, reorder, cart, quantity, changeQuantity, cartLoading }) {
  return <div className="home-page">
    <HomeDeliveryAddress key={user?.id || 'guest'} customer={customer} user={user} />
    <section className="home-hero-shell wrap">
      <div className="home-hero">
        <div className="home-hero-copy">
          <span className="home-location"><span aria-hidden="true" />YOUR NEIGHBOURHOOD WATER RUN</span>
          <h1>Good water.<br />Less lifting.<br /><em>More living.</em></h1>
          <p>Your favourites, from the bottle to the dispenser. Order for your home or office and leave the water run to us.</p>
          <div className="home-hero-actions"><button className="primary" onClick={() => navigate('shop')}>Shop water <CartIcon /></button><a className="home-how-link" href="#home-how-it-works">How it works <span aria-hidden="true">↓</span></a></div>
          <div className="home-hero-assurance"><HomeIcon name="delivery" /><span>Free delivery within Brains &amp; Hammers</span></div>
        </div>
        <div className="home-hero-visual">
          <img className="home-hero-image" src="/images/water-brands-hero-blue.png" alt="CWAY dispenser water and packs of CWAY, Nestlé Pure Life, Swan and Aquafina bottled water" fetchPriority="high" width="1254" height="1254" />
          <div className="home-image-label"><span>FROM YOUR FIRST SIP</span><strong>To your next refill.</strong></div>
          <div className="home-delivery-label"><span className="home-icon-tile"><HomeIcon name="pin" /></span><div><strong>Right to your doorstep</strong><span>Galadimawa, Abuja</span></div></div>
        </div>
      </div>
      <div className="home-benefit-row">{[['delivery', 'Delivery on us', 'Within our estate delivery area'], ['exchange', 'Easy bottle exchanges', 'Your empty bottle, a fresh refill'], ['clock', 'A time that works for you', 'Schedule your delivery at checkout']].map(([icon, title, detail]) => <div key={icon}><HomeIcon name={icon} /><div><strong>{title}</strong><span>{detail}</span></div></div>)}</div>
    </section>

    <CustomerHome customer={customer} user={user} history={history} navigate={navigate} reorder={reorder} />

    <section className="home-favourites wrap" aria-labelledby="home-favourites-heading">
      <div className="home-section-heading"><div><span className="eyebrow">FOR EVERY KIND OF THIRST</span><h2 id="home-favourites-heading">Your everyday essentials.</h2><p>Stock the fridge. Fill the dispenser. Get on with your day.</p></div><button className="home-all-products" onClick={() => navigate('shop')}>Shop all water <CartIcon /></button></div>
      <div className="home-product-grid">{products.slice(0, 4).map(product => <article className="home-product-card" key={product.id}>
        <div className={`home-product-image ${product.id === 'exchange' ? 'is-dispenser' : ''}`}><span>{product.category === 'Dispenser' ? 'BOTTLE EXCHANGE' : 'BY THE PACK'}</span><img src={product.image} alt={product.imageAlt} loading="lazy" width="300" height="300" /></div>
        <div className="home-product-copy"><h3>{product.name}</h3><p>{product.detail}</p><div className="home-product-bottom"><strong>{money(product.price)}</strong>{cart[product.id] > 0 ? quantity(product) : <button className="home-add-button" disabled={cartLoading} aria-label={`Add ${product.name} to cart`} onClick={() => changeQuantity(product.id, 1)}>Add <CartIcon /></button>}</div></div>
      </article>)}</div>
      <p className="home-catalogue-note">Preview catalogue · Illustrative packaging. Table-water prices and pack sizes are provisional.</p>
    </section>

    <section className="home-how wrap" id="home-how-it-works" aria-labelledby="home-how-heading">
      <div className="home-section-heading"><div><span className="eyebrow">A LIGHTER WAY TO STOCK UP</span><h2 id="home-how-heading">Your water run, in three steps.</h2></div><p>Less to carry.<br />One less thing to think about.</p></div>
      <div className="home-steps">{[['01', 'bag', 'Pick your favourites', 'Choose your brand, pack size, and how much you need.'], ['02', 'pin', 'Tell us where & when', 'Add your address and choose a delivery time at checkout.'], ['03', 'exchange', 'We’ll take it from here', 'Have an empty bottle ready for each dispenser exchange.']].map(([number, icon, title, copy]) => <article key={number}><div className="home-step-top"><span className="home-icon-tile"><HomeIcon name={icon} /></span><span>{number}</span></div><h3>{title}</h3><p>{copy}</p></article>)}</div>
    </section>

    <section className="home-neighbourhood wrap" aria-labelledby="home-neighbourhood-heading"><div className="home-neighbourhood-card"><div><span className="home-light-eyebrow">GOOD WATER. CLOSER TO HOME.</span><h2 id="home-neighbourhood-heading">Your estate.<br />Our delivery route.</h2><p>Free delivery within Brains &amp; Hammers, Galadimawa, Abuja. No delivery code needed.</p><button className="primary" onClick={() => navigate('shop')}>Make your next water run easier <CartIcon /></button></div><div className="home-route-art"><span className="home-route-location"><HomeIcon name="pin" /> BRAINS &amp; HAMMERS · ABUJA</span><img src="/images/delivery-van.png" alt="Sabi Water delivery van" loading="lazy" width="1672" height="941" /></div></div></section>
  </div>
}
