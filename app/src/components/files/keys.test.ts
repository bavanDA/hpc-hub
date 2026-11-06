import { describe, expect, it } from 'vitest'

import { keyAction } from './keys'

describe('keyAction', () => {
  it.each([['Enter', 'open'], ['Delete', 'delete'], ['F2', 'rename'], ['a', undefined], ['toString', undefined]])(
    '%s', (key, want) => expect(keyAction(key)).toBe(want))
})
