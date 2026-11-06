import { describe, expect, it } from 'vitest'

import { secondStep } from '../../types/clusters'
import { copy, fill, keyHelp, rememberShort, shortName, who } from './loginCopy'
import { S } from './loginStrings'

describe('fill', () => {
  it('puts values in and drops unknown names', () => expect(fill('{a} and {b}', { a: 'x' })).toBe('x and '))
})

describe('shortName', () => {
  it('cuts the org in brackets', () => expect(shortName({ name: 'Wulver (NJIT)' })).toBe('Wulver'))
  it('prefers the short name', () => expect(shortName({ name: 'Yale Bouchet', short: 'Yale' })).toBe('Yale'))
  it('remembers short names by full name', () => {
    rememberShort([{ name: 'SDSC Expanse', short: 'SDSC' }])
    expect(shortName({ name: 'SDSC Expanse' })).toBe('SDSC')
  })
})

describe('who', () => {
  it('names the org first', () => expect(who({ name: 'Wulver (NJIT)', org: 'NJIT' })).toBe('NJIT'))
  it('falls back to the short name', () => expect(who({ name: 'Wulver (NJIT)' })).toBe('Wulver'))
})

describe('copy', () => {
  it('fills the cluster in', () => expect(copy.signIn({ name: 'Wulver (NJIT)' })).toBe(fill(S.SIGN_IN,
    { name: 'Wulver (NJIT)' })))
  it('uses the cluster key guide, else the default', () => {
    expect(keyHelp({ key_help: 'https://example.edu/keys' })).toBe('https://example.edu/keys')
    expect(keyHelp({})).toBe(S.KEY_HELP)
  })
  it('says the second step', () => {
    expect(secondStep({ second_factor: 'code' })).toBe(S.SECOND_CODE)
    expect(secondStep({})).toBe(S.SECOND_DUO)
  })
})
