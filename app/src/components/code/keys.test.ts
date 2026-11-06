import { describe, expect, it } from 'vitest'

import { keyRow } from './keys'

const labels = (id: Parameters<typeof keyRow>[0]) => keyRow(id).map((k) => k.label)

describe('keyRow', () => {
  it('starts with the editing keys', () => expect(labels('python').slice(0, 2)).toEqual(['Tab', '⇤']))
  it("adds the language's symbols", () => expect(labels('python')).toContain(':'))
  it('uses the shell symbols for a Slurm script', () =>
    expect(labels('slurm').slice(8)).toEqual(labels('shell').slice(8)))
  it('has common symbols for plain text', () => expect(labels('plain')).toContain('{'))
  it('gives every key its own id', () => {
    const ids = keyRow('latex').map((k) => k.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
