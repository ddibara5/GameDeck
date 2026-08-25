import { useState } from 'react'
import Brand from './Brand.jsx'
import { OWNER_EMAIL } from '../lib/supabase.js'
import { sendMagicLink } from '../lib/appAuth.js'
import './rankings.css'

export default function AuthGate() {
  const [state, setState] = useState('idle')
  const [message, setMessage] = useState('')

  const requestLink = async () => {
    setState('sending')
    setMessage('')
    const { error } = await sendMagicLink()
    if (error) {
      setState('error')
      setMessage(error.message || 'Could not send the sign-in link.')
      return
    }
    setState('sent')
    setMessage(`Check ${OWNER_EMAIL} and open the link on this device.`)
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-brand"><Brand /></div>
        <p className="auth-kicker">Private game library</p>
        <h1 id="auth-title">Sign in to GameDeck</h1>
        <p className="auth-copy">
          Your play history, wishlist, and rankings are personal. A passwordless link keeps them private without another password to manage.
        </p>
        <div className="auth-email" aria-label="Authorized email">{OWNER_EMAIL}</div>
        <button type="button" className="auth-button" disabled={state === 'sending' || state === 'sent'} onClick={requestLink}>
          {state === 'sending' ? 'Sending…' : state === 'sent' ? 'Link sent' : 'Email me a sign-in link'}
        </button>
        {message ? <p className={`auth-message ${state}`} role={state === 'error' ? 'alert' : 'status'}>{message}</p> : null}
      </section>
    </main>
  )
}
