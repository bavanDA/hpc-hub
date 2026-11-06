import type { ReactNode } from 'react'

export function DialogNote({ error = false, children }: { error?: boolean; children: ReactNode }) {
  return <p role={error ? 'alert' : undefined} className={`px-5 pb-3 break-words ${error ? 'font-semibold text-bad'
    : 'font-semibold'}`}>{children}</p>
}
