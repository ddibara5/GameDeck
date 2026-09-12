import assert from 'node:assert/strict'
import test from 'node:test'

// askStore falls back to an in-memory map when storage is unavailable; stubbing
// storage gives each test a clean slate.
function stubStorage() {
  const local = new Map()
  const session = new Map()
  const api = (map) => ({
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  })
  globalThis.localStorage = api(local)
  globalThis.sessionStorage = api(session)
  return { local, session }
}

const askStore = await import('../src/lib/askStore.js')

test('old chat array shape migrates to conversations with flattened messages', async () => {
  stubStorage()
  const now = Date.now()
  globalThis.localStorage.setItem(
    'gamedeck_chats_v1',
    JSON.stringify([
      {
        id: 'old-1',
        title: 'Old chat',
        updatedAt: now - 1000,
        messages: [
          { role: 'user', content: 'hello world' },
          { role: 'assistant', content: 'hi there' },
        ],
      },
    ]),
  )
  const conversations = askStore.loadConversations()
  assert.equal(conversations.length, 1)
  const [conversation] = conversations
  assert.equal(conversation.id, 'old-1')
  assert.equal(conversation.createdAt, now - 1000)
  assert.equal(conversation.messages.length, 2)
  assert.equal(conversation.messages[0].conversationId, 'old-1')
  assert.equal(conversation.messages[0].role, 'user')
  assert.equal(conversation.messages[0].content, 'hello world')
  assert.equal(conversation.messages[1].role, 'assistant')
})

test('conversationPreview is the first 100 chars of the first user message', async () => {
  stubStorage()
  const conversation = await askStore.createConversation(null)
  await askStore.saveMessage(conversation.id, 'assistant', 'ignored')
  await askStore.saveMessage(conversation.id, 'user', '  hello   world  ' + 'x'.repeat(200))
  const [loaded] = askStore.loadConversations()
  assert.equal(askStore.conversationPreview(loaded), `hello world ${'x'.repeat(200)}`.slice(0, 100))
  assert.equal(askStore.conversationTitle(loaded).length, 100)
})

test('contextual conversations keep their game and title mentions it', async () => {
  stubStorage()
  const conversation = await askStore.createConversation({ gameId: 123, gameTitle: 'Hades' })
  assert.equal(conversation.contextGameId, 123)
  assert.equal(conversation.contextGameTitle, 'Hades')
  const [loaded] = askStore.loadConversations()
  assert.equal(askStore.conversationTitle(loaded), 'About Hades')
})

test('saveMessage bumps updatedAt so history sorts newest first', async () => {
  stubStorage()
  const first = await askStore.createConversation(null)
  const second = await askStore.createConversation(null)
  await new Promise((resolve) => setTimeout(resolve, 5))
  await askStore.saveMessage(first.id, 'user', 'back again')
  const conversations = askStore.loadConversations()
  assert.equal(conversations[0].id, first.id)
  assert.equal(conversations[1].id, second.id)
})

test('active chat id round-trips through session storage', async () => {
  stubStorage()
  assert.equal(askStore.loadActiveId(), null)
  askStore.persistActiveId('abc')
  assert.equal(askStore.loadActiveId(), 'abc')
  askStore.persistActiveId(null)
  assert.equal(askStore.loadActiveId(), null)
})

test('history is not capped at 40 conversations', async () => {
  stubStorage()
  for (let i = 0; i < 50; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await askStore.createConversation(null)
  }
  assert.equal(askStore.loadConversations().length, 50)
})

test('loadMessages returns only the active conversation', async () => {
  stubStorage()
  const first = await askStore.createConversation(null)
  const second = await askStore.createConversation(null)
  await askStore.saveMessage(first.id, 'user', 'first chat')
  await askStore.saveMessage(second.id, 'user', 'second chat')
  const messages = await askStore.loadMessages(second.id)
  assert.equal(messages.length, 1)
  assert.equal(messages[0].content, 'second chat')
})
