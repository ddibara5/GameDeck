import { useEffect, useState } from 'react'
import Brand from './Brand.jsx'
import { OWNER_EMAIL } from '../lib/supabase.js'
import { isEmailRateLimitError, sendEmailCode, verifyEmailCode } from '../lib/appAuth.js'
import './rankings.css'

export default function AuthGate() {
  const [step, setStep] = useState('request')
  const [busy, setBusy] = useState(false)
  const [code, setCode] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const [tone, setTone] = useState('status')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!cooldown) return undefined
    const timer = window.setInterval(() => {
      setCooldown((seconds) => Math.max(0, seconds - 1))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [cooldown])

  const requestCode = async () => {
    setBusy(true)
    setTone('status')
    setMessage('')
    const { error } = await sendEmailCode()
    setBusy(false)
    if (error) {
      setTone('error')
      setMessage(isEmailRateLimitError(error)
        ? 'Too many sign-in emails were requested. Use the latest code, or try again in about an hour.'
        : (error.message || 'Could not send the sign-in code.'))
      return
    }
    setStep('verify')
    setCooldown(60)
    setMessage(`Enter the six-digit code sent to ${OWNER_EMAIL}.`)
  }

  const submitCode = async (event) => {
    event.preventDefault()
    const token = code.replace(/\D/g, '')
    if (token.length !== 6) {
      setTone('error')
      setMessage('Enter the six-digit code from the email.')
      return
    }

    setBusy(true)
    setTone('status')
    setMessage('Signing in…')
    const { error } = await verifyEmailCode(token)
    setBusy(false)
    if (error) {
      setTone('error')
      setMessage(error.message || 'That code is invalid or expired. Request a new code and try again.')
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-brand"><Brand /></div>
        <p className="auth-kicker">Private game library</p>
        <h1 id="auth-title">Sign in to GameDeck</h1>
        <p className="auth-copy">
          Your play history, wishlist, and rankings are personal. A one-time email code keeps them private without another password to manage.
        </p>
        <div className="auth-email" aria-label="Authorized email">{OWNER_EMAIL}</div>
        {step === 'request' ? (
          <button type="button" className="auth-button" disabled={busy} onClick={requestCode}>
            {busy ? 'Sending…' : 'Email me a sign-in code'}
          </button>
        ) : (
          <form className="auth-form" onSubmit={submitCode}>
            <label className="auth-code-label" htmlFor="auth-code">Six-digit code</label>
            <input
              id="auth-code"
              className="auth-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              enterKeyHint="done"
              maxLength="6"
              pattern="[0-9]{6}"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              autoFocus
            />
            <button type="submit" className="auth-button" disabled={busy || code.length !== 6}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
            <button type="button" className="auth-secondary" disabled={busy || cooldown > 0} onClick={requestCode}>
              {cooldown > 0 ? `Send another code in ${cooldown}s` : 'Send another code'}
            </button>
          </form>
        )}
        {message ? <p className={`auth-message ${tone}`} role={tone === 'error' ? 'alert' : 'status'}>{message}</p> : null}
      </section>
    </main>
  )
}
