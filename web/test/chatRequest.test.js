import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ChatRequestError,
  chatRequestMessages,
  checkChatCanceled,
  validateMessages,
} from '../src/lib/chatRequest.js'

function message(role, content) {
  return { role, content }
}

test('chatRequestMessages keeps the latest message in full', () => {
  const messages = [message('user', 'a'.repeat(4000))]
  const request = chatRequestMessages(messages, null)
  assert.equal(request.length, 1)
  assert.equal(request[0].content.length, 4000)
})

test('chatRequestMessages truncates earlier turns and caps at 15', () => {
  const messages = Array.from({ length: 20 }, (_, i) =>
    message(i % 2 === 0 ? 'user' : 'assistant', `turn ${i} ` + 'x'.repeat(5000)),
  )
  messages.push(message('user', 'latest'))
  const request = chatRequestMessages(messages, null)
  // 15 earlier turns max (16 total) before the server limit
  assert.ok(request.length <= 16)
  assert.equal(request.at(-1).content, 'latest')
  // earlier turns are truncated to 4000
  for (const m of request.slice(0, -1)) assert.ok(m.content.length <= 4000)
})

test('chatRequestMessages stops before exceeding 15000 chars', () => {
  const messages = [
    message('user', 'b'.repeat(4000)),
    message('assistant', 'c'.repeat(4000)),
    message('user', 'd'.repeat(4000)),
    message('assistant', 'e'.repeat(4000)),
    message('user', 'latest'),
  ]
  const request = chatRequestMessages(messages, null)
  const total = request.reduce((sum, m) => sum + m.content.length, 0)
  assert.ok(total <= 15000)
  assert.equal(request.at(-1).content, 'latest')
})

test('chatRequestMessages prepends the game context', () => {
  const request = chatRequestMessages([message('user', 'hello')], 'Elden Ring')
  assert.equal(request.length, 2)
  assert.match(request[0].content, /This conversation is about the game: Elden Ring\./)
  assert.equal(request[0].content.length < 400, true)
})

test('chatRequestMessages truncates a long game title to 160 chars', () => {
  const request = chatRequestMessages([message('user', 'hello')], 'G'.repeat(300))
  assert.ok(request[0].content.length <= 'This conversation is about the game: '.length + 160 + 1)
})

test('chatRequestMessages rejects an empty or missing last user message', () => {
  assert.throws(() => chatRequestMessages([], null), ChatRequestError)
  assert.throws(() => chatRequestMessages([message('user', '   ')], null), ChatRequestError)
  assert.throws(() => chatRequestMessages([message('assistant', 'hi')], null), ChatRequestError)
  assert.throws(
    () => chatRequestMessages([message('user', 'x'.repeat(4001))], null),
    ChatRequestError,
  )
})

test('validateMessages enforces the request contract', () => {
  assert.throws(() => validateMessages([]), /1 and 16/)
  assert.throws(
    () => validateMessages(Array.from({ length: 17 }, () => message('user', 'x'))),
    /1 and 16/,
  )
  assert.throws(
    () => validateMessages([message('user', 'x'), message('assistant', 'y')]),
    /Your message is required/,
  )
  assert.throws(() => validateMessages([message('user', '')]), /1 and 4,000/)
  assert.throws(() => validateMessages([message('user', 'x'.repeat(4001))]), /1 and 4,000/)
  assert.throws(
    () =>
      validateMessages([
        message('user', 'x'.repeat(4000)),
        message('assistant', 'y'.repeat(4000)),
        message('user', 'z'.repeat(4000)),
        message('assistant', 'w'.repeat(4000)),
        message('user', 'v'),
      ]),
    /too long/,
  )
  validateMessages([message('user', 'ok'), message('assistant', 'sure'), message('user', 'go')])
})

test('checkChatCanceled throws an AbortError on an aborted signal', () => {
  const controller = new AbortController()
  checkChatCanceled(controller.signal)
  controller.abort()
  assert.throws(() => checkChatCanceled(controller.signal), (error) => error.name === 'AbortError')
})
