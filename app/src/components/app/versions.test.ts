import { describe, expect, it } from 'vitest'

import { newer } from './versions'

describe('newer', () => {
  it.each([['0.2.6-beta.1', '0.2.5', true], ['0.2.6', '0.2.6-beta.9', true], ['0.2.6-beta.10', '0.2.6-beta.9', true],
    ['0.2.6-beta.2', '0.2.6', false], ['0.2.5', '0.2.6-beta.1', false], ['0.3.0', '0.2.9', true], ['0.2.5', '0.2.5', false]])(
    '%s after %s: %s', (a, b, want) => expect(newer(a, b)).toBe(want))
})
