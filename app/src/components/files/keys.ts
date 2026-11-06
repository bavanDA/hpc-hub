import type { Action } from './ActionBar'

const KEYS = new Map<string, Action>([['Enter', 'open'], ['Delete', 'delete'], ['F2', 'rename']])

/** The action a key runs on the selected entry, if any. */
export const keyAction = (key: string) => KEYS.get(key)
