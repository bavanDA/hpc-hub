import { createContext, useContext } from 'react'

import type { ReportStart } from './report/open'

/** report: what its Report button sends. Error toasts, and toasts showing a failed call's message, get one by
 *  themselves; false leaves it out. */
export type ToastOptions = { kind?: 'info' | 'error'; action?: { label: string; run: () => void }
  report?: ReportStart | false
  stay?: boolean }  // stays until closed, like an error, for something to act on (a code to type)
type Show = (text: string, options?: ToastOptions) => () => void
export const ToastContext = createContext<Show>(() => () => {})
export const useToast = () => useContext(ToastContext)
