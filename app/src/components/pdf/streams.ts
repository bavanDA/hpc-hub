// `for await (const x of stream)` over a ReadableStream, where the window's browser engine can't do it yet. pdf.js 6
// reads a page's text that way (getTextContent), and the WebKitGTK of the Linux window (2.54, Fedora 44) has no
// ReadableStream[Symbol.asyncIterator]: Reader said "Could not read the text: undefined is not a function
// (near '...e of t...')" (2026-11-25 report). Chromium (Windows) has it; this adds it only where it's missing.

type Proto = { getReader(): ReadableStreamDefaultReader<unknown> }

/** Adds values() and [Symbol.asyncIterator] as the Streams standard has them. false when already there. */
export function iterableStreams(proto: object | undefined = globalThis.ReadableStream?.prototype): boolean {
  if (!proto || Symbol.asyncIterator in proto) return false
  async function* values(this: Proto, opts?: { preventCancel?: boolean }) {
    const reader = this.getReader()
    let finished = false
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) { finished = true; return }
        yield value
      }
    } finally {
      // left early (break, return, an error): the stream is cancelled unless asked not to, as the standard says
      if (!finished && !opts?.preventCancel) await reader.cancel().catch(() => {})
      reader.releaseLock()
    }
  }
  for (const key of ['values', Symbol.asyncIterator]) {
    Object.defineProperty(proto, key, { value: values, writable: true, configurable: true })
  }
  return true
}
