import { useCtx } from './context'
import { splitHits } from './hits'

/** Text with the search's matches marked. */
export function Marked({ s }: { s: string }) {
  const { query } = useCtx()
  if (!query) return <>{s}</>
  return <>{splitHits(s, query).map((part, k) => k % 2 ? <mark key={k} className="reader-hit">{part}</mark> : part)}</>
}
