/** A paper row's Open: offers where to open its folder. */
export function OpenButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onClick() }}
      className="flex h-8 shrink-0 items-center rounded-lg border border-line-strong px-3 text-sm font-semibold
        hover:bg-hover">Open</button>
  )
}
