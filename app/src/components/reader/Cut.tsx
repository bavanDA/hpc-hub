import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useEffect, useRef, useState } from 'react'

import type { Box } from './model'
import { cut } from './pdftext'

/** Display math cut from the PDF, drawn in the text's color and sized with the text. */
export function Cut({ pdf, page, box, tag, body }:
  { pdf: PDFDocumentProxy; page: number; box: Box; tag?: string; body: number }) {
  const [url, setUrl] = useState('')
  const el = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const node = el.current
    if (!node) return
    let dead = false
    const seen = new IntersectionObserver((es) => {
      if (!es.some((e) => e.isIntersecting)) return
      seen.disconnect()
      cut(pdf, page, box, 4 * Math.max(1, devicePixelRatio)).then((u) => { if (!dead) setUrl(u) }).catch(() => {})
    }, { rootMargin: '600px 0px' })
    seen.observe(node)
    return () => { dead = true; seen.disconnect() }
  }, [pdf, page, box])
  const w = (box[2] - box[0] + 4) / body, h = (box[3] - box[1] + 4) / body
  return (
    <div ref={el} className="reader-eq">
      <div className="reader-eqb">
        <span role="img" aria-label="An equation from the PDF" className="reader-cut"
          style={{ width: `${w}em`, aspectRatio: `${w} / ${h}`, ...(url ? { WebkitMaskImage: `url(${url})`,
            maskImage: `url(${url})` } : { background: 'transparent' }) }} />
      </div>
      {tag && <div className="reader-tags"><span>{tag}</span></div>}
    </div>
  )
}
