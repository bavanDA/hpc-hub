import { plain, type Heading } from './model'
import { useOutside } from './useOutside'

export function Contents({ heads, at, onGo, onClose }:
  { heads: Heading[]; at: number; onGo: (i: number) => void; onClose: () => void }) {
  const box = useOutside(onClose)
  const top = Math.min(...heads.map((h) => h.b.level))
  return (
    <nav ref={box} aria-label="Contents" className="absolute top-2 left-2 z-30 max-h-[min(70%,560px)] w-[340px]
      max-w-[calc(100%-16px)] overflow-y-auto rounded-xl bg-raised p-1.5 text-sm shadow-[var(--shadow-menu)]">
      {heads.map(({ b, i }) => (
        <button key={i} onClick={() => onGo(i)} aria-current={i === at || undefined}
          style={{ paddingLeft: 10 + (b.level - top) * 16 }}
          className={`flex w-full items-baseline gap-2 rounded-md py-1.5 pr-2.5 text-left ${i === at ? 'bg-selected font-semibold'
            : 'hover:bg-hover'} ${b.level === top ? '' : 'text-dim'}`}>
          {b.num && <span className="shrink-0 tabular-nums">{b.num}</span>}
          <span className="min-w-0">{plain(b.c)}</span>
        </button>
      ))}
    </nav>
  )
}
