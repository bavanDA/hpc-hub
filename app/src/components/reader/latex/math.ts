import type { Doc } from '../model'

/** Math as KaTeX takes it: \ref and \eqref become their numbers, labels go. */
export function mathFor(tex: string, labels: Doc['labels']): string {
  return tex.replace(/\\(eqref|ref|cref|Cref|autoref)\s*\{([^}]*)\}/g, (_, how: string, key: string) => {
    const l = labels[key.trim()]
    const n = l ? l.num : '??'
    return `\\text{${how === 'eqref' ? `(${n})` : n}}`
  }).replace(/\\label\s*\{[^}]*\}/g, '').replace(/\\intertext\s*\{/g, '\\text{')
}
