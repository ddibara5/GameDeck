import { useEffect, useState } from 'react'

/**
 * `marked` is loaded ON DEMAND, and the reason is where it was landing.
 *
 * It is 35.4kB of the 69.9kB DiscoverTab chunk - a markdown parser, in the chunk
 * that also holds For you and Browse. Opening Browse paid for it. Opening For you
 * paid for it. The only thing in the app that renders markdown is the assistant's
 * replies, so it belongs behind an import() that Ask AI triggers.
 *
 * Two callers keep the seam invisible: this component falls back to plain text
 * for the frame or two before the parser lands, and DiscoverTab calls preload()
 * when the Ask sub-tab is selected, so by the time a reply exists the parser
 * almost always does too.
 */
let parse = null
let sanitize = null
let loading = null

export function preloadMarkdown() {
  if (parse) return Promise.resolve(parse)
  if (!loading) {
    loading = Promise.all([import('marked'), import('dompurify')])
      .then(([m, purifier]) => {
        parse = m.marked.parse.bind(m.marked)
        sanitize = purifier.default.sanitize.bind(purifier.default)
        return parse
      })
      .catch(() => {
        // A failed chunk fetch must not take the conversation with it. The plain
        // text below is a complete, readable reply - it is the markdown that is
        // the enhancement, not the other way round.
        loading = null
        return null
      })
  }
  return loading
}

const SANITIZE_OPTIONS = {
  USE_PROFILES: { html: true },
  FORBID_TAGS: ['style', 'form', 'input', 'button', 'iframe', 'object', 'embed'],
  FORBID_ATTR: ['style'],
}

export function sanitizeMarkdownHtml(html) {
  return sanitize ? sanitize(html, SANITIZE_OPTIONS) : ''
}

function SafeMarkdown({ content }) {
  const [ready, setReady] = useState(() => Boolean(parse))

  useEffect(() => {
    if (ready) return undefined
    let alive = true
    preloadMarkdown().then((fn) => {
      if (alive && fn) setReady(true)
    })
    return () => {
      alive = false
    }
  }, [ready])

  // pre-wrap, not a bare div: the reply's own line breaks are the only structure
  // it has until the parser arrives, and collapsing them would make the swap a
  // visible reflow rather than a change of typography.
  if (!ready) return <div className="chat-md-plain">{content}</div>

  // Assistant output and web-search evidence are untrusted at this boundary.
  // DOMPurify removes event handlers, script-bearing URL schemes, raw forms,
  // embeds and other active markup while preserving useful markdown structure.
  const html = sanitizeMarkdownHtml(parse(content || ''))
  // eslint-disable-next-line react/no-danger
  return <div dangerouslySetInnerHTML={{ __html: html }} />
}

export default function ChatMessage({ role, content, isError }) {
  const isUser = role === 'user'

  return (
    <div className={`chat-bubble-row ${isUser ? 'user' : 'assistant'}`}>
      <div className={`chat-bubble ${isUser ? 'user' : isError ? 'error' : 'assistant'}`}>
        {isUser ? content : <SafeMarkdown content={content} />}
      </div>
    </div>
  )
}
