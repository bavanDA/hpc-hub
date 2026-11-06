import type { PdfTarget } from './index'
import type { Live } from './live'

/** Scrolls so the spot sits near the top, and pulses a bar over that line. */
export function jump(viewer: Live['viewer'], t: PdfTarget) {
  const view = viewer.getPageView(t.page - 1)
  if (!view?.viewport) return
  const box = view.viewport.viewBox
  viewer.scrollPageIntoView({ pageNumber: t.page, destArray: [null, { name: 'XYZ' }, box[0], box[3] - t.y + 72,
    null], allowNegativeOffset: true, ignoreDestinationZoom: true })
  const [, cy] = view.viewport.convertToViewportPoint(t.x + box[0], box[3] - t.y)
  const s = view.viewport.scale
  const mark = document.createElement('div')
  mark.className = 'pdf-mark'
  Object.assign(mark.style, { left: `${54 * s}px`, right: `${54 * s}px`, top: `${cy - 10 * s}px`,
    height: `${13 * s}px` })
  view.div.querySelectorAll('.pdf-mark').forEach((m: Element) => m.remove())
  view.div.appendChild(mark)
  setTimeout(() => mark.remove(), 2000)
}
