import { RotateCcw, RotateCw } from 'lucide-react'

export function TenSeconds({ back, disabled, onClick }: { back?: boolean; disabled: boolean; onClick: () => void }) {
  const Icon = back ? RotateCcw : RotateCw
  const label = back ? 'Back 10 seconds' : 'Forward 10 seconds'
  return (
    <button aria-label={label} title={label} disabled={disabled} onClick={onClick}
      className="flex h-7 shrink-0 items-center gap-0.5 rounded-md px-1.5 text-xs font-semibold tabular-nums
        hover:bg-hover disabled:opacity-40">
      {back && <Icon size={14} />}10{!back && <Icon size={14} />}
    </button>
  )
}
