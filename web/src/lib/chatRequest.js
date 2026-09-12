// Ask GameDeck request shaping: truncation, client validation, error mapping.
//
// Exact port of the Expo pilot's lib/chat-request.ts plus the validateMessages
// from its lib/ask-gamedeck.ts. The client always sends the latest user message
// in full and prepends up to 15 earlier turns, each truncated to 4000 chars,
// stopping when the total would exceed 15000 chars. Stored messages are never
// truncated.

export class ChatRequestError extends Error {}

export function checkChatCanceled(signal) {
  if (!signal.aborted) return
  const error = new Error('Request canceled.')
  error.name = 'AbortError'
  throw error
}

// Keep the latest question intact while bounding the context sent to the API.
// Stored messages are never truncated.
export function chatRequestMessages(messages, gameTitle) {
  const last = messages.at(-1)
  if (last?.role !== 'user' || !last.content.trim())
    throw new ChatRequestError('Enter a message to send.')
  if (last.content.length > 4000)
    throw new ChatRequestError('Messages can be up to 4,000 characters.')
  const selected = [{ role: 'user', content: last.content }]
  let size = last.content.length
  for (let index = messages.length - 2; index >= 0 && selected.length < 15; index -= 1) {
    const message = messages[index]
    const content = message.content.slice(0, 4000)
    if (size + content.length > 15000) break
    if (!content.trim()) continue
    selected.unshift({ role: message.role, content })
    size += content.length
  }
  if (gameTitle)
    selected.unshift({
      role: 'user',
      content: `This conversation is about the game: ${gameTitle.slice(0, 160)}.`,
    })
  return selected
}

export function validateMessages(messages) {
  if (messages.length < 1 || messages.length > 16)
    throw new Error('Keep this request between 1 and 16 messages.')
  if (messages.at(-1)?.role !== 'user')
    throw new Error('Your message is required before sending.')
  const total = messages.reduce((sum, message) => {
    if (!message.content.trim() || message.content.length > 4000)
      throw new Error('Each message must be between 1 and 4,000 characters.')
    return sum + message.content.length
  }, 0)
  if (total > 16000)
    throw new Error('This conversation is too long to send. Start a new chat to continue.')
}
