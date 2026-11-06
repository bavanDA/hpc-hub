import type { ReactNode } from 'react'

import { useCtx } from './context'
import { Cut } from './Cut'
import { InlineView as Inl } from './InlineView'
import type { Block } from './model'
import { Tex } from './Tex'

export function BlockView({ b }: { b: Block }) {
  const { pdf, body } = useCtx()
  switch (b.t) {
    case 'title': return <header className="reader-title"><h1><Inl c={b.c} /></h1>
      {b.by.length > 0 && <p><Inl c={b.by} /></p>}</header>
    case 'h': {
      const H = b.level <= 1 ? 'h2' : b.level === 2 ? 'h3' : 'h4'
      return <H className={`reader-h${Math.min(b.level, 4)}`}>{b.num && <span className="reader-num">{b.num}</span>}
        <Inl c={b.c} /></H>
    }
    case 'p': return <p className={b.small ? 'reader-small' : undefined}><Inl c={b.c} /></p>
    case 'math': return (
      <div className="reader-eq">
        <div className="reader-eqb"><Tex tex={b.tex} display /></div>
        {b.tags.length > 0 && <div className="reader-tags">{b.tags.map((t, k) => <span key={k}>{t && `(${t})`}</span>)}</div>}
      </div>
    )
    case 'cut': return pdf ? <Cut pdf={pdf} page={b.page ?? 1} box={b.box} tag={b.tag} body={body} /> : null
    case 'list': {
      const L = b.ordered ? 'ol' : 'ul'
      return <L className="reader-list">{b.items.map((it, k) => (
        <li key={k}>{it.label && <strong className="reader-item"><Inl c={it.label} /></strong>}<Blocks c={it.c} /></li>
      ))}</L>
    }
    case 'box':
      if (b.kind === 'abstract') return <section className="reader-abstract"><h3><Inl c={b.label} /></h3><Blocks c={b.c} /></section>
      if (b.kind === 'quote') return <blockquote className="reader-quote"><Blocks c={b.c} /></blockquote>
      if (b.kind === 'proof') return <div className="reader-proof"><RunIn label={<em><Inl c={b.label} />.</em>} c={b.c}
        end={<span className="reader-qed-mark"> ∎</span>} /></div>
      return <div className="reader-thm"><RunIn label={<strong><Inl c={b.label} />.</strong>} c={b.c} /></div>
    case 'caption': return <p className="reader-caption"><strong>{b.label}.</strong> <Inl c={b.c} /></p>
    case 'code': return <pre className="reader-code">{b.s}</pre>
    case 'notes': return <div className="reader-notes">{b.items.map((n) => (
      <p key={n.n}><sup className="reader-mark">{n.n}</sup> <Inl c={n.c} /></p>))}</div>
    case 'refs': return <ol className="reader-refs">{b.items.map((r) => (
      <li key={r.key}><span className="reader-ref-label">[{r.label}]</span><span><Inl c={r.c} /></span></li>))}</ol>
  }
}

// Blocks and RunIn draw nested blocks, so they live beside BlockView.
function Blocks({ c }: { c: Block[] }) {
  return <>{c.map((b, k) => <BlockView key={k} b={b} />)}</>
}

/** A box's label run in at the start of its first paragraph, like LaTeX does. */
function RunIn({ label, c, end }: { label: ReactNode; c: Block[]; end?: ReactNode }) {
  const [first, ...rest] = c
  const last = rest.length ? rest[rest.length - 1] : first
  if (!first) return <p>{label}{end}</p>
  return <>
    {first.t === 'p' ? <p>{label} <Inl c={first.c} />{first === last && end}</p> : <><p>{label}</p><BlockView b={first} /></>}
    {rest.map((b, k) => b === last && b.t === 'p' ? <p key={k}><Inl c={b.c} />{end}</p> : <BlockView key={k} b={b} />)}
    {last && last.t !== 'p' && end && <p className="reader-qed">{end}</p>}
  </>
}
