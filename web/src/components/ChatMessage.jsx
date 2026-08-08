import { marked } from 'marked'

/**
 * Strips <script> tags defensively before rendering markdown-derived HTML.
 * This app only ever renders its own AI assistant's replies, so this is a
 * light sanity check rather than a full sanitizer.
 */
function stripScripts(html) {
  return html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
}

function SafeMarkdown({ content }) {
  const html = stripScripts(marked.parse(content || ''))
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
