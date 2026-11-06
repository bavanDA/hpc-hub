import { FileType } from 'lucide-react'

export function Note({ icon: Icon, title, text, action }:
  { icon: typeof FileType; title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <Icon size={40} strokeWidth={1.25} className="text-dim" />
      <div className="font-semibold">{title}</div>
      <p className="text-sm text-dim">{text}</p>
      {action}
    </div>
  )
}
