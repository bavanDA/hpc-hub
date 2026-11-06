import { ScrollText } from 'lucide-react'

export function PdfMessage({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex max-w-xs flex-col items-center gap-2">
      <ScrollText size={40} strokeWidth={1.25} className="text-dim" />
      <div className="font-semibold">{title}</div>
      <p className="text-sm text-dim">{text}</p>
    </div>
  )
}
