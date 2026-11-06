import { Globe } from 'lucide-react'

import { Spinner } from '../ui/Spinner'

export function SignInWaiting({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex flex-col items-center gap-3 px-5 py-2 text-center">
      <Globe size={40} strokeWidth={1.25} className="text-dim" />
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="max-w-sm text-dim">{text}</p>
      <Spinner size={24} />
    </div>
  )
}
