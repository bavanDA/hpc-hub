// A screen's title bar: big title, and buttons on the right. Inside More, a back arrow returns to the list.
import { ArrowLeft } from 'lucide-react'
import { useContext, type ReactNode } from 'react'

import { ScreenBackContext } from '../nav'

export function Header({ title, children }: { title: string; children?: ReactNode }) {
  const back = useContext(ScreenBackContext)
  return (
    <header className={`flex h-16 shrink-0 items-center gap-2 ${back ? 'pr-4 pl-1' : 'px-4'}`}>
      {back && <button aria-label="Back" onClick={back}
        className="grid size-12 shrink-0 place-items-center rounded-full active:bg-hover"><ArrowLeft size={24} /></button>}
      <h1 className="min-w-0 flex-1 truncate text-2xl font-bold">{title}</h1>
      {children}
    </header>
  )
}
