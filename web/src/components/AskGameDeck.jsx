import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import AskMessage from './AskMessage.jsx'
import AskHistory from './AskHistory.jsx'
import {
  createConversation,
  loadActiveId,
  loadConversations,
  loadMessages,
  persistActiveId,
  saveMessage,
} from '../lib/askStore.js'
import { checkChatCanceled } from '../lib/chatRequest.js'
import { ChatRequestError, requestChatReply } from '../lib/chatClient.js'
import './ask.css'

// Ask GameDeck parity with the Expo pilot (screens/ask.tsx): unlimited
// on-device history, contextual conversations per game (never an auto-sent
// prompt), send that becomes cancel while in flight, and retry without a
// duplicate user message.

const DEFAULT_STARTERS = [
  'Recommend something like my favorites',
  'What should I play next?',
  'Compare two games for me',
]

function contextualStarters(gameTitle) {
  return [
    `Would I like ${gameTitle}?`,
    `What should I know before playing ${gameTitle}?`,
    `Recommend games like ${gameTitle}`,
  ]
}

const SEND_TIMEOUT_MS = 120000

function HistoryIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  )
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="7" y="7" width="10" height="10" rx="2" />
    </svg>
  )
}

export default function AskGameDeck({ context, initialInput, onInitialInputConsumed }) {
  const contextGameId = context?.gameId ?? null
  const contextGameTitle = context?.gameTitle ?? null

  const [conversations, setConversations] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState(initialInput || '')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const [historyOpen, setHistoryOpen] = useState(false)

  const listRef = useRef(null)
  const inputRef = useRef(null)
  const controllerRef = useRef(null)
  const stickRef = useRef(true)
  const activeIdRef = useRef(null)
  activeIdRef.current = activeId

  const refreshConversations = useCallback(async () => {
    setConversations(loadConversations())
  }, [])

  const activate = useCallback(
    async (conversation) => {
      setActiveId(conversation.id)
      activeIdRef.current = conversation.id
      persistActiveId(conversation.id)
      setMessages(await loadMessages(conversation.id))
      setError(null)
      setHistoryOpen(false)
    },
    [],
  )

  const newConversation = useCallback(
    async (ctx) => {
      const conversation = await createConversation(
        ctx ? { gameId: ctx.gameId ?? null, gameTitle: ctx.gameTitle ?? null } : null,
      )
      await refreshConversations()
      await activate(conversation)
      return conversation
    },
    [activate, refreshConversations],
  )

  // Open: a contextual game always starts a brand-new conversation; with no
  // context resume the session's conversation, else the most recent, else a
  // fresh one.
  useEffect(() => {
    let alive = true
    if (initialInput && onInitialInputConsumed) onInitialInputConsumed()
    ;(async () => {
      const existing = loadConversations()
      setConversations(existing)
      if (contextGameId) {
        const conversation = await createConversation({ gameId: contextGameId, gameTitle: contextGameTitle })
        if (!alive) return
        await refreshConversations()
        await activate(conversation)
        return
      }
      const sessionId = loadActiveId()
      const resumed = sessionId && existing.find((c) => c.id === sessionId)
      const picked = resumed || existing[0]
      if (!alive) return
      if (picked) await activate(picked)
      else await newConversation(null)
    })()
    return () => {
      alive = false
      if (controllerRef.current) controllerRef.current.abort()
    }
    // Mount only: a changing game context is handled below so switching games
    // mid-session starts a new conversation without losing this one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const seenContextRef = useRef(contextGameId)
  useEffect(() => {
    if (contextGameId && contextGameId !== seenContextRef.current) {
      seenContextRef.current = contextGameId
      newConversation({ gameId: contextGameId, gameTitle: contextGameTitle })
    }
  }, [contextGameId, contextGameTitle, newConversation])

  // Auto-scroll only while the user is near the bottom (within 100px).
  const onScroll = () => {
    const el = listRef.current
    if (!el) return
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100
  }

  useLayoutEffect(() => {
    const el = listRef.current
    if (el && stickRef.current) el.scrollTop = el.scrollHeight
  }, [messages, sending, error])

  const activeConversation = conversations.find((c) => c.id === activeId) || null

  const deliver = async (requestMessages, controller, conversation) => {
    setSending(true)
    setError(null)
    const timeout = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS)
    try {
      checkChatCanceled(controller.signal)
      const reply = await requestChatReply(
        requestMessages,
        controller.signal,
        conversation?.contextGameTitle,
      )
      checkChatCanceled(controller.signal)
      const saved = await saveMessage(conversation.id, 'assistant', reply)
      if (activeIdRef.current === conversation.id) {
        setMessages((prev) => [...prev, saved])
      }
      await refreshConversations()
    } catch (requestError) {
      if (requestError?.name === 'AbortError') {
        setError('The request was canceled. You can resend your message when ready.')
      } else if (requestError instanceof ChatRequestError) {
        setError(requestError.message)
      } else {
        setError('GameDeck could not answer right now. Please try again.')
      }
      // The last user message stays in the conversation; Retry re-sends the
      // same turn without writing a duplicate.
    } finally {
      clearTimeout(timeout)
      if (controllerRef.current === controller) controllerRef.current = null
      setSending(false)
    }
  }

  const send = async () => {
    const content = input.trim()
    if (!content || sending || !activeId || !activeConversation) return
    if (controllerRef.current) controllerRef.current.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    const conversation = activeConversation
    setInput('')
    stickRef.current = true
    const saved = await saveMessage(activeId, 'user', content)
    const next = [...messages, saved]
    setMessages(next)
    await refreshConversations()
    await deliver(
      next.map((m) => ({ role: m.role, content: m.content })),
      controller,
      conversation,
    )
  }

  const retry = async () => {
    if (sending || !activeConversation) return
    if (controllerRef.current) controllerRef.current.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    stickRef.current = true
    await deliver(
      messages.map((m) => ({ role: m.role, content: m.content })),
      controller,
      activeConversation,
    )
  }

  const cancel = () => {
    if (controllerRef.current) controllerRef.current.abort()
  }

  const onNewChat = () => {
    if (controllerRef.current) controllerRef.current.abort()
    setInput('')
    newConversation(
      contextGameId ? { gameId: contextGameId, gameTitle: contextGameTitle } : null,
    )
  }

  const starters = contextGameTitle ? contextualStarters(contextGameTitle) : DEFAULT_STARTERS
  const empty = messages.length === 0 && !sending

  return (
    <div className="ask-screen">
      {contextGameTitle ? (
        <div className="ask-context">
          <span className="ask-context-chip">About {contextGameTitle}</span>
        </div>
      ) : null}

      <div className="ask-list" ref={listRef} onScroll={onScroll} role="log" aria-label="Conversation">
        {empty ? (
          <div className="ask-empty">
            <div className="ask-empty-title">
              {contextGameTitle ? `Ask about ${contextGameTitle}` : 'Ask GameDeck'}
            </div>
            <div className="ask-empty-sub">
              Game recommendations, comparisons, and strategy, grounded in your library.
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <AskMessage key={message.id} role={message.role} content={message.content} />
          ))
        )}
        {sending ? <AskMessage role="assistant" pending /> : null}
      </div>

      {error ? (
        <div className="ask-notice" role="alert">
          <div>{error}</div>
          <div className="ask-notice-actions">
            <button type="button" className="ask-notice-btn" onClick={retry}>
              Retry
            </button>
            <button type="button" className="ask-notice-btn" onClick={() => setError(null)}>
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      {empty ? (
        <div className="ask-footer" style={{ paddingTop: 0 }}>
          {starters.map((starter) => (
            <button
              key={starter}
              type="button"
              className="ask-notice-btn"
              style={{ minHeight: 44, borderRadius: 12, textAlign: 'left' }}
              onClick={() => {
                setInput(starter)
                inputRef.current?.focus()
              }}
            >
              {starter}
            </button>
          ))}
        </div>
      ) : null}

      <div className="ask-footer">
        <div className="ask-row">
          <button type="button" className="ask-toolbtn" onClick={onNewChat} aria-label="Start a new chat">
            <PlusIcon />
            New chat
          </button>
          <button
            type="button"
            className="ask-toolbtn"
            onClick={() => setHistoryOpen(true)}
            aria-label="Open chat history"
          >
            <HistoryIcon />
            History
          </button>
        </div>
        <div className="ask-row">
          <input
            ref={inputRef}
            className="ask-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                send()
              }
            }}
            placeholder="Ask GameDeck…"
            aria-label="Ask GameDeck"
            maxLength={4000}
          />
          {sending ? (
            <button type="button" className="ask-send" onClick={cancel} aria-label="Cancel sending">
              <StopIcon />
            </button>
          ) : (
            <button
              type="button"
              className="ask-send"
              onClick={send}
              disabled={!input.trim()}
              aria-label="Send message"
            >
              <SendIcon />
            </button>
          )}
        </div>
      </div>

      {historyOpen ? (
        <AskHistory
          conversations={conversations}
          activeId={activeId}
          onSelect={(id) => {
            const conversation = conversations.find((c) => c.id === id)
            if (conversation) activate(conversation)
          }}
          onClose={() => setHistoryOpen(false)}
        />
      ) : null}
    </div>
  )
}
