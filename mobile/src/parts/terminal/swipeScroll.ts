// A finger sends no wheel events, and tmux only scrolls for those: a vertical swipe becomes wheel events for xterm,
// which moves its own history or tells tmux to. Tapping still focuses the terminal.
const STEP = 28  // px of finger movement for one wheel event; tmux moves a few lines for each
const SLOP = 6  // px before a touch counts as a swipe

export function swipeScroll(box: HTMLElement, xterm: () => HTMLElement | undefined) {
  let last: number | null = null, carried = 0, swiping = false
  const down = (e: TouchEvent) => {
    last = e.touches.length === 1 ? e.touches[0].clientY : null
    carried = 0
    swiping = false
  }
  const move = (e: TouchEvent) => {
    if (last === null || e.touches.length !== 1) return
    const t = e.touches[0]
    carried += last - t.clientY
    last = t.clientY
    if (!swiping && Math.abs(carried) < SLOP) return
    swiping = true
    e.preventDefault()
    const screen = xterm()?.querySelector('.xterm-screen')
    for (; Math.abs(carried) >= STEP; carried -= Math.sign(carried) * STEP) {
      screen?.dispatchEvent(new WheelEvent('wheel', { deltaY: Math.sign(carried) * STEP, deltaMode: 0, bubbles: true,
        cancelable: true, clientX: t.clientX, clientY: t.clientY }))
    }
  }
  box.addEventListener('touchstart', down, { passive: true })
  box.addEventListener('touchmove', move, { passive: false })
  return () => {
    box.removeEventListener('touchstart', down)
    box.removeEventListener('touchmove', move)
  }
}
