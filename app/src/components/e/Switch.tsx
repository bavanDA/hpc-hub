export function Switch({ checked, onChange, label, disabled }:
  { checked: boolean; onChange: (on: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <span className="relative inline-flex shrink-0">
      <input type="checkbox" role="switch" aria-label={label} checked={checked} disabled={disabled}
        onChange={(e) => onChange(e.target.checked)} className="peer absolute inset-0 cursor-pointer opacity-0" />
      <span className="pointer-events-none relative h-6 w-10 rounded-full bg-line-strong transition-colors
        peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2
        peer-focus-visible:outline-focus after:absolute after:top-1 after:left-1 after:size-4 after:rounded-full
        after:bg-window after:transition peer-checked:after:translate-x-4 peer-checked:after:bg-on-accent" />
    </span>
  )
}
