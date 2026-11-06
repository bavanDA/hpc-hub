import { closing, Src, splitTop } from './scan'

export function bibitems(body: string): { key: string; label: string; text: string }[] {
  const [, ...items] = splitTop(body, '\\bibitem')
  return items.map((raw, k) => {
    const S = new Src(raw)
    const opt = S.opt()
    const key = (S.group() ?? '').trim()
    const text = S.s.slice(S.i).replace(/\\newblock\b/g, ' ').replace(/\\bibinfo\s*\{[^}]*\}/g, '')
      .replace(/\\bibfield\s*\{[^}]*\}/g, '').replace(/\\(BibitemOpen|BibitemShut\s*\{[^}]*\}|urlprefix|doiprefix)/g, '')
      .replace(/\\providecommand.*$/gm, '')
    // natbib's [Doe et al.(2023)Doe, Lee]: Doe et al. (2023)
    const label = opt ? opt.replace(/\)([^)]*)$/, ')').replace(/\(/, ' (').replace(/\s+/g, ' ').trim() : String(k + 1)
    return { key, label, text }
  })
}

/** The cited entries of .bib files, as bibitems: Authors. Title. Journal, year. */
export function fromBib(bibs: string[], cited: string[]): { key: string; label: string; text: string }[] {
  const entries = new Map<string, Record<string, string>>()
  for (const bib of bibs) {
    for (let i = bib.indexOf('@'); i >= 0; i = bib.indexOf('@', i + 1)) {
      const open = bib.indexOf('{', i)
      if (open < 0) break
      const type = bib.slice(i + 1, open).trim().toLowerCase()
      if (type === 'comment' || type === 'string' || type === 'preamble') continue
      const end = closing(bib, open)
      const body = bib.slice(open + 1, end)
      const comma = body.indexOf(',')
      const key = body.slice(0, comma).trim()
      const fields: Record<string, string> = {}
      const S = new Src(body.slice(comma + 1))
      while (!S.done) {
        const m = /\s*,?\s*([A-Za-z_-]+)\s*=\s*/y
        m.lastIndex = S.i
        const hit = m.exec(S.s)
        if (!hit) break
        S.i = m.lastIndex
        let v = ''
        if (S.s[S.i] === '{') v = S.group() ?? ''
        else if (S.s[S.i] === '"') { S.i++; v = S.until('"') } else { const w = /[^,]*/y; w.lastIndex = S.i; v = w.exec(S.s)![0]; S.i = w.lastIndex }
        fields[hit[1].toLowerCase()] = v.replace(/\s+/g, ' ').trim()
      }
      entries.set(key, fields)
      i = end
    }
  }
  return cited.filter((k) => entries.has(k)).map((key, k) => {
    const f = entries.get(key)!
    const names = (f.author ?? f.editor ?? '').split(/\s+and\s+/).filter(Boolean)
    const who = names.length > 2 ? `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}` : names.join(' and ')
    const where = f.journal ?? f.booktitle ?? f.publisher ?? f.school ?? f.institution ?? f.howpublished ?? ''
    const text = [who, f.title, [where, f.year].filter(Boolean).join(', ')].filter(Boolean)
      .map((x) => x.replace(/[.\s]+$/, '')).join('. ') + '.'
    return { key, label: String(k + 1), text: text.replace(/[{}]/g, '') }
  })
}
