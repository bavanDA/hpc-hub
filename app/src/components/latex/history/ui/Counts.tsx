/** +7 −0 in green and red. */
export function Counts({ added, removed, className = '' }: { added: number; removed: number; className?: string }) {
  return (
    <span className={`shrink-0 font-mono text-xs tabular-nums ${className}`}>
      <span className="diff-add-ink">+{added}</span> <span className="diff-del-ink">−{removed}</span></span>
  )
}
