import { MessageCircleQuestion } from 'lucide-react'

export function AskButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className="flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-pill px-2.5 text-sm font-semibold
      hover:bg-pressed"><MessageCircleQuestion size={14} /> {label}</button>
  )
}
