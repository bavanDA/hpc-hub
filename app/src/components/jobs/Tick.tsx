export function Tick({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return <input type="checkbox" aria-label={label} title={label} checked={checked} onChange={onChange}
    className="size-4 accent-[var(--color-accent)] align-middle [@media(hover:none)]:size-6" />
}
