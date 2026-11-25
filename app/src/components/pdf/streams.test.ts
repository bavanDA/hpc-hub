// 2026-11-25 report: Reader on Linux said "Could not read the text: undefined is not a function (near '...e of t...')".
// pdf.js 6 reads page text with for await over a ReadableStream, which the Linux window's WebKit can't do.
import { describe, expect, it } from 'vitest'

import engine from './engine.ts?raw'
import { iterableStreams } from './streams'

/** A stream as WebKitGTK has it: getReader() only, no async iteration. */
function oldStream(chunks: string[]) {
  const log: string[] = []
  class Old {
    getReader() {
      let i = 0
      return {
        read: async () => i < chunks.length ? { done: false, value: chunks[i++] } : { done: true, value: undefined },
        cancel: async () => { log.push('cancel') },
        releaseLock: () => { log.push('release') },
      }
    }
  }
  return { Old, log }
}

describe('for await over a stream where the engine lacks it', () => {
  it('reads every chunk, in order', async () => {
    const { Old, log } = oldStream(['a', 'b', 'c'])
    expect(iterableStreams(Old.prototype)).toBe(true)
    const got: unknown[] = []
    for await (const x of new Old() as unknown as AsyncIterable<unknown>) got.push(x)
    expect(got).toEqual(['a', 'b', 'c'])
    expect(log).toEqual(['release'])  // read to the end: nothing cancelled
  })
  it('leaving early cancels the stream, unless asked not to', async () => {
    const { Old, log } = oldStream(['a', 'b', 'c'])
    iterableStreams(Old.prototype)
    for await (const x of new Old() as unknown as AsyncIterable<unknown>) { if (x === 'a') break }
    expect(log).toEqual(['cancel', 'release'])
    log.length = 0
    const kept = (new Old() as unknown as { values(o: object): AsyncIterable<unknown> }).values({ preventCancel: true })
    for await (const x of kept) { if (x === 'a') break }
    expect(log).toEqual(['release'])
  })
  it('an engine that has it keeps its own', () => {
    const own = async function* () { /* the engine's */ }
    const proto = { [Symbol.asyncIterator]: own }
    expect(iterableStreams(proto)).toBe(false)
    expect(proto[Symbol.asyncIterator]).toBe(own)
    expect(iterableStreams(globalThis.ReadableStream.prototype)).toBe(false)  // Node, like Chromium, has it
  })
  it('pdf.js is loaded only after it is in place', () => {
    expect(engine.indexOf('iterableStreams()')).toBeGreaterThan(-1)
    expect(engine.indexOf('iterableStreams()')).toBeLessThan(engine.indexOf("await import('pdfjs-dist')"))
  })
})
