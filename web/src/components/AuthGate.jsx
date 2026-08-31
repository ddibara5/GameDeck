import { useState } from 'react'
import Brand from './Brand.jsx'
import { OWNER_EMAIL } from '../lib/supabase.js'
import {
  PASSWORD_MIN_LENGTH,
  isEmailRateLimitError,
  sendPasswordRecoveryEmail,
  signInWithPassword,
  updatePassword,
} from '../lib/appAuth.js'
import './auth.css'

export default function AuthGate({ recovery = false, onRecoveryComplete }) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [tone, setTone] = useState('status')
  const [message, setMessage] = useState('')

  const submitSignIn = async (event) => {
    event.preventDefault()
    if (!password) return
    setBusy(true)
    setTone('status')
    setMessage('Signing in…')
    let error
    try {
      const result = await signInWithPassword(password)
      error = result.error
    } catch (caught) {
      error = caught
    }
    setBusy(false)
    if (error) {
      setTone('error')
      setMessage('That password is incorrect. Try again or reset it below.')
    }
  }

  const requestReset = async () => {
    setBusy(true)
    setTone('status')
    setMessage('Sending a secure password link…')
    let error
    try {
      const result = await sendPasswordRecoveryEmail()
      error = result.error
    } catch (caught) {
      error = caught
    }
    setBusy(false)
    if (error) {
      setTone('error')
      setMessage(isEmailRateLimitError(error)
        ? 'A password email was sent recently. Use the latest email or try again later.'
        : (error.message || 'Could not send the password email. Try again.'))
      return
    }
    setResetSent(true)
    setTone('status')
    setMessage('Check your email. The secure link will return here so you can choose a password.')
  }

  const submitPassword = async (event) => {
    event.preventDefault()
    if (password.length < PASSWORD_MIN_LENGTH) {
      setTone('error')
      setMessage(`Use at least ${PASSWORD_MIN_LENGTH} characters.`)
      return
    }
    if (password !== confirmPassword) {
      setTone('error')
      setMessage('The passwords do not match.')
      return
    }

    setBusy(true)
    setTone('status')
    setMessage('Saving your password…')
    let error
    try {
      const result = await updatePassword(password)
      error = result.error
    } catch (caught) {
      error = caught
    }
    setBusy(false)
    if (error) {
      setTone('error')
      setMessage(error.message || 'Could not save that password. Try another one.')
      return
    }
    setPassword('')
    setConfirmPassword('')
    onRecoveryComplete?.()
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-brand"><Brand /></div>
        <p className="auth-kicker">Private access</p>
        <h1 id="auth-title">{recovery ? 'Set password' : 'Sign in'}</h1>
        <p className="auth-copy">
          {recovery
            ? `Choose the password you’ll use for GameDeck from now on.`
            : 'Use your private GameDeck account. New accounts cannot be created.'}
        </p>

        {message ? <p className={`auth-message ${tone}`} role={tone === 'error' ? 'alert' : 'status'}>{message}</p> : null}

        <form className="auth-form auth-password-form" onSubmit={recovery ? submitPassword : submitSignIn}>
          <label className="auth-link-label" htmlFor="auth-email">Email</label>
          <input
            id="auth-email"
            className="auth-link-input"
            type="email"
            value={OWNER_EMAIL}
            autoComplete="username"
            readOnly
          />

          <label className="auth-link-label" htmlFor="auth-password">
            {recovery ? 'New password' : 'Password'}
          </label>
          <div className="auth-password-wrap">
            <input
              id="auth-password"
              className="auth-link-input auth-password-input"
              type={showPassword ? 'text' : 'password'}
              value={password}
              minLength={recovery ? PASSWORD_MIN_LENGTH : undefined}
              autoComplete={recovery ? 'new-password' : 'current-password'}
              onChange={(event) => setPassword(event.target.value)}
              autoFocus
              required
            />
            <button
              type="button"
              className="auth-password-toggle"
              onClick={() => setShowPassword((shown) => !shown)}
              aria-pressed={showPassword}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>

          {recovery ? (
            <>
              <p className="auth-password-hint">At least {PASSWORD_MIN_LENGTH} characters</p>
              <label className="auth-link-label" htmlFor="auth-password-confirm">Confirm password</label>
              <input
                id="auth-password-confirm"
                className="auth-link-input"
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                minLength={PASSWORD_MIN_LENGTH}
                autoComplete="new-password"
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
              />
            </>
          ) : null}

          <button type="submit" className="auth-button" disabled={busy || !password || (recovery && !confirmPassword)}>
            {busy ? (recovery ? 'Saving…' : 'Signing in…') : (recovery ? 'Save password' : 'Sign in')}
          </button>
        </form>

        {!recovery ? (
          <div className="auth-recovery">
            <button type="button" className="auth-secondary auth-secondary-strong" disabled={busy || resetSent} onClick={requestReset}>
              {resetSent ? 'Password email sent' : 'Set or reset password'}
            </button>
            <p className="auth-security-note">Only the existing owner account can receive a password link.</p>
          </div>
        ) : null}
      </section>
    </main>
  )
}
