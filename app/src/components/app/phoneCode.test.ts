// The phone's one-time code as people type it on the desktop (the same rules as hpc_hub/core/pairing.py normalize).
import { describe, expect, it } from 'vitest'

import { ALPHABET, phoneCode } from './phoneCode'

describe('the code typed from the phone', () => {
  it('takes any case, spaces and dashes', () => {
    for (const typed of ['7K2QM-X9D4R', '7k2qm-x9d4r', '7K2QM X9D4R', ' 7k2qmx9d4r\n', '7K2-QM-X9-D4R', '7K2QM–X9D4R']) {
      expect(phoneCode(typed)).toEqual({ code: '7K2QMX9D4R' })
    }
  })
  it('reads O as 0 and I or L as 1, as Crockford does', () => {
    expect(phoneCode('oil00-11abc')).toEqual({ code: '0110011ABC' })
  })
  it('says the length when it is wrong', () => {
    expect(phoneCode('7K2QM-X9D4').error).toMatch(/has 10 letters and digits, like 7K2QM-X9D4R, and this one has 9\./)
    expect(phoneCode('7K2QM-X9D4RR').error).toMatch(/this one has 11\./)
    expect(phoneCode('').error).toMatch(/this one has 0\./)
  })
  it('says a character the code never has', () => {
    expect(phoneCode('7K2QM-X9D4U').error).toBe('The phone code has no U. Check it on the phone and type it again.')
    expect(phoneCode('7K2QM-X9D4*').error).toMatch(/has no \*/)
  })
  it('is base32 without the letters people mix up', () => {
    expect(ALPHABET).toHaveLength(32)
    expect([...ALPHABET].filter((ch) => 'ILOU'.includes(ch))).toEqual([])
  })
})
