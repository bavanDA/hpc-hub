import { Fragment } from 'react'

import type { Go } from '../go'
import { citeLabel, parseCites } from './cite'

/** The answer, its cited lines and pages as links. here: the file the question was about. */
export function AnswerText({ text, here, go }: { text: string; here?: string; go: Go }) {
  return (
    <span className="whitespace-pre-line">{parseCites(text).map((p, i) => 'text' in p
      ? <Fragment key={i}>{p.text}</Fragment>
      : <button key={i} onClick={() => 'page' in p.cite ? go.page(p.cite.page) : go.line(p.cite.path, p.cite.line)}
          className="underline decoration-dim underline-offset-2 hover:decoration-text">{citeLabel(p.cite, here)}</button>)}
    </span>
  )
}
