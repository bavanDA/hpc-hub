import type { Doc } from '../model'
import { bibitems, fromBib } from './bib'
import { Paper } from './paper'
import { stripComments } from './scan'

export type Read = (path: string) => Promise<string>

const dir = (p: string) => p.slice(0, p.lastIndexOf('/') + 1)

/** main.tex with its \input and \include files in place. */
async function gather(read: Read, main: string): Promise<string> {
  const root = dir(main)
  const expand = async (text: string, depth: number): Promise<string> => {
    const clean = stripComments(text)
    if (depth > 6) return clean
    const parts: string[] = []
    let last = 0
    for (const m of clean.matchAll(/\\(input|include|subfile)\s*\{([^}]+)\}/g)) {
      parts.push(clean.slice(last, m.index))
      last = m.index! + m[0].length
      const name = m[2].trim()
      const path = (name.startsWith('/') ? name : root + name).replace(/(^|\/)\.\//g, '$1')
      const file = /\.\w+$/.test(name) ? path : `${path}.tex`
      try { parts.push(await expand(await read(file), depth + 1)) } catch { /* a missing file reads as nothing */ }
    }
    parts.push(clean.slice(last))
    return parts.join('')
  }
  return expand(await read(main), 0)
}

/** Parses a whole paper. bbl: the compiled bibliography (main.bbl), else .bib files are read for \cite. */
export async function loadLatex(read: Read, main: string): Promise<Doc> {
  const all = await gather(read, main)
  const begin = all.indexOf('\\begin{document}')
  const pre = begin >= 0 ? all.slice(0, begin) : ''
  const body = begin >= 0 ? all.slice(begin + 16, all.indexOf('\\end{document}') >>> 0) : all
  const p = new Paper()
  p.define(pre)
  p.chapters = /\\chapter\*?\s*[[{]/.test(body)
  try {
    const bbl = await read(main.replace(/\.tex$/, '') + '.bbl')
    const env = bbl.match(/\\begin\{thebibliography\}\s*\{[^}]*\}([\s\S]*?)\\end\{thebibliography\}/)
    if (env) p.bib = bibitems(env[1])
  } catch { /* not built yet, or no bibliography */ }
  const names = [...body.matchAll(/\\(?:bibliography|addbibresource)\s*\{([^}]+)\}/g), ...pre.matchAll(/\\addbibresource\s*\{([^}]+)\}/g)]
    .flatMap((m) => m[1].split(',')).map((n) => n.trim()).filter(Boolean)
  let bibs: string[] = []
  if (!p.bib.length && names.length) {
    bibs = await Promise.all(names.map((n) => read(dir(main) + (n.endsWith('.bib') ? n : `${n}.bib`)).catch(() => '')))
    // the keys cited come from a first look at the text, so the list is in citing order
    for (const m of body.matchAll(/\\(?:cite[a-z]*|parencite|textcite|autocite)\*?\s*(?:\[[^\]]*\]\s*){0,2}\{([^}]+)\}/g)) {
      for (const k of m[1].split(',').map((x) => x.trim())) if (k && !p.cited.includes(k)) p.cited.push(k)
    }
    p.bib = fromBib(bibs, p.cited)
  }
  const blocks = p.blocks(body)
  if (p.bib.length && !blocks.some((b) => b.t === 'refs')) {
    blocks.push({ t: 'h', level: 1, num: '', c: [{ t: 'text', s: 'References' }] }, p.refs())
  }
  const cites: Record<string, string> = {}
  p.bib.forEach((b) => { cites[b.key] = b.label })
  p.cited.forEach((k, i) => { cites[k] ??= p.bib.length ? '?' : String(i + 1) })
  return { blocks, from: 'source', labels: p.labels, cites, macros: p.katexMacros() }
}
