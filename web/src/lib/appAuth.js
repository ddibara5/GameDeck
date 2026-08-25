import { useEffect, useState } from 'react'
import { OWNER_EMAIL, supabase } from './supabase.js'

export function isOwnerSession(session) {
  return session?.user?.email?.toLowerCase() === OWNER_EMAIL
}

export function useAppSession() {
  const [state, setState] = useState({ loading: true, session: null })

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return
      if (error) console.error('GameDeck auth session read failed', error)
      setState({ loading: false, session: isOwnerSession(data?.session) ? data.session : null })
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (alive) setState({ loading: false, session: isOwnerSession(session) ? session : null })
    })
    return () => {
      alive = false
      listener.subscription.unsubscribe()
    }
  }, [])

  return state
}

export function sendEmailCode() {
  return supabase.auth.signInWithOtp({
    email: OWNER_EMAIL,
    options: {
      shouldCreateUser: false,
    },
  })
}

export function verifyEmailCode(token) {
  return supabase.auth.verifyOtp({
    email: OWNER_EMAIL,
    token,
    type: 'email',
  })
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
