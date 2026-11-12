// A window over the page, put at the top of the page instead of where it was opened. Opened inside another window's
// scrolling body, WebKitGTK (the Linux app) paints that body's scrollbar over it: a line through the window above.
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

export function OnTop({ children }: { children: ReactNode }) {
  return createPortal(children, document.body)
}
