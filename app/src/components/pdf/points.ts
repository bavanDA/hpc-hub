import type { Live } from './live'
import type { Spot } from './reader'
import { wordAround } from './words'

/** A point on the screen as a spot in PDF points from the top left of the page under it. */
export function spotAt(viewer: Live['viewer'], x: number, y: number, target: EventTarget | null): Spot | null {
  const div = (target as HTMLElement | null)?.closest?.('.page') as HTMLElement | null
  const page = Number(div?.dataset.pageNumber)
  const view = div && viewer.getPageView(page - 1)
  if (!div || !view?.viewport) return null
  const r = div.getBoundingClientRect(), box = view.viewport.viewBox
  const [px, py] = view.viewport.convertToPdfPoint(x - r.left - div.clientLeft, y - r.top - div.clientTop)
  return { page, x: px - box[0], y: box[3] - py }
}

/** The word of the PDF's text under a point, or ''. */
export function textAt(x: number, y: number): string {
  const d = document as Document & { caretPositionFromPoint?: (x: number, y: number) =>
    { offsetNode: Node; offset: number } | null }
  let node: Node | null = null, offset = 0
  if (d.caretRangeFromPoint) {
    const r = d.caretRangeFromPoint(x, y)
    if (r) { node = r.startContainer; offset = r.startOffset }
  } else if (d.caretPositionFromPoint) {
    const p = d.caretPositionFromPoint(x, y)
    if (p) { node = p.offsetNode; offset = p.offset }
  }
  if (!node || node.nodeType !== Node.TEXT_NODE || !node.parentElement?.closest('.textLayer')) return ''
  return wordAround(node.textContent ?? '', offset)
}
