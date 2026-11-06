import type { ReactNode } from 'react'

import { openLink } from '../app/openLink'
import { parseMarkdown } from './markdown'

const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*|_[^_\s][^_]*_)|(\[[^\]]+\]\([^)\s]+\))/g

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(INLINE)) {
    if (m.index! > last) out.push(text.slice(last, m.index))
    const [s] = m
    const k = `${m.index}`
    if (m[1]) out.push(<code key={k} className="rounded bg-inset px-1 font-mono text-[0.92em]">{s.slice(1, -1)}</code>)
    else if (m[2]) out.push(<strong key={k} className="font-semibold">{s.slice(2, -2)}</strong>)
    else if (m[3]) out.push(<em key={k}>{s.slice(1, -1)}</em>)
    else {
      const [, label, url] = s.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/)!
      out.push(/^https?:\/\//.test(url)
        ? <a key={k} href={url} className="text-accent-text underline underline-offset-2"
            onClick={(e) => { e.preventDefault(); void openLink(url) }}>{label}</a>
        : <span key={k}>{label}</span>)
    }
    last = m.index! + s.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

/** An agent's answer as React elements, never as HTML, so nothing in it can run or restyle the app. */
export function Markdown({ text, className = '' }: { text: string; className?: string }) {
  return (
    <div className={`flex flex-col gap-2 text-base leading-relaxed text-text ${className}`}>
      {parseMarkdown(text).map((b, i) => {
        switch (b.kind) {
          case 'heading':
            return <p key={i} className={`font-semibold ${b.level <= 2 ? 'text-lg' : 'text-md'}`}>{inline(b.text)}</p>
          case 'code':
            return (
              <pre key={i} className="overflow-x-auto rounded-md bg-inset p-3 font-mono text-sm leading-snug">
                <code>{b.text}</code>
              </pre>
            )
          case 'list': {
            const List = b.ordered ? 'ol' : 'ul'
            return (
              <List key={i} className={`flex flex-col gap-1 pl-5 ${b.ordered ? 'list-decimal' : 'list-disc'}`}>
                {b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}
              </List>
            )
          }
          case 'quote':
            return <p key={i} className="border-l-2 border-line-strong pl-3 text-dim">{inline(b.text)}</p>
          default:
            return <p key={i}>{inline(b.text)}</p>
        }
      })}
    </div>
  )
}
