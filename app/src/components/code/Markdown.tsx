// An agent's answer as simple Markdown: headings, lists, code blocks, inline code, bold, italics and links. Built as
// React elements from the text, never as HTML, so nothing in an answer can run or restyle the app.
import type { ReactNode } from 'react'

import { openLink } from '../app/openLink'

type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'code'; lang: string; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'quote'; text: string }
  | { kind: 'para'; text: string }

function parse(md: string): Block[] {
  const lines = md.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const fence = line.match(/^\s*(```|~~~)\s*([\w+-]*)/)
    if (fence) {
      const body: string[] = []
      i++
      while (i < lines.length && !lines[i].trimStart().startsWith(fence[1])) body.push(lines[i++])
      i++  // the closing fence (or the end)
      blocks.push({ kind: 'code', lang: fence[2], text: body.join('\n') })
      continue
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2].trim() })
      i++
      continue
    }
    const item = (l: string) => l.match(/^\s*(?:[-*+]|(\d+)[.)])\s+(.*)$/)
    if (item(line)) {
      const ordered = Boolean(item(line)![1])
      const items: string[] = []
      while (i < lines.length && item(lines[i]) && Boolean(item(lines[i])![1]) === ordered) {
        items.push(item(lines[i])![2])
        i++
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !item(lines[i])) items[items.length - 1] += ` ${lines[i++].trim()}`
      }
      blocks.push({ kind: 'list', ordered, items })
      continue
    }
    if (/^\s*>/.test(line)) {
      const body: string[] = []
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ''))
      blocks.push({ kind: 'quote', text: body.join(' ') })
      continue
    }
    if (!line.trim()) {
      i++
      continue
    }
    const body: string[] = []
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|\s*(```|~~~)|\s*>|\s*([-*+]|\d+[.)])\s)/.test(lines[i])) {
      body.push(lines[i++].trim())
    }
    blocks.push({ kind: 'para', text: body.join(' ') })
  }
  return blocks
}

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

export function Markdown({ text, className = '' }: { text: string; className?: string }) {
  return (
    <div className={`flex flex-col gap-2 text-base leading-relaxed text-text ${className}`}>
      {parse(text).map((b, i) => {
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
