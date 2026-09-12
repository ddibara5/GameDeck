import { conversationPreview } from '../lib/askStore.js'

// The conversation switcher: a bottom sheet over the chat, no delete action.
// Dates match the pilot's "MMM d, h:mm a" formatting.

function formatUpdatedAt(timestamp) {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function AskHistory({ conversations, activeId, onSelect, onClose }) {
  return (
    <div className="ask-scrim" onClick={onClose}>
      <div
        className="ask-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Chat history"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="ask-sheet-head">
          <div className="ask-sheet-title">History</div>
          <button type="button" className="ask-toolbtn" onClick={onClose} aria-label="Close history">
            Close
          </button>
        </div>
        <div className="ask-sheet-list">
          {conversations.length === 0 ? (
            <div className="ask-hist-empty">No conversations yet.</div>
          ) : (
            conversations.map((conversation) => {
              const preview = conversationPreview(conversation)
              return (
                <button
                  key={conversation.id}
                  type="button"
                  className={`ask-hist-row${conversation.id === activeId ? ' active' : ''}`}
                  onClick={() => onSelect(conversation.id)}
                >
                  <span className="ask-hist-title">
                    {conversation.contextGameTitle
                      ? `About ${conversation.contextGameTitle}`
                      : preview || 'New chat'}
                  </span>
                  <span className="ask-hist-meta">{formatUpdatedAt(conversation.updatedAt)}</span>
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
