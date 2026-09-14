import ReceiptIcon from './ReceiptIcon'
import CartIcon from './CartIcon'
import { OrderStatus } from './Delivery'

export function CustomerHome({ customer, user, history, navigate, reorder }) {
  return <section className="home-overview wrap" aria-label="Your delivery overview"><div className="home-overview-card">
    <div className="home-overview-welcome"><span className="eyebrow">YOUR WATER, YOUR WAY</span><h2>{user ? `Welcome back, ${user.name.split(' ')[0]}.` : 'Your next water run.'}</h2><p>{user ? 'Your next water run starts here.' : 'Find your favourites and we’ll take it from there.'}</p></div>
    <div className="home-overview-order"><span className="home-overview-label">YOUR LATEST ORDER</span>{customer.loading ? <p role="status">Loading your orders…</p> : history.length ? <><strong>{history[0].preview ? 'Test order' : 'Order'} · {history[0].status}</strong><details><summary>View order progress</summary><OrderStatus order={history[0]} /></details><button className="text-button" onClick={() => reorder(history[0])}>Order again <CartIcon /></button></> : <><strong>Your first water run awaits.</strong><button className="text-button" onClick={() => navigate('shop')}>Find your favourites <CartIcon /></button></>}{history.length > 0 && <button className="text-button" onClick={() => navigate('orders')}>All orders <ReceiptIcon /></button>}</div>
  </div>{customer.error && <p className="error" role="alert">{customer.error}</p>}</section>
}
