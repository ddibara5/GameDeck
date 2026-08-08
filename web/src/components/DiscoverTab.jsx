import { useEffect, useRef, useState } from 'react'
import ChatMessage from './ChatMessage.jsx'
import { getAppKey, promptForKey } from '../lib/appAuth.js'

const SUGGESTIONS = [
  'What should I play next?',
  'A new game to start from my backlog',
  'Something short to finish',
  'A hidden gem I own',
]

const STORAGE_KEY = 'gamedeck_chats_v1'
const MAX_CHATS = 40

// --- local chat history (no API cost: titles are derived client-side) -------

function loadChats() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function persistChats(chats) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats.slice(0, MAX_CHATS)))
  } catch {
    /* storage unavailable (private mode) - history just won't persist */
  }
}

function makeTitle(messages) {
  const firstUser = messages.find((m) => m.role === 'user')
  const text = (firstUser && firstUser.content ? firstUser.content : 'New chat').trim().replace(/\s+/g, ' ')
  return text.length > 42 ? `${text.slice(0, 42)}…` : text
}

function relTime(ts) {
  const diff = Date.now() - (ts || 0)
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function DiscoverTab() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [chats, setChats] = useState([])
  const [currentId, setCurrentId] = useState(null)
  const [showHistory, setShowHistory] = useState(false)
  const scrollRef = useRef(null)

  useEffect(() => {
    setChats(loadChats())
  }, [])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, sending])

  // Insert or update the active conversation in history, keeping most-recent first.
  function upsertChat(msgs, id) {
    const chatId = id || `c_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    setChats((prev) => {
      const rest = prev.filter((c) => c.id !== chatId)
      const next = [
        { id: chatId, title: makeTitle(msgs), messages: msgs, updatedAt: Date.now() },
        ...rest,
      ]
      persistChats(next)
      return next
    })
    return chatId
  }

  async function sendMessage(text) {
    const trimmed = text.trim()
    if (!trimmed || sending) return

    const nextMessages = [...messages, { role: 'user', content: trimmed }]
    setMessages(nextMessages)
    setInput('')
    setSending(true)

    // Save immediately so the chat shows in history even if the reply fails.
    const id = upsertChat(nextMessages, currentId)
    setCurrentId(id)

    try {
      const postChat = () => {
        const key = getAppKey()
        return fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(key ? { 'x-gamedeck-key': key } : {}),
          },
          body: JSON.stringify({ messages: nextMessages }),
        })
      }

      let res = await postChat()
      // If the server has a shared secret set, ask for it once and retry.
      if (res.status === 401) {
        const entered = promptForKey()
        if (entered) res = await postChat()
      }

      if (!res.ok) {
        throw new Error(`Request failed (${res.status})`)
      }

      const data = await res.json()
      const withReply = [...nextMessages, { role: 'assistant', content: data.reply || '' }]
      setMessages(withReply)
      upsertChat(withReply, id)
    } catch (err) {
      const withError = [
        ...nextMessages,
        {
          role: 'assistant',
          content: "Couldn't reach the game picker. Please try again in a moment.",
          isError: true,
        },
      ]
      setMessages(withError)
      upsertChat(withError, id)
    } finally {
      setSending(false)
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    sendMessage(input)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  function resetChat() {
    setMessages([])
    setInput('')
    setSending(false)
    setCurrentId(null)
    setShowHistory(false)
  }

  function openChat(id) {
    const chat = chats.find((c) => c.id === id)
    if (!chat) return
    setMessages(chat.messages || [])
    setCurrentId(id)
    setSending(false)
    setShowHistory(false)
  }

  function deleteChat(id, e) {
    e.stopPropagation()
    setChats((prev) => {
      const next = prev.filter((c) => c.id !== id)
      persistChats(next)
      return next
    })
    if (id === currentId) resetChat()
  }

  const hasStarted = messages.length > 0

  return (
    <div className="chat-page">
      <div className="chat-topbar">
        <h1 className="chat-topbar-title">Discover</h1>
        <div className="chat-topbar-actions">
          {chats.length > 0 && (
            <button
              type="button"
              className="chat-newchat-btn"
              onClick={() => setShowHistory((s) => !s)}
              aria-label="Chat history"
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9 9 0 0 0-9 9" />
                <path d="M3 12H1m2 0 2.5-2.5M12 7v5l3 2" />
              </svg>
              {showHistory ? 'Close' : 'History'}
            </button>
          )}
          {hasStarted && !showHistory && (
            <button
              type="button"
              className="chat-newchat-btn"
              onClick={resetChat}
              aria-label="Start a new chat"
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              New
            </button>
          )}
        </div>
      </div>

      {showHistory ? (
        <div className="chat-history">
          {chats.length === 0 ? (
            <div className="chat-history-empty">No past chats yet.</div>
          ) : (
            chats.map((c) => (
              <div
                key={c.id}
                className={`chat-history-item${c.id === currentId ? ' active' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => openChat(c.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') openChat(c.id)
                }}
              >
                <span className="chat-history-title">{c.title}</span>
                <span className="chat-history-time">{relTime(c.updatedAt)}</span>
                <button
                  type="button"
                  className="chat-history-del"
                  onClick={(e) => deleteChat(c.id, e)}
                  aria-label="Delete chat"
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>
      ) : (
        <>
          {!hasStarted && (
            <>
              <div className="chat-intro">
                <p className="page-subtitle">Ask what to play next, from the games you own or new releases.</p>
              </div>
              <div className="chat-suggestions">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="suggestion-chip"
                    onClick={() => sendMessage(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="chat-messages" ref={scrollRef}>
            {messages.map((m, idx) => (
              <ChatMessage key={idx} role={m.role} content={m.content} isError={m.isError} />
            ))}
            {sending && (
              <div className="chat-bubble-row assistant">
                <div className="chat-bubble assistant">
                  <span className="typing-indicator">
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                  </span>
                </div>
              </div>
            )}
          </div>

          <form className="chat-input-row" onSubmit={handleSubmit}>
            <textarea
              className="chat-input"
              rows={1}
              placeholder="Ask about your library…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button type="submit" className="chat-send-btn" disabled={sending || !input.trim()}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 12l16-7-6 16-2.5-6.5L4 12z" strokeLinejoin="round" strokeLinecap="round" />
              </svg>
            </button>
          </form>
        </>
      )}
    </div>
  )
}
