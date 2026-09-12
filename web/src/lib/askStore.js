// Ask GameDeck chat history, persisted on this device.
//
// localStorage mirror of the Expo pilot's SQLite shapes (its ask-gamedeck.ts):
// conversations {id, createdAt, updatedAt, contextGameId, contextGameTitle} and
// messages {conversationId, role, content, createdAt}. Unlike the previous web
// chat store there is deliberately NO cap: the pilot keeps unlimited history.
//
// Keys stay gamedeck_chats_v1 / gamedeck_active_chat_v1 (sessionStorage for the
// active id). Old stored chats ({id, title, messages:[{role, content}],
// updatedAt}) are migrated on read: createdAt falls back to updatedAt and the
// preview is recomputed from the first user message, like the pilot's SQL does.

const STORAGE_KEY = 'gamedeck_chats_v1'
const ACTIVE_KEY = 'gamedeck_active_chat_v1'

// Storage may be unavailable (private mode) or undefined (tests/SSR). The
// in-memory fallback keeps the module total so history just doesn't persist.
const memory = new Map()

function backend(kind) {
  try {
    if (kind === 'local' && typeof localStorage !== 'undefined') return localStorage
    if (kind === 'session' && typeof sessionStorage !== 'undefined') return sessionStorage
  } catch {
    /* storage blocked */
  }
  return null
}

function read(key, kind) {
  const store = backend(kind)
  if (store) {
    try {
      const value = store.getItem(key)
      if (value != null) return value
    } catch {
      /* fall through to memory */
    }
  }
  const mem = memory.get(`${kind}:${key}`)
  return mem === undefined ? null : mem
}

function write(key, value, kind) {
  const store = backend(kind)
  if (store) {
    try {
      store.setItem(key, value)
      return
    } catch {
      /* fall through to memory */
    }
  }
  memory.set(`${kind}:${key}`, value)
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function normalizeMessage(raw, conversationId, fallbackAt) {
  const at = Number(raw.createdAt) || fallbackAt || Date.now()
  return {
    id: raw.id != null ? String(raw.id) : `${conversationId}-m${at}`,
    conversationId,
    role: raw.role === 'assistant' ? 'assistant' : 'user',
    content: typeof raw.content === 'string' ? raw.content : '',
    createdAt: at,
  }
}

function normalizeConversation(raw) {
  const updatedAt = Number(raw.updatedAt) || Date.now()
  const id = String(raw.id || makeId())
  return {
    id,
    createdAt: Number(raw.createdAt) || updatedAt,
    updatedAt,
    contextGameId: raw.contextGameId ?? null,
    contextGameTitle: raw.contextGameTitle ?? null,
    messages: (Array.isArray(raw.messages) ? raw.messages : []).map((m) =>
      normalizeMessage(m, id, updatedAt),
    ),
  }
}

export function loadConversations() {
  let parsed = []
  try {
    const raw = read(STORAGE_KEY, 'local')
    parsed = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) parsed = []
  } catch {
    parsed = []
  }
  return parsed
    .map(normalizeConversation)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

function persistConversations(conversations) {
  try {
    write(STORAGE_KEY, JSON.stringify(conversations), 'local')
  } catch {
    /* storage unavailable - history just won't persist */
  }
}

// Pilot's preview: the first 100 chars of the first user message.
export function conversationPreview(conversation) {
  const first = (conversation.messages || []).find((m) => m.role === 'user')
  const text = (first && first.content ? first.content : '').trim().replace(/\s+/g, ' ')
  return text.slice(0, 100)
}

export function conversationTitle(conversation) {
  if (conversation.contextGameTitle) return `About ${conversation.contextGameTitle}`
  return conversationPreview(conversation) || 'New chat'
}

export async function createConversation(context) {
  const now = Date.now()
  const conversation = {
    id: makeId(),
    createdAt: now,
    updatedAt: now,
    contextGameId: context?.gameId ?? null,
    contextGameTitle: context?.gameTitle ?? null,
    messages: [],
  }
  const rest = loadConversations().filter((c) => c.id !== conversation.id)
  persistConversations([conversation, ...rest])
  return conversation
}

export async function loadMessages(conversationId) {
  const conversation = loadConversations().find((c) => c.id === conversationId)
  return conversation ? [...conversation.messages] : []
}

export async function saveMessage(conversationId, role, content) {
  const now = Date.now()
  const message = {
    id: makeId(),
    conversationId,
    role,
    content,
    createdAt: now,
  }
  const conversations = loadConversations()
  const conversation = conversations.find((c) => c.id === conversationId)
  if (!conversation) throw new Error('Conversation not found.')
  conversation.messages = [...conversation.messages, message]
  conversation.updatedAt = now
  conversations.sort((a, b) => b.updatedAt - a.updatedAt)
  persistConversations(conversations)
  return message
}

export function loadActiveId() {
  try {
    return read(ACTIVE_KEY, 'session')
  } catch {
    return null
  }
}

export function persistActiveId(id) {
  const store = backend('session')
  if (store) {
    try {
      if (id) store.setItem(ACTIVE_KEY, id)
      else store.removeItem(ACTIVE_KEY)
      return
    } catch {
      /* fall through to memory */
    }
  }
  if (id) memory.set(`session:${ACTIVE_KEY}`, id)
  else memory.delete(`session:${ACTIVE_KEY}`)
}
