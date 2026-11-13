import { describe, expect, it } from 'vitest'

import { imageIn, toBase64 } from './imageData'

describe('pasting an image', () => {
  it('finds the first image the agents can take', () => {
    expect(imageIn([{ type: 'text/plain' }, { type: 'image/png' }])).toBe(1)
    expect(imageIn([{ type: 'image/jpeg' }])).toBe(0)
    expect(imageIn([{ type: 'image/svg+xml' }, { type: 'text/html' }])).toBe(-1)
    expect(imageIn([])).toBe(-1)
  })

  it('sends the bytes as base64 without the data: prefix', async () => {
    const blob = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' })
    expect(await toBase64(blob)).toBe('iVBORw==')
  })
})

describe('big images', () => {
  it('encodes past one chunk', async () => {
    const bytes = new Uint8Array(100_000).map((_, i) => i % 256)
    const b64 = await toBase64(new Blob([bytes]))
    expect(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))).toEqual(bytes)
  })
})
