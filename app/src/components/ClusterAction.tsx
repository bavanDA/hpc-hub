import type { LucideIcon } from 'lucide-react'

export function ClusterAction({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="flex h-10 items-center gap-2 rounded-lg bg-pill px-3.5 font-semibold hover:bg-selected
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
      <Icon size={16} className="text-dim" />{label}</button>
  )
}
