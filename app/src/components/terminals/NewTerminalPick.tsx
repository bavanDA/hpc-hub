export function NewTerminalPick({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="py-1.5">
      <p className="mb-1.5 text-sm text-dim">{label}</p>
      {children}
      {hint && <p className="mt-1.5 text-sm text-dim">{hint}</p>}
    </div>
  )
}
