import { describe, expect, it } from 'vitest'

import type { BuildDone, Issue } from '../../types/latex'
import { bibKeys, buildMessage, counts, issueFile, issuesIn, labels } from './issues'

const issue = (file: string, level: Issue['level'] = 'error', line = 3) => ({ file, level, line, message: 'x' }) as Issue
const done = (ok: boolean, issues: Issue[], stopped = false) => ({ ok, issues, stopped }) as BuildDone

describe('counts', () => {
  it('counts warnings and bad boxes together', () => {
    expect(counts([issue('a'), issue('a', 'warning'), issue('a', 'box')])).toEqual({ errors: 1, warnings: 2 })
  })
})

describe('buildMessage', () => {
  it('says how it went', () => {
    expect(buildMessage(done(true, []))).toBe('Compiled')
    expect(buildMessage(done(true, [issue('a', 'warning')]))).toBe('Compiled with 1 warning')
    expect(buildMessage(done(true, [issue('a', 'warning'), issue('a', 'box')]))).toBe('Compiled with 2 warnings')
    expect(buildMessage(done(false, [issue('a'), issue('b')]))).toBe('Build failed with 2 errors')
    expect(buildMessage(done(false, []))).toBe('Build failed, see the log')
    expect(buildMessage(done(false, [], true))).toBeNull()
  })
})

describe('issuesIn', () => {
  it('keeps issues naming the file, and unnamed ones for the main file', () => {
    const list = [issue('main.tex'), issue(''), issue('results.tex')]
    expect(issuesIn(list, '/p/main.tex', '/p/main.tex')).toHaveLength(2)
    expect(issuesIn(list, '/p/sections/results.tex', '/p/main.tex').map((i) => i.file)).toEqual(['results.tex'])
  })
})

describe('issueFile', () => {
  const files = ['main.tex', 'sections/results.tex', 'old/results.tex']
  it('goes to the main file when the log names none', () => {
    expect(issueFile(issue(''), files, '/p', '/p/main.tex', null)).toBe('main.tex')
  })
  it('matches a name as given to \\input', () => {
    expect(issueFile(issue('sections/results.tex'), files, '/p', '/p/main.tex', null)).toBe('sections/results.tex')
    expect(issueFile(issue('results.tex'), files, '/p', '/p/main.tex', null)).toBe('sections/results.tex')
  })
  it('prefers the open file over another with the same name', () => {
    expect(issueFile(issue('results.tex'), files, '/p', '/p/main.tex', '/p/old/results.tex')).toBe('old/results.tex')
  })
  it('finds nothing for a file outside the project', () => {
    expect(issueFile(issue('elsewhere.sty'), files, '/p', '/p/main.tex', null)).toBeUndefined()
  })
})

describe('words for completion', () => {
  it('reads bib keys and labels', () => {
    expect(bibKeys('@article{smith2020,\n title={A}}\n@Book { doe2021 , x}')).toEqual(['smith2020', 'doe2021'])
    expect(labels('\\label{fig:map} text \\label{eq:loss}')).toEqual(['fig:map', 'eq:loss'])
  })
})
