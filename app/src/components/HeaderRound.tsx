export function HeaderRound({ onClick, children, label }: { onClick: () => void; children: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick} aria-label={label}
      className="grid size-7 place-items-center rounded-md text-dim hover:bg-hover hover:text-text">
      {children}
    </button>
  )
}
