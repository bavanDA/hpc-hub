import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

type Lib = typeof import('pdfjs-dist')
type Viewer = typeof import('pdfjs-dist/web/pdf_viewer.mjs')

const FILES = {
  ...import.meta.glob('/node_modules/pdfjs-dist/standard_fonts/*.{pfb,ttf}', { query: '?url', import: 'default',
    eager: true }),
  ...import.meta.glob('/node_modules/pdfjs-dist/wasm/*.wasm', { query: '?url', import: 'default', eager: true }),
} as Record<string, string>
const byName = Object.fromEntries(Object.entries(FILES).map(([k, v]) => [k.split('/').pop()!, v]))

/** Hands pdf.js the bundled fonts and decoders instead of fetching them from a folder. */
class BundledData {
  async fetch({ filename }: { kind: string; filename: string }): Promise<Uint8Array> {
    const url = byName[filename]
    if (!url) throw new Error(`No bundled ${filename}`)
    return new Uint8Array(await (await fetch(url)).arrayBuffer())
  }
}

let loading: Promise<{ lib: Lib; viewer: Viewer }> | null = null

export function engine() {
  loading ??= (async () => {
    const lib = await import('pdfjs-dist')
    lib.GlobalWorkerOptions.workerSrc = workerUrl
    ;(globalThis as { pdfjsLib?: Lib }).pdfjsLib = lib  // the viewer module reads pdf.js from here
    const viewer = await import('pdfjs-dist/web/pdf_viewer.mjs')
    return { lib, viewer }
  })()
  return loading
}

export function open(lib: Lib, data: Uint8Array) {
  // a copy, as pdf.js takes the buffer over; bundled fonts, so a PDF looks the same everywhere
  return lib.getDocument({ data: data.slice(), BinaryDataFactory: BundledData, useWorkerFetch: false,
    useSystemFonts: false, isEvalSupported: false, enableXfa: false } as Parameters<Lib['getDocument']>[0])
}
