import { useEffect, useState } from 'react'
import Brand from './Brand.jsx'
import { OWNER_EMAIL } from '../lib/supabase.js'
import { isEmailRateLimitError, sendSignInEmail, verifyCopiedSignInLink } from '../lib/appAuth.js'
import { isDirectPreviewSignIn } from '../lib/authRedirect.js'
import './rankings.css'

export default function AuthGate() {
  const directPreview = isDirectPreviewSignIn()
  const [step, setStep] = useState('request')
  const [busy, setBusy] = useState(false)
  const [signInLink, setSignInLink] = useState('')
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

  const requestLink = async () => {
    setBusy(true)
    setTone('status')
    setMessage('')
    let error
    try {
      const result = await sendSignInEmail()
      error = result.error
    } catch (caught) {
      error = caught
    } finally {
      setBusy(false)
    }
    if (error) {
      setTone('error')
      setMessage(isEmailRateLimitError(error)
        ? 'Too many sign-in emails were requested. Use the latest unused link, or try again in about an hour.'
        : (error.message || 'Could not send the sign-in link. Check your connection and try again.'))
      return
    }
    setStep(directPreview ? 'waiting' : 'verify')
    setCooldown(60)
    setMessage(directPreview
      ? 'Open the email and tap its sign-in button. It will return directly to this preview.'
      : 'Long-press the sign-in button in the email to copy its link. Do not open it in Safari.')
  }

  const verifyLink = async (link) => {
    if (!link.trim()) {
      setTone('error')
      setMessage('Copy the sign-in link from the email, then paste it here.')
      return
    }

    setBusy(true)
    setTone('status')
    setMessage('Signing in…')
    let error
    try {
      const result = await verifyCopiedSignInLink(link)
      error = result.error
    } catch (caught) {
      error = caught
    }
    setBusy(false)
    if (error) {
      setTone('error')
      setMessage(error.message || 'That link is invalid or expired. Request a new link and try again.')
    }
  }

  const submitLink = (event) => {
    event.preventDefault()
    verifyLink(signInLink)
  }

  const pasteLink = async () => {
    if (!navigator.clipboard?.readText) {
      setTone('error')
      setMessage('Paste the copied link into the field below.')
      return
    }
    try {
      const copied = await navigator.clipboard.readText()
      setSignInLink(copied)
      await verifyLink(copied)
    } catch {
      setTone('error')
      setMessage('Clipboard access was blocked. Paste the copied link into the field below.')
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-brand"><Brand /></div>
        <p className="auth-kicker">Private game library</p>
        <h1 id="auth-title">Sign in to GameDeck</h1>
        <p className="auth-copy">
          Your play history, wishlist, and rankings are personal. A passwordless email link keeps them private without another password to manage.
        </p>
        <div className="auth-email" aria-label="Authorized email">{OWNER_EMAIL}</div>
        {step === 'request' ? (
          <button type="button" className="auth-button" disabled={busy} onClick={requestLink}>
            {busy ? 'Sending…' : 'Email me a sign-in link'}
          </button>
        ) : step === 'waiting' ? (
          <div className="auth-form">
            <button type="button" className="auth-button" disabled>
              Check your email
            </button>
            <button type="button" className="auth-secondary auth-secondary-strong" onClick={() => setStep('verify')}>
              Use a copied link instead
            </button>
            <button type="button" className="auth-secondary" disabled={busy || cooldown > 0} onClick={requestLink}>
              {cooldown > 0 ? `Send another link in ${cooldown}s` : 'Send another link'}
            </button>
          </div>
        ) : (
          <form className="auth-form" onSubmit={submitLink}>
            <button type="button" className="auth-button" disabled={busy} onClick={pasteLink}>
              {busy ? 'Signing in…' : 'Paste copied link & sign in'}
            </button>
            <label className="auth-link-label" htmlFor="auth-link">Or paste the link here</label>
            <input
              id="auth-link"
              className="auth-link-input"
              type="url"
              inputMode="url"
              autoComplete="off"
              enterKeyHint="go"
              placeholder="https://…"
              value={signInLink}
              onChange={(event) => setSignInLink(event.target.value)}
              spellCheck="false"
            />
            <button type="submit" className="auth-secondary auth-secondary-strong" disabled={busy || !signInLink.trim()}>
              Sign in with pasted link
            </button>
            <button type="button" className="auth-secondary" disabled={busy || cooldown > 0} onClick={requestLink}>
              {cooldown > 0 ? `Send another link in ${cooldown}s` : 'Send another link'}
            </button>
          </form>
        )}
        {message ? <p className={`auth-message ${tone}`} role={tone === 'error' ? 'alert' : 'status'}>{message}</p> : null}
      </section>
    </main>
  )
}
