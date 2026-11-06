/** The numbered pin. */
export function Pin({ n, done = false, size = 18 }: { n: number; done?: boolean; size?: number }) {
  return (
    <span style={{ width: size, height: size, fontSize: size * 0.6 }}
      className={`note-pin grid shrink-0 place-items-center rounded-full font-semibold tabular-nums ${done ? 'done' : ''}`}>
      {n}</span>
  )
}
