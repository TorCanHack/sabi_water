import ReceiptIcon from './ReceiptIcon'
import CartIcon from './CartIcon'
import { useState } from 'react'
import { apiRequest } from './api'
import { AddressBook } from './Delivery'
import { WalletPanel } from './Wallet'

const sections = [['profile', 'Personal details'], ['addresses', 'Saved addresses'], ['wallet', 'Wallet & payments'], ['help', 'Help & support']]

function AccountIcon({ name }) {
  const paths = {
    profile: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>,
    addresses: <><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    wallet: <><path d="M20 8V5H5a3 3 0 0 0 0 6h16v10H5a3 3 0 0 1-3-3V8" /><path d="M21 14h-5v4h5" /></>,
    help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 4 2l-1.5 1v2M12 17h.01" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3" /></>,
    logout: <><path d="M9 4H4v16h5M9 12h12m-4-4 4 4-4 4" /></>,
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function ProfileForm({ user, onUserUpdate }) {
  const [name, setName] = useState(user.name)
  const [email, setEmail] = useState(user.email)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const emailChanged = email.trim().toLowerCase() !== user.email
  const changed = name.trim().replace(/\s+/g, ' ') !== user.name || emailChanged

  function clearFeedback() { setError(''); setSuccess('') }
  function reset() {
    setName(user.name); setEmail(user.email); setPassword(''); setShowPassword(false); clearFeedback()
  }
  async function save(event) {
    event.preventDefault()
    if (busy || !changed) return
    clearFeedback(); setBusy(true)
    try {
      const { user: updated } = await apiRequest('/customer/profile', {
        method: 'PATCH',
        body: JSON.stringify({ name, email, ...(emailChanged ? { currentPassword: password } : {}) }),
      })
      onUserUpdate(updated)
      setName(updated.name); setEmail(updated.email); setPassword(''); setShowPassword(false)
      setSuccess(emailChanged ? 'Details saved. Use your new email address the next time you sign in.' : 'Your personal details have been saved.')
    } catch (error) { setError(error.message) } finally { setBusy(false) }
  }
  return <form className="profile-form" onSubmit={save} aria-busy={busy}>
    <fieldset disabled={busy}>
      <legend className="account-sr-only">Edit your personal details</legend>
      <div className="profile-fields">
        <label htmlFor="profile-name">Full name<input id="profile-name" name="name" value={name} onChange={event => { setName(event.target.value); clearFeedback() }} autoComplete="name" required minLength={2} maxLength={100} pattern=".*\S.*" /><small>Your name as you’d like us to know it.</small></label>
        <label htmlFor="profile-email">Email address<input id="profile-email" name="email" type="email" value={email} onChange={event => { setEmail(event.target.value); setPassword(''); clearFeedback() }} autoComplete="email" required maxLength={254} aria-describedby="profile-email-hint" /><small id="profile-email-hint">The email address you use to sign in.</small></label>
      </div>
      {emailChanged && <div className="profile-verification"><div className="account-inline-heading"><AccountIcon name="lock" /><strong>Confirm your email change</strong></div><p>Enter your current password to save your new sign-in email. Double-check the address before saving.</p><label htmlFor="profile-password">Current password</label><div className="profile-password"><input id="profile-password" name="currentPassword" type={showPassword ? 'text' : 'password'} value={password} onChange={event => { setPassword(event.target.value); clearFeedback() }} autoComplete="current-password" required maxLength={128} /><button type="button" onClick={() => setShowPassword(value => !value)} aria-pressed={showPassword} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? 'Hide' : 'Show'}</button></div></div>}
    </fieldset>
    {error && <p className="profile-feedback is-error" role="alert">{error}</p>}
    {success && <p className="profile-feedback is-success" role="status">{success}</p>}
    <div className="profile-actions"><span>{busy ? 'Saving your details…' : changed ? 'You have unsaved changes' : 'You’re all up to date'}</span><div><button className="account-secondary" type="button" disabled={!changed || busy} onClick={reset}>Cancel</button><button className="primary" type="submit" disabled={!changed || busy}>{busy ? 'Saving…' : 'Save changes'}<span aria-hidden="true">↗</span></button></div></div>
  </form>
}

export default function CustomerAccount({ user, customer, navigate, signOut, onUserUpdate }) {
  const [section, setSection] = useState('profile')
  const [signingOut, setSigningOut] = useState(false)
  const initials = user?.name.trim().split(/\s+/).filter(Boolean).map(part => Array.from(part)[0]).slice(0, 2).join('').toUpperCase() || 'SW'
  async function logout() { setSigningOut(true); try { await signOut() } finally { setSigningOut(false) } }
  return <section className="customer-page account-page wrap">
    <div className="account-page-heading"><div><div className="eyebrow">YOUR EVERYDAY, SIMPLIFIED</div><h1>My account</h1><p>Make yourself at home. Manage your details and your next water run.</p></div></div>
    <div className="account-layout">
      <aside className="account-sidebar">
        <div className="account-identity"><div className="account-avatar" aria-hidden="true">{initials}</div><strong>{user?.name || 'Welcome to Sabi Water'}</strong><span>{user?.email || 'A little less lifting. A lot more living.'}</span><span className="account-member">{user ? 'Sabi Water customer' : 'Make your next water run easier'}</span></div>
        <nav className="account-navigation" aria-label="Account settings">{sections.map(([id, label]) => <button key={id} aria-current={section === id ? 'page' : undefined} onClick={() => setSection(id)}><AccountIcon name={id} /><span>{label}</span><span className="account-nav-arrow" aria-hidden="true">›</span></button>)}</nav>
        {user && <button className="account-signout" disabled={signingOut} onClick={logout}><AccountIcon name="logout" />{signingOut ? 'Signing out…' : 'Sign out'}</button>}
      </aside>
      <div className="account-main">
        <section className="account-panel" hidden={section !== 'profile'} aria-labelledby="profile-heading"><div className="account-panel-heading"><span className="account-section-icon"><AccountIcon name="profile" /></span><div><h2 id="profile-heading">Personal details</h2><p>A few details that make your account yours.</p></div></div>
          {user ? <><div className="profile-summary"><div className="account-avatar small" aria-hidden="true">{initials}</div><div><strong>{user.name}</strong><span>Keep your information up to date.</span></div><span className="profile-private"><AccountIcon name="lock" />Only visible to you</span></div><ProfileForm user={user} onUserUpdate={onUserUpdate} /></> : <div className="account-guest"><span className="account-section-icon"><AccountIcon name="profile" /></span><h3>Your water. Your account.</h3><p>Sign in to manage your personal details, save delivery addresses, and keep your water wallet close.</p><div className="card-actions"><button className="primary" onClick={() => navigate('signin')}>Sign in <span aria-hidden="true">↗</span></button><button className="text-button" onClick={() => navigate('signup')}>Create an account</button></div></div>}
        </section>
        <section className="account-panel" hidden={section !== 'addresses'} aria-labelledby="addresses-heading"><div className="account-panel-heading"><span className="account-section-icon"><AccountIcon name="addresses" /></span><div><h2 id="addresses-heading">Saved addresses</h2><p>Your favourite delivery spots, ready for checkout.</p></div></div><div className="account-panel-body"><AddressBook customer={customer} user={user} /></div></section>
        <section className="account-panel" hidden={section !== 'wallet'} aria-labelledby="wallet-heading"><div className="account-panel-heading"><span className="account-section-icon"><AccountIcon name="wallet" /></span><div><h2 id="wallet-heading">Wallet &amp; payments</h2><p>Top up, track your balance, and get ready for your next order.</p></div></div><div className="account-panel-body"><WalletPanel key={`${user?.id || 'guest'}:${customer.data.wallet?.mode || ''}`} user={user} wallet={customer.data.wallet} error={customer.error} navigate={navigate} /><div className="account-payment-note"><AccountIcon name="lock" /><p>Card, bank transfer, USSD, and bank account payments are handled through Paystack at checkout. Saved payment methods are not currently available.</p></div></div></section>
        <section className="account-panel" hidden={section !== 'help'} aria-labelledby="help-heading"><div className="account-panel-heading"><span className="account-section-icon"><AccountIcon name="help" /></span><div><h2 id="help-heading">A little help with your water run</h2><p>The essentials, all in one place.</p></div></div><div className="account-panel-body account-help">
          <details open><summary>How do I place an order?</summary><p>Choose your water in the shop, add a delivery address, and select your delivery time and payment method at checkout.</p><button className="text-button" onClick={() => navigate('shop')}>Explore the shop <CartIcon /></button></details>
          <details><summary>Where do you deliver?</summary><p>We currently deliver within Brains &amp; Hammers, Galadimawa, Abuja. Add your street and house number to help us find you.</p></details>
          <details><summary>How do dispenser exchanges work?</summary><p>Have one empty dispenser bottle ready for each exchange bottle in your order.</p></details>
          <details><summary>Where can I track my order?</summary><p>Open Orders to see your delivery progress, check payment status, or reorder a previous purchase.</p><button className="text-button" onClick={() => navigate('orders')}>View my orders <ReceiptIcon /></button></details>
          <details><summary>How do I change my email?</summary><p>Update your email in Personal details and confirm with your current password. Use the new address the next time you sign in. Your orders, addresses, and wallet stay with your account.</p></details>
          <p className="account-support-note">Direct customer support and issue reporting are not available yet.</p>
        </div></section>
        <div className="account-bottom-note"><AccountIcon name="lock" /><p>{user ? 'Your details stay with your account, wherever you sign in.' : 'Sign in to keep your details with you, wherever you go.'}</p><span>SABI WATER</span></div>
      </div>
    </div>
  </section>
}
