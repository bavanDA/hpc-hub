// Short messages at the bottom of the window, like GTK's toasts: const toast = useToast(); toast('Saved')
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

const ToastContext = createContext<(text: string) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([])
  const toast = useCallback((text: string) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, text }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000)
  }, [])
  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex flex-col items-center gap-2">
        {toasts.map((t) => (
          <div key={t.id} className="rounded-full bg-[#353538] px-5 py-2.5 text-sm text-white shadow-lg">{t.text}</div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
