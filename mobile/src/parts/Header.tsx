// A screen's title bar: the title, and buttons on the right. Inside More, a back arrow returns to the list.
import { ArrowLeft } from 'lucide-react'
import { useContext, type ReactNode } from 'react'

import { ScreenBackContext } from '../nav'

export function Header({ title, children }: { title: string; children?: ReactNode }) {
  const back = useContext(ScreenBackContext)
  return (
    <header className={`flex min-h-16 shrink-0 items-center gap-2 ${back ? 'pr-2 pl-1' : 'pr-2 pl-4'}`}>
      {back && <button aria-label="Back" onClick={back}
        className="grid size-12 shrink-0 place-items-center rounded-full active:bg-pressed"><ArrowLeft size={24} /></button>}
      <h1 className="min-w-0 flex-1 text-2xl leading-tight font-semibold tracking-tight">{title}</h1>
      {children}
    </header>
  )
}
