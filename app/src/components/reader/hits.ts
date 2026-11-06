/** Text cut around each match of query, ignoring case: odd pieces are the matches. */
export function splitHits(s: string, query: string): string[] {
  if (!query) return [s]
  const low = s.toLowerCase(), q = query.toLowerCase(), out: string[] = []
  let i = 0
  for (let j = low.indexOf(q); j >= 0; j = low.indexOf(q, j + q.length)) {
    out.push(s.slice(i, j), s.slice(j, j + q.length))
    i = j + q.length
  }
  out.push(s.slice(i))
  return out
}
