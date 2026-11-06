import { Maximize } from 'lucide-react'

import { Tool } from './tool'

export function FocusButton({ onClick }: { onClick: () => void }) {
  return (
    <span className="contents pointer-coarse:hidden">
      <span className="mx-1 h-[18px] w-px shrink-0 bg-line" />
      <Tool label="Just the PDF (F)" onClick={onClick}><Maximize size={16} /></Tool>
    </span>
  )
}
