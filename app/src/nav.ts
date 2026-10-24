// Moving between pages from anywhere: const go = useGo(); go('files', { cluster: 'wulver', path: '/home/jdoe' })
import { createContext, useContext } from 'react'

import type { Page } from './components/Sidebar'

export type Go = (page: Page, params?: Record<string, string>) => void
export const NavContext = createContext<{ go: Go; params: Record<string, string> }>({ go: () => {}, params: {} })
export const useGo = () => useContext(NavContext).go
/** What the page was opened with (cluster, path...); empty when you came from the sidebar. */
export const usePageParams = () => useContext(NavContext).params
