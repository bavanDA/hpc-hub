import type { ReactNode } from 'react'

export function Heading({ title, text }: { title: string; text?: ReactNode }) {
  return (
    <div className="px-5">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {text && <p className="mt-1.5 text-dim">{text}</p>}
    </div>
  )
}
