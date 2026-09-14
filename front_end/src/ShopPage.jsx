import CartIcon from './CartIcon'
import { useRef, useState } from 'react'
import { matchesProduct } from '../../shared/commerce.mjs'
import { products, money } from './data/products'
import './ShopPage.css'

const categories = [
  ['All water', null],
  ['Bottled water', 'Table water'],
  ['Dispenser bottles', 'Dispenser'],
  ['Sachet water', 'Sachet water'],
  ['Ice & other products', 'Ice & other products'],
]

function ShopIcon({ name }) {
  const paths = {
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
    delivery: <><path d="M2 5h12v12H2zM14 9h4l4 5v3h-8" /><circle cx="6" cy="18" r="2" /><circle cx="18" cy="18" r="2" /></>,
    exchange: <><path d="M20 7h-6m6 0V1M4 17h6m-6 0v6" /><path d="M4 8a8 8 0 0 1 14-4l2 3M4 17l2 3a8 8 0 0 0 14-4" /></>,
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

export default function ShopPage({ category, setCategory, search, setSearch, cart, cartLoading, cartSyncing, cartError, changeQuantity, count, total, navigate }) {
  const [sort, setSort] = useState('featured')
  const searchRef = useRef(null)
  const selectedCategory = categories.find(([label]) => label === category)?.[1]
  const filtered = products.filter(product => (!selectedCategory || product.category === selectedCategory) && matchesProduct(product, search))
  const visibleProducts = [...filtered].sort((a, b) => sort === 'price-low' ? a.price - b.price : sort === 'price-high' ? b.price - a.price : sort === 'name' ? a.name.localeCompare(b.name) : 0)
  const hasFilters = category !== 'All water' || search.trim().length > 0
  function resetFilters() { setCategory('All water'); setSearch(''); searchRef.current?.focus() }

  return <section className="shop-page wrap" aria-labelledby="shop-title">
    <div className="shop-page-intro"><div><span className="eyebrow">STOCK UP. SLOW DOWN.</span><h1 id="shop-title">Find your <em>everyday refresh.</em></h1><p>From your kitchen dispenser to the meeting-room table. Your water, your way.</p></div><div className="shop-delivery-badge"><span><ShopIcon name="delivery" /></span><div><strong>Delivery on us</strong><small>Brains &amp; Hammers, Galadimawa</small></div></div></div>
    <div className="shop-layout">
      <aside className="shop-sidebar">
        <nav className="shop-category-nav" aria-label="Water categories"><h2>Shop by category</h2>{categories.map(([label, value]) => {
          const amount = products.filter(product => !value || product.category === value).length
          return <button key={label} aria-pressed={category === label} onClick={() => setCategory(label)}><span>{label}</span><small aria-label={`${amount} products`}>{amount}</small></button>
        })}</nav>
        <div className="shop-exchange-tip"><span className="shop-icon-tile"><ShopIcon name="exchange" /></span><h3>A fresh refill.<br />A lighter water run.</h3><p>Ordering a dispenser exchange? Have one empty bottle ready for every full bottle you order.</p><button onClick={() => { setCategory('Dispenser bottles'); setSearch('') }}>Shop exchanges <CartIcon /></button></div>
        <div className="shop-sidebar-cart"><div className="shop-cart-heading"><CartIcon /><strong>Your water run</strong><span>{count}</span></div><p>{cartLoading ? 'Restoring your cart…' : count ? `${count} ${count === 1 ? 'item' : 'items'} in your cart` : 'A little room for your favourites.'}</p>{count > 0 && <div className="shop-cart-subtotal"><span>Subtotal</span><strong>{money(total)}</strong></div>}<button className="primary" disabled={!count || cartLoading} onClick={() => navigate('checkout')}>View cart <CartIcon /></button></div>
      </aside>
      <div className="shop-catalogue">
        <div className="shop-search-sort"><div className="shop-search-input"><ShopIcon name="search" /><label className="shop-sr-only" htmlFor="shop-product-search">Search products</label><input ref={searchRef} id="shop-product-search" type="search" placeholder="Search brands, products or sizes" value={search} onChange={event => setSearch(event.target.value)} />{search && <button aria-label="Clear search" onClick={() => { setSearch(''); searchRef.current?.focus() }}>×</button>}</div><label className="shop-sort"><span>Sort by</span><select value={sort} onChange={event => setSort(event.target.value)}><option value="featured">Featured</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option><option value="name">Name: A–Z</option></select></label></div>
        <div className="shop-results-heading"><div><h2>{category}</h2><span role="status" aria-live="polite">{visibleProducts.length} {visibleProducts.length === 1 ? 'product' : 'products'}{search.trim() ? ` matching “${search.trim()}”` : ''}</span></div>{hasFilters && <button onClick={resetFilters}>Clear filters <span aria-hidden="true">×</span></button>}</div>
        {visibleProducts.length ? <div className="shop-product-grid">{visibleProducts.map(product => <article className={`shop-product-card shop-product-${product.id}`} key={product.id}>
          <div className="shop-card-image"><span className="shop-pack-label">{product.category === 'Dispenser' ? 'BOTTLE EXCHANGE' : 'BY THE PACK'}</span>{cart[product.id] > 0 && <span className="shop-in-cart">{cart[product.id]} in cart</span>}<img src={product.image} alt={product.imageAlt} width="300" height="300" loading="lazy" /><span className="shop-size-label">{product.size === 'REFILL' ? 'Refill' : product.size}</span></div>
          <div className="shop-card-copy"><span className="shop-card-category">{product.category === 'Dispenser' ? 'Dispenser water' : 'Bottled water'}</span><h3>{product.name}</h3><p>{product.detail}</p><div className="shop-card-price"><strong>{money(product.price)}</strong><span>per {product.category === 'Dispenser' ? 'exchange' : 'pack'}</span></div>
            {cart[product.id] > 0 ? <div className="shop-quantity" role="group" aria-label={`Quantity for ${product.name}`}><button disabled={cartLoading} aria-label={`Remove one ${product.name}`} onClick={() => changeQuantity(product.id, -1)}>−</button><span aria-live="polite">{cart[product.id]} in cart</span><button disabled={cartLoading || cart[product.id] >= 99} aria-label={`Add one ${product.name}`} onClick={() => changeQuantity(product.id, 1)}>+</button></div> : <button className="shop-add-to-cart" disabled={cartLoading} aria-label={`Add ${product.name} to cart`} onClick={() => changeQuantity(product.id, 1)}><CartIcon />Add to cart <span aria-hidden="true">+</span></button>}
          </div>
        </article>)}</div> : <div className="shop-no-results"><span className="shop-icon-tile"><ShopIcon name="search" /></span><h3>{search.trim() ? 'No matches this time.' : 'More refreshment, coming later.'}</h3><p>{search.trim() ? 'Try a different brand, product name, or size. You can also clear your filters to see all water.' : 'There are no products in this category yet. Explore our bottled water and dispenser exchanges.'}</p><button className="primary" onClick={resetFilters}>Explore all water <CartIcon /></button></div>}
        <div className="shop-catalogue-footer"><ShopIcon name="delivery" /><p>Free delivery within Brains &amp; Hammers. Choose your delivery time at checkout.</p></div><p className="shop-preview-note">Preview catalogue · Illustrative packaging. Table-water prices and pack sizes are provisional.</p>
      </div>
    </div>
    {count > 0 && <div className="shop-mobile-cart"><div><span>{cartLoading ? 'Restoring cart…' : cartError ? 'Cart needs attention' : cartSyncing ? 'Saving cart…' : `${count} ${count === 1 ? 'item' : 'items'} in cart`}</span><strong>{money(total)}</strong></div><button className="primary" disabled={cartLoading} onClick={() => navigate('checkout')}>View cart <CartIcon /></button></div>}
  </section>
}
