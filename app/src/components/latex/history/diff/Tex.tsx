import { Fragment } from 'react'

const TOKEN = /(\\[A-Za-z@]+|\\.|[{}]|%.*$|\$)/g

/** LaTeX with commands, braces and comments in color, and changed words marked. */
export function Tex({ text, marks = [], markClass = '' }: { text: string; marks?: [number, number][]; markClass?: string }) {
  if (!text) return <>{' '}</>
  const cuts = new Set([0, text.length, ...marks.flat()])
  const edges = [...cuts].sort((a, b) => a - b)
  return <>{edges.slice(0, -1).map((a, i) => {
    const b = edges[i + 1]
    const marked = marks.some(([x, y]) => a >= x && b <= y)
    const part = text.slice(a, b)
    const inner = part.split(TOKEN).map((t, k) => !t ? null
      : t.startsWith('\\') ? <span key={k} className="text-accent-text">{t}</span>
      : t === '{' || t === '}' ? <span key={k} className="text-dim">{t}</span>
      : t.startsWith('%') ? <span key={k} className="text-faint italic">{t}</span>
      : t === '$' ? <span key={k} className="text-orange">{t}</span>
      : <Fragment key={k}>{t}</Fragment>)
    return marked ? <mark key={a} className={`text-inherit ${markClass}`}>{inner}</mark> : <Fragment key={a}>{inner}</Fragment>
  })}</>
}
