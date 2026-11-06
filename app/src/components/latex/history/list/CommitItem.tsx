export function CommitItem({ selected, dim, bar, badge, icon, title, meta, counts, onClick }:
  { selected: boolean; dim: boolean; bar: boolean; badge: string | null; icon: React.ReactNode; title: React.ReactNode
    meta: React.ReactNode; counts: React.ReactNode; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button onClick={onClick} title="Shift-click another to compare the two"
      className={`relative flex w-full items-start gap-3 py-2 pr-3 pl-4 text-left ${selected ? 'bg-selected' : 'hover:bg-hover'}
        ${dim ? 'opacity-45' : ''}`}>
      {(selected || bar) && <span className={`absolute inset-y-0 left-0 ${bar ? 'w-[3px] bg-text/70' : 'w-[3px] bg-text'}`} />}
      <span className="mt-0.5">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className={`flex items-center gap-2 ${selected ? 'font-semibold' : ''}`}>
          <span className="min-w-0 flex-1 truncate">{title}</span>
          {badge && <span className="rounded bg-text px-1.5 text-[11px] font-semibold text-window">{badge}</span>}
        </span>
        <span className="mt-0.5 flex items-center gap-2 text-xs text-dim">
          <span className="min-w-0 flex-1 truncate">{meta}</span>{counts}</span>
      </span>
    </button>
  )
}
