import './SubscriptionsPage.css'

function SubscriptionIcon({ name }) {
  const paths = {
    repeat: <><path d="M20 7h-6m6 0V1M4 17h6m-6 0v6" /><path d="M4 8a8 8 0 0 1 14-4l2 3M4 17l2 3a8 8 0 0 0 14-4" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4M17 3v4M3 11h18M8 15h2M14 15h2" /></>,
    pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

export default function SubscriptionsPage({ navigate }) {
  return <section className="subscriptions-page wrap" aria-labelledby="subscriptions-title">
    <div className="subscriptions-heading"><div><span className="eyebrow">A LITTLE MORE ROUTINE. A LITTLE LESS TO REMEMBER.</span><h1 id="subscriptions-title">Subscriptions</h1><p>A simpler way to keep your everyday water topped up.</p></div><span className="subscriptions-coming"><span aria-hidden="true" />Coming later</span></div>

    <div className="subscriptions-hero"><div className="subscriptions-hero-copy"><span className="subscriptions-icon"><SubscriptionIcon name="repeat" /></span><span className="subscriptions-kicker">YOUR USUAL, ON REPEAT</span><h2>Good water.<br />Part of <em>your routine.</em></h2><p>We’re working towards recurring water deliveries for your home or office. A little less planning, a little more time for everything else.</p><div className="subscriptions-availability"><strong>Recurring deliveries aren’t available yet.</strong><span>For now, choose a one-time delivery at checkout whenever you need a top-up.</span></div><button className="primary" onClick={() => navigate('shop')}>Place a one-time order <SubscriptionIcon name="arrow" /></button></div>
      <div className="subscriptions-art" aria-hidden="true"><div className="subscriptions-orbit" /><div className="subscriptions-orbit inner" /><span className="subscriptions-orbit-icon"><SubscriptionIcon name="repeat" /></span><div className="subscriptions-bottle-card"><span>THE EVERYDAY ESSENTIAL</span><img src="/images/cway-dispenser.jpg" alt="" width="300" height="360" /><strong>Your next refill.</strong><small>One less thing on your mind.</small></div><span className="subscriptions-art-caption">A FRESH TAKE ON YOUR WATER ROUTINE</span></div>
    </div>

    <section className="subscriptions-today" aria-labelledby="subscriptions-today-title"><div className="subscriptions-section-heading"><span className="eyebrow">NO NEED TO WAIT FOR YOUR NEXT REFILL</span><h2 id="subscriptions-today-title">Make today’s water run easier.</h2><p>A few things you can already do with Sabi Water.</p></div><div className="subscriptions-options">
      {[['calendar', 'Plan a delivery', 'Choose a future delivery date and time at checkout for a one-time order.', 'Shop water', 'shop'], ['pin', 'Keep your address handy', 'Save your home or office details and select them for your next delivery.', 'Manage addresses', 'account'], ['repeat', 'Order your favourites again', 'Find a previous order and use Order again to prepare your next cart.', 'View past orders', 'orders']].map(([icon, title, copy, action, destination]) => <article key={icon}><span className="subscriptions-icon"><SubscriptionIcon name={icon} /></span><h3>{title}</h3><p>{copy}</p><button onClick={() => navigate(destination)}>{action}<SubscriptionIcon name="arrow" /></button></article>)}
    </div></section>

    <section className="subscriptions-faq" aria-labelledby="subscriptions-faq-title"><div><span className="eyebrow">A FEW THINGS TO KNOW</span><h2 id="subscriptions-faq-title">Before you<br />make it a routine.</h2><p>What’s available today, and what’s still to come.</p></div><div className="subscriptions-questions">
      <details><summary>Can I start a subscription today?<span aria-hidden="true">+</span></summary><p>Not yet. Recurring deliveries are planned for a future release. You can place individual orders through the shop in the meantime.</p></details>
      <details><summary>Can I schedule a delivery in advance?<span aria-hidden="true">+</span></summary><p>Yes. Add your water to the cart, choose “Schedule for later” at checkout, and select a future delivery date and time. This schedules one delivery, not a recurring subscription.</p></details>
      <details><summary>Will placing an order set up automatic payments?<span aria-hidden="true">+</span></summary><p>No. A one-time order does not create a subscription or a recurring charge. Choose your payment method for each order at checkout.</p></details>
      <details><summary>When will subscriptions be available?<span aria-hidden="true">+</span></summary><p>A launch date and subscription plans haven’t been announced yet. For now, shop whenever you need water or reorder from your order history.</p></details>
    </div></section>
    <div className="subscriptions-footer-note"><SubscriptionIcon name="pin" /><p>Currently serving Brains &amp; Hammers, Galadimawa, Abuja.</p></div>
  </section>
}
