import { useState } from 'react'
import { apiRequest } from './api'

export default function AuthPage({ mode, navigate, onAuthenticated }) {
  const isSignUp = mode === 'signup'
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit(event) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    if (isSignUp && !String(data.get('name')).trim()) {
      setMessage('Please enter your full name.')
      return
    }
    if (isSignUp && data.get('password') !== data.get('confirmPassword')) {
      setMessage('Your passwords don’t match. Please try again.')
      return
    }
    setSubmitting(true)
    setMessage('')
    try {
      const result = await apiRequest(isSignUp ? '/auth/signup' : '/auth/signin', {
        method: 'POST',
        body: JSON.stringify({
          ...(isSignUp ? { name: String(data.get('name')).trim() } : {}),
          email: String(data.get('email')).trim(),
          password: String(data.get('password')),
        }),
      })
      onAuthenticated(result.user)
      navigate('shop')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSubmitting(false)
    }
  }

  return <section className={`auth-page wrap${isSignUp ? ' auth-signup' : ''}`}>
    <button className="back" onClick={() => navigate('landing')}>← Back to home</button>
    <div className="auth-layout">
      <aside className="auth-story">
        <div className="eyebrow">YOUR NEIGHBOURHOOD WATER RUN</div>
        <h2>Good water.<br />Closer to <em>home.</em></h2>
        <p>From your favourite bottle to your next top-up, we’re here to make the everyday a little easier.</p>
        <img src="/images/water-brands-hero.png" alt="A selection of bottled water and a CWAY dispenser bottle" width="1254" height="1254" />
        <div className="auth-story-footer"><span>✓ Free estate delivery</span><span>✓ Easy bottle exchanges</span></div>
      </aside>
      <div className="auth-form-panel">
        <div className="eyebrow">{isSignUp ? 'MAKE YOURSELF AT HOME' : 'WELCOME BACK'}</div>
        <h1>{isSignUp ? 'Your water. Your account.' : 'Good to see you again.'}</h1>
        <p className="auth-intro">{isSignUp ? 'Create an account for your everyday water runs.' : 'Sign in for your next water run.'}</p>
        <form className="auth-form" onSubmit={submit} onChange={() => setMessage('')}>
          {isSignUp && <label htmlFor="auth-name">Full name<input id="auth-name" name="name" autoComplete="name" placeholder="Your full name" required maxLength={100} /></label>}
          <label htmlFor="auth-email">Email address<input id="auth-email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required maxLength={254} /></label>
          <label htmlFor="auth-password">Password</label>
          <div className="auth-password">
            <input id="auth-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete={isSignUp ? 'new-password' : 'current-password'} placeholder={isSignUp ? 'Create a password' : 'Enter your password'} required minLength={isSignUp ? 8 : undefined} aria-describedby={isSignUp ? 'password-hint' : undefined} />
            <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide passwords' : 'Show passwords'} aria-pressed={showPassword}>{showPassword ? 'Hide' : 'Show'}</button>
          </div>
          {isSignUp && <>
            <p id="password-hint" className="auth-hint">Use at least 8 characters.</p>
            <label htmlFor="auth-confirm">Confirm password<input id="auth-confirm" name="confirmPassword" type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="Enter your password again" required minLength={8} /></label>
          </>}
          {message && <p className="auth-message" role="alert">{message}</p>}
          <button className="primary auth-submit" type="submit" disabled={submitting}>{submitting ? 'Please wait…' : isSignUp ? 'Create account' : 'Sign in'}<span aria-hidden="true">↗</span></button>
        </form>
        <p className="auth-switch">{isSignUp ? 'Already have an account?' : 'New to Sabi Water?'}{' '}<button onClick={() => navigate(isSignUp ? 'signin' : 'signup')}>{isSignUp ? 'Sign in' : 'Create an account'} <span aria-hidden="true">↗</span></button></p>
        <div className="auth-guest"><span>Just here for a top-up?</span><button onClick={() => navigate('shop')}>Continue shopping as a guest →</button></div>
        <p className="auth-preview">Your account keeps your Sabi Water access secure on this device.</p>
      </div>
    </div>
  </section>
}
