import { useRef } from 'react'

import { win } from './HeaderBar'

/** Moving starts only once the mouse moves, so a double-click is never eaten by a drag (Linux). */
export function useDrag() {
  const armed = useRef(false)
  const bare = (e: React.MouseEvent) => e.target === e.currentTarget || (e.target as HTMLElement).dataset.drag !== undefined
  return {
    onMouseDown: (e: React.MouseEvent) => {
      if (e.button !== 0 || !bare(e)) return
      if (e.detail === 2) { armed.current = false; win('toggleMaximize') } else armed.current = true
    },
    onMouseMove: (e: React.MouseEvent) => {
      if (!armed.current) return
      armed.current = false
      if (e.buttons === 1) win('startDragging')
    },
    onMouseUp: () => { armed.current = false },
  }
}
