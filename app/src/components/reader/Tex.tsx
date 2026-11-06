import katex from 'katex'

import { useCtx } from './context'
import { mathFor } from './latex'

const rendered = new Map<string, string>()

export function Tex({ tex, display = false }: { tex: string; display?: boolean }) {
  const { doc } = useCtx()
  const src = mathFor(tex, doc.labels)
  const key = `${display ? 'D' : 'I'}${src}`
  let html = rendered.get(key)
  if (html === undefined) {
    html = katex.renderToString(src, { displayMode: display, throwOnError: false, strict: 'ignore', trust: false,
      macros: { ...doc.macros }, output: 'html' })
    rendered.set(key, html)
    if (rendered.size > 3000) rendered.delete(rendered.keys().next().value!)
  }
  return display ? <div className="reader-tex" dangerouslySetInnerHTML={{ __html: html }} />
    : <span dangerouslySetInnerHTML={{ __html: html }} />
}
