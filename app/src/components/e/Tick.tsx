import { Check } from 'lucide-react'

export const Tick = ({ on }: { on: boolean }) =>
  on ? <Check size={18} aria-label="Chosen" className="shrink-0" /> : <span className="w-[18px]" />
