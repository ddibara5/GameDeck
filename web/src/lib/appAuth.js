import { useEffect, useState } from 'react'
import { OWNER_EMAIL, supabase } from './supabase.js'
import { passwordRecoveryRedirectUrl } from './authRedirect.js'

export const PASSWORD_MIN_LENGTH = 12

export function isOwnerSession(session) {
  return session?.user?.email?.toLowerCase() === OWNER_EMAIL
}

export function useAppSession() {
  const [state, setState] = useState({ loading: true, session: null, recovery: false })

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return
      if (error) console.error('GameDeck auth session read failed', error)
      const session = isOwnerSession(data?.session) ? data.session : null
      setState({ loading: false, session, recovery: Boolean(session && isPasswordRecoveryLocation()) })
    })
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!alive) return
      const session = isOwnerSession(nextSession) ? nextSession : null
      setState((current) => ({
        loading: false,
        session,
        recovery: Boolean(session && (event === 'PASSWORD_RECOVERY' || current.recovery)),
      }))
    })
    return () => {
      alive = false
      listener.subscription.unsubscribe()
    }
  }, [])

  const finishRecovery = () => {
    try {
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`)
    } catch {
      /* URL cleanup is cosmetic; the updated session is already valid */
    }
    setState((current) => ({ ...current, recovery: false }))
  }

  return { ...state, finishRecovery }
}

function isPasswordRecoveryLocation() {
  try {
    const query = new URLSearchParams(window.location.search)
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    return query.get('type') === 'recovery' || hash.get('type') === 'recovery'
  } catch {
    return false
  }
}

export function signInWithPassword(password) {
  return supabase.auth.signInWithPassword({
    email: OWNER_EMAIL,
    password,
  })
}

export function sendPasswordRecoveryEmail() {
  return supabase.auth.resetPasswordForEmail(OWNER_EMAIL, {
    redirectTo: passwordRecoveryRedirectUrl(),
  })
}

export function updatePassword(password) {
  return supabase.auth.updateUser({ password })
}

export function isEmailRateLimitError(error) {
  return error?.status === 429
    || error?.code === 'over_email_send_rate_limit'
    || /rate limit/i.test(error?.message || '')
}

export async function signOut() {
  await supabase.auth.signOut()
}

export async function authFetch(input, init = {}) {
  const { data, error } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  if (error || !token) throw new Error('Your GameDeck session has expired. Sign in again.')
  const headers = new Headers(init.headers || {})
  headers.set('Authorization', `Bearer ${token}`)
  return fetch(input, { ...init, headers })
}
