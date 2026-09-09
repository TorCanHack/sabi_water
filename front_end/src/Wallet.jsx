import { useEffect, useState } from 'react'
import { apiRequest } from './api'
import { money } from './data/products'
import { topupAmountKobo } from './walletAmounts'

const refreshWallet = () => window.dispatchEvent(new Event('sabi-orders-changed'))
function clearConfirmedAttempt(userId, topup) {
  try {
    const key = `sabi-wallet-attempt:${userId}:${topup.mode}`
    const attempt = JSON.parse(sessionStorage.getItem(key))
    if (attempt?.reference === topup.reference) sessionStorage.removeItem(key)
  } catch { /* Server references remain the source of truth. */ }
}

export function WalletPanel({ user, wallet, error, navigate }) {
  const [amount, setAmount] = useState('5000')
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [failure, setFailure] = useState('')
  const [older, setOlder] = useState({ entries: [], nextCursor: undefined })
  if (!user) return <div className="customer-card"><p>Sign in to top up your wallet and pay for water orders.</p><button className="primary" onClick={() => navigate('signin')}>Sign in</button></div>
  if (!wallet) return <p role="status">{error || 'Loading your wallet…'}</p>
  const cursor = older.nextCursor === undefined ? wallet.nextCursor : older.nextCursor
  const entries = [...new Map([...wallet.entries, ...older.entries].map(entry => [entry.id, entry])).values()]
  async function topup(event) {
    event.preventDefault()
    if (busy) return
    setBusy('topup'); setFailure(''); setMessage('')
    try {
      const amountKobo = topupAmountKobo(amount)
      if (amountKobo === null) throw new Error('Enter an amount between ₦100 and ₦1,000,000, with at most two decimal places.')
      const key = `sabi-wallet-attempt:${user.id}:${wallet.mode}`
      let attempt
      try { attempt = JSON.parse(sessionStorage.getItem(key)) } catch { /* No previous attempt. */ }
      if (attempt?.amountKobo !== amountKobo) {
        attempt = { checkoutId: crypto.randomUUID(), amountKobo }
        sessionStorage.setItem(key, JSON.stringify(attempt))
      }
      const { topup } = await apiRequest('/customer/wallet/topups', { method: 'POST', body: JSON.stringify(attempt) })
      sessionStorage.setItem(key, JSON.stringify({ ...attempt, reference: topup.reference }))
      refreshWallet()
      if (topup.status === 'paid') {
        sessionStorage.removeItem(key)
        setMessage('This top-up has already been credited. Your balance is updating.')
      } else if (topup.authorizationUrl) window.location.assign(topup.authorizationUrl)
      else setMessage('This top-up is awaiting confirmation. Check its payment status below before starting another one.')
    } catch (error) { setFailure(error.message); refreshWallet() } finally { setBusy('') }
  }
  async function check(reference) {
    setBusy(reference); setFailure(''); setMessage('')
    try {
      const { topup } = await apiRequest(`/customer/wallet/topups/${encodeURIComponent(reference)}/verify`, { method: 'POST' })
      clearConfirmedAttempt(user.id, topup)
      setMessage('Top-up confirmed. Your wallet balance is updating.')
      refreshWallet()
    } catch (error) { setFailure(error.message) } finally { setBusy('') }
  }
  async function loadMore() {
    setBusy('history'); setFailure('')
    try {
      const { wallet: page } = await apiRequest(`/customer/wallet?before=${encodeURIComponent(cursor)}`)
      if (page.mode === wallet.mode) setOlder(previous => ({ entries: [...previous.entries, ...page.entries], nextCursor: page.nextCursor }))
    } catch (error) { setFailure(error.message) } finally { setBusy('') }
  }
  return <div className="wallet-content">
    <div className="customer-card wallet-card">
      <div className="wallet-heading"><h2>Your water wallet</h2><span className="status-tag">{wallet.mode === 'test' ? 'Test wallet' : 'Live wallet'}</span></div>
      <p>{wallet.mode === 'test' ? 'Test funds only. No real money is charged or available to spend in the live wallet.' : 'Top up securely with Paystack and use your balance for water orders.'}</p>
      <div className="wallet-balance"><span>Available balance</span><strong>{money(wallet.balanceKobo / 100)}</strong></div>
      <form className="wallet-topup-form" onSubmit={topup}>
        <label htmlFor="wallet-topup-amount">Top-up amount (₦)</label>
        <input id="wallet-topup-amount" inputMode="decimal" type="text" required value={amount} onChange={event => setAmount(event.target.value)} aria-describedby="wallet-topup-hint" />
        <small id="wallet-topup-hint">₦100–₦1,000,000. Your balance updates after Paystack confirms payment.</small>
        <button type="submit" className="primary" disabled={Boolean(busy) || !wallet.topupsEnabled}>{busy === 'topup' ? 'Opening Paystack…' : wallet.mode === 'test' ? 'Add test funds via Paystack' : 'Top up with Paystack'}</button>
        {!wallet.topupsEnabled && <p>Top-ups are temporarily unavailable. Existing funds remain in your wallet.</p>}
      </form>
      <p>Cancelled wallet orders are refunded here automatically.</p>
      <button type="button" className="text-button" onClick={() => navigate('shop')}>Shop with your wallet →</button>
    </div>
    {(failure || error) && <p className="error" role="alert">{failure || error}</p>}
    {message && <p role="status">{message}</p>}
    {wallet.pendingTopups.length > 0 && <div className="wallet-history"><h3>Awaiting payment confirmation</h3>{wallet.pendingTopups.map(topup => <article className="wallet-entry" key={topup.reference}><div><strong>{money(topup.amountKobo / 100)}</strong><small>{topup.reference}</small><small>{new Date(topup.createdAt).toLocaleString('en-NG')}</small></div><div className="card-actions">{topup.authorizationUrl && <a className="text-button" href={topup.authorizationUrl}>Continue payment</a>}<button type="button" className="text-button" disabled={Boolean(busy)} onClick={() => check(topup.reference)}>{busy === topup.reference ? 'Checking…' : 'Check payment'}</button></div></article>)}</div>}
    <div className="wallet-history"><h3>Transaction history</h3>{entries.length ? <>{entries.map(entry => <article className="wallet-entry" key={entry.id}><div><strong>{({ topup: 'Wallet top-up', purchase: 'Order payment', refund: 'Order refund' })[entry.kind]}</strong><small>{entry.reference}</small><small>{new Date(entry.createdAt).toLocaleString('en-NG')}</small></div><div><strong>{entry.amountKobo > 0 ? '+' : '−'}{money(Math.abs(entry.amountKobo) / 100)}</strong><small>Balance after: {money(entry.balanceAfterKobo / 100)}</small></div></article>)}{cursor && <button type="button" className="text-button" disabled={Boolean(busy)} onClick={loadMore}>{busy === 'history' ? 'Loading…' : 'Load older transactions'}</button>}</> : <p>No transactions yet. Confirmed top-ups, payments and refunds will appear here.</p>}</div>
  </div>
}

export function WalletReturn({ reference, user, navigate }) {
  const [state, setState] = useState({ topup: null, busy: false, error: '' })
  useEffect(() => {
    if (!user) return
    let active = true
    apiRequest(`/customer/wallet/topups/${encodeURIComponent(reference)}/verify`, { method: 'POST' }).then(({ topup }) => {
      if (active) { clearConfirmedAttempt(user.id, topup); setState({ topup, busy: false, error: '' }); refreshWallet() }
    }).catch(error => { if (active) setState({ topup: null, busy: false, error: error.message }) })
    return () => { active = false }
  }, [reference, user])
  async function check() {
    setState({ topup: null, busy: true, error: '' })
    try {
      const { topup } = await apiRequest(`/customer/wallet/topups/${encodeURIComponent(reference)}/verify`, { method: 'POST' })
      clearConfirmedAttempt(user.id, topup)
      setState({ topup, busy: false, error: '' }); refreshWallet()
    } catch (error) { setState({ topup: null, busy: false, error: error.message }) }
  }
  return <section className="confirmation wrap"><div className="eyebrow">WALLET TOP-UP</div><h1>{user && state.topup ? 'Wallet credited.' : 'Check your top-up.'}</h1><p>{reference}</p>{!user ? <><p>Sign in to the account used for this top-up.</p><button className="primary" onClick={() => navigate('signin')}>Sign in</button></> : <>{state.topup ? <p>{money(state.topup.amountKobo / 100)} added to your {state.topup.mode === 'test' ? 'test' : 'live'} wallet.</p> : <><p>Your wallet is credited only after payment is confirmed.</p>{state.error && <p className="error" role="alert">{state.error}</p>}<button className="primary" disabled={state.busy} onClick={check}>{state.busy ? 'Checking…' : 'Check payment status'}</button></>}<button className="text-button" onClick={() => { window.history.replaceState({}, '', window.location.pathname); navigate('account') }}>View wallet →</button></>}</section>
}
