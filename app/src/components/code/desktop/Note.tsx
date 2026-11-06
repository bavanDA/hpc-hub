import type { ReactNode } from 'react'

export function Note({ children }: { children: ReactNode }) {
  return <p className="grid h-full place-items-center px-4 text-center text-dim">{children}</p>
}
