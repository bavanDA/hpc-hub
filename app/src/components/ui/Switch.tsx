/** stop: keeps the click from reaching a clickable row around it. */
export function Switch({ on, onChange, label, stop = false, disabled }:
  { on: boolean; onChange: (on: boolean) => void; label?: string; stop?: boolean; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled}
      onClick={(e) => { if (stop) e.stopPropagation(); onChange(!on) }}
      className={`relative h-6 w-10 shrink-0 rounded-full transition-colors duration-150 disabled:opacity-45 ${
        on ? 'bg-accent' : 'bg-line-strong'}`}>
      <span className={`absolute top-1 left-1 size-4 rounded-full transition-transform duration-150 ease-enter ${
        on ? 'translate-x-4 bg-on-accent' : 'bg-window'}`} />
    </button>
  )
}
