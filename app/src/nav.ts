import { createContext, useContext } from 'react'

import type { Page } from './components/app/pages'

export type Go = (page: Page, params?: Record<string, string>) => void
export const NavContext = createContext<{ go: Go; params: Record<string, string> }>({ go: () => {}, params: {} })
export const useGo = () => useContext(NavContext).go
/** What the page was opened with (cluster, path...); empty when you came from the sidebar. */
export const usePageParams = () => useContext(NavContext).params

/** A page with unsaved changes can hold a move: the guard gets the move to run later and returns true to stop it. */
type Guard = (proceed: () => void) => boolean
let guard: Guard | null = null
export const setLeaveGuard = (g: Guard | null) => { guard = g }
/** Runs move now, or hands it to the page's guard (which asks first). */
export const leave = (move: () => void) => { if (!guard || !guard(move)) move() }
