import test from 'node:test'
import assert from 'node:assert/strict'
import { coverLook, peekCoverLook } from '../src/lib/tint.js'

test('cover look deduplicates image work and becomes synchronously readable', async () => {
  const priorDocument = globalThis.document
  const priorImage = globalThis.Image
  let images = 0

  globalThis.document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage: () => {},
        getImageData: () => ({ data: new Uint8ClampedArray(8 * 8 * 4).fill(220) }),
      }),
    }),
  }
  globalThis.Image = class {
    constructor() {
      images += 1
      this.complete = false
      this.naturalWidth = 0
    }

    set src(value) {
      this._src = value
      this.complete = true
      this.naturalWidth = 8
      queueMicrotask(() => this.onload && this.onload())
    }
  }

  try {
    const url = '/api/tint?id=test-cache&kind=artwork'
    assert.equal(peekCoverLook(url, 'dark'), null)
    const first = coverLook(url, 'dark')
    const second = coverLook(url, 'dark')
    assert.equal(first, second)
    const tint = await first
    assert.match(tint, /^rgb\(/)
    assert.equal(peekCoverLook(url, 'dark'), tint)
    assert.equal(images, 1)
  } finally {
    globalThis.document = priorDocument
    globalThis.Image = priorImage
  }
})
