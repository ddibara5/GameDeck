import { useEffect, useState } from 'react'
import { preloadMarkdown, sanitizeMarkdownHtml } from './ChatMessage.jsx'

// Assistant bubbles render through the same marked + DOMPurify engine as the
// rest of the app's chat replies. User bubbles stay plain text.

function SafeMarkdown({ content }) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let alive = true
    preloadMarkdown().then((fn) => {
      if (alive && fn) setReady(true)
    })
    return () => {
      alive = false
    }
  }, [])

  // pre-wrap, same as ChatMessage: the reply's own line breaks are the only
  // structure it has until the parser arrives.
  if (!ready) return <div className="ask-md-plain">{content}</div>

  const html = sanitizeMarkdownHtml(content || '')
  // eslint-disable-next-line react/no-danger
  return <div dangerouslySetInnerHTML={{ __html: html }} />
}

export default function AskMessage({ role, content, pending }) {
  const isUser = role === 'user'
  return (
    <div className={`ask-msg ${isUser ? 'user' : 'assistant'}`}>
      <div className={`ask-bubble ${isUser ? 'user' : 'assistant'}`}>
        {isUser ? (
          content
        ) : pending ? (
          <span className="ask-typing" aria-label="GameDeck is thinking">
            <span />
            <span />
            <span />
          </span>
        ) : (
          <SafeMarkdown content={content} />
        )}
      </div>
    </div>
  )
}
