import { createContext, useContext } from 'react'

export type ToastOptions = { kind?: 'info' | 'error'; action?: { label: string; run: () => void } }
type Show = (text: string, options?: ToastOptions) => () => void
export const ToastContext = createContext<Show>(() => () => {})
export const useToast = () => useContext(ToastContext)
