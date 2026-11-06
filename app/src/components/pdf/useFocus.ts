import { useState } from 'react'

/** Focus as the parent's (it hides its own bars too) or this viewer's own. */
export function useFocus(on?: boolean, onChange?: (on: boolean) => void): [boolean, (on: boolean) => void] {
  const [own, setOwn] = useState(false)
  return on === undefined ? [own, (v) => { setOwn(v); onChange?.(v) }] : [on, (v) => onChange?.(v)]
}
