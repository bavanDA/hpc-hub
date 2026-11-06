import { X } from 'lucide-react'

export function CardClose({ onClose }: { onClose: () => void }) {
  return <button onClick={onClose} aria-label="CardClose" className="grid size-7 place-items-center rounded-md text-dim
    hover:bg-hover"><X size={15} /></button>
}
