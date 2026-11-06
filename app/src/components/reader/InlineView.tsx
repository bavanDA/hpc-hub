import { useCtx } from './context'
import { Marked } from './Marked'
import { citeText, refText, type Inline } from './model'
import { Tex } from './Tex'

export function InlineView({ c }: { c: Inline[] }) {
  const { doc } = useCtx()
  return <>{c.map((x, k) => {
    switch (x.t) {
      case 'text': return <Marked key={k} s={x.s} />
      case 'em': return <em key={k}><InlineView c={x.c} /></em>
      case 'b': return <strong key={k}><InlineView c={x.c} /></strong>
      case 'code': return <code key={k}><InlineView c={x.c} /></code>
      case 'sc': return <span key={k} className="reader-sc"><InlineView c={x.c} /></span>
      case 'math': return <Tex key={k} tex={x.tex} />
      case 'br': return <br key={k} />
      case 'note': return <sup key={k} className="reader-mark">{x.n}</sup>
      case 'cite': return <Marked key={k} s={citeText(x.keys, doc.cites)} />
      case 'ref': return <Marked key={k} s={refText(x.key, x.style, doc.labels)} />
    }
  })}</>
}
