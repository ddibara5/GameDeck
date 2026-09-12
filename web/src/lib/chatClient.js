// Ask GameDeck network client.
//
// Ports the Expo pilot's requestChatReply (lib/ask-gamedeck.ts): POST the
// truncated message list to /api/chat with the Supabase session token re-fetched
// per request, non-streaming, with the pilot's exact error mapping. The
// AbortController and its 120s client timeout live with the caller, which turns
// the send button into Cancel while a request is in flight.

import { supabase } from './supabase.js'
import { ChatRequestError, chatRequestMessages, validateMessages } from './chatRequest.js'

export { ChatRequestError }

export async function requestChatReply(messages, signal, gameTitle) {
  const requestMessages = chatRequestMessages(messages, gameTitle)
  validateMessages(requestMessages)
  const { data, error } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  if (error || !token)
    throw new ChatRequestError('Your session has expired. Please sign in again.')
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ messages: requestMessages }),
    signal,
  })
  if (response.status === 401 || response.status === 403)
    throw new ChatRequestError('Your session has expired. Please sign in again.')
  if (response.status === 413)
    throw new ChatRequestError('This conversation is too long. Start a new chat to continue.')
  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After')
    const seconds = Number(retryAfter)
    throw new ChatRequestError(
      retryAfter && Number.isFinite(seconds) && seconds > 0
        ? `Please try again in ${Math.ceil(seconds)} seconds.`
        : 'Too many requests. Please try again shortly.',
    )
  }
  if (response.status === 400)
    throw new ChatRequestError('That conversation could not be sent. Check the last message and try again.')
  if (!response.ok)
    throw new ChatRequestError('GameDeck could not answer right now. Please try again.')
  const payload = await response.json()
  if (
    !payload ||
    typeof payload !== 'object' ||
    typeof payload.reply !== 'string' ||
    !payload.reply.trim()
  ) {
    throw new ChatRequestError('GameDeck returned an incomplete answer. Please try again.')
  }
  return payload.reply.trim()
}
