import type { Box } from './reader'

/** A word's id, when it starts and when it ends, in seconds into the recording. */
export type Timing = [number, number, number]

/** The narration's words ([id, page, x0, y0, x1, y1]) by id, and the ids on each page. */
export function indexWords(list: number[][]) {
  const words = new Map(list.map((w) => [w[0], w.slice(1, 6) as Box]))
  const byPage = new Map<number, number[]>()
  for (const [id, page] of list) {
    if (!byPage.has(page)) byPage.set(page, [])
    byPage.get(page)!.push(id)
  }
  return { words, byPage }
}

/** The word closest to a point (rows count more than columns), or null when none is near. */
export function nearestWord(ids: number[], words: Map<number, Box>, x: number, y: number): number | null {
  let best: number | null = null, dist = Infinity
  for (const id of ids) {
    const [, x0, y0, x1, y1] = words.get(id)!
    const dx = x < x0 ? x0 - x : x > x1 ? x - x1 : 0, dy = y < y0 ? y0 - y : y > y1 ? y - y1 : 0
    const d = dx + dy * 3
    if (d < dist) { dist = d; best = id }
  }
  return dist < 30 ? best : null
}

/** The last word that started by time t. */
export function wordAtTime(times: Timing[], t: number): number | null {
  let lo = 0, hi = times.length - 1, found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (times[mid][1] <= t) { found = mid; lo = mid + 1 } else hi = mid - 1
  }
  return found >= 0 ? times[found][0] : null
}

/** When the first word on this page or later starts, 0 when there is none. */
export function firstStartOn(times: Timing[], words: Map<number, Box>, page: number): number {
  for (const [id, start] of times) if ((words.get(id)?.[0] ?? 0) >= page) return start
  return 0
}

const WORD_CHAR = /[\p{L}\p{N}'’-]/u

/** The word of text around offset, without quotes or hyphens at its ends. */
export function wordAround(text: string, offset: number): string {
  let a = offset, b = offset
  while (a > 0 && WORD_CHAR.test(text[a - 1])) a--
  while (b < text.length && WORD_CHAR.test(text[b])) b++
  return text.slice(a, b).replace(/^['’-]+|['’-]+$/g, '')
}
