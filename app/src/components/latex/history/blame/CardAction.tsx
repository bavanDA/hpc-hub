export function CardAction({ icon, label, onClick, solid }: { icon: React.ReactNode; label: string; onClick: () => void; solid?: boolean }) {
  return (
    <button onClick={onClick} className={`flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-semibold ${solid
      ? 'bg-text text-window hover:opacity-90' : 'bg-pill hover:bg-pressed'}`}>{icon} {label}</button>
  )
}
