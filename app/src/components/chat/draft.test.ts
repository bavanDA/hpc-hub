// 2026-11-23 report: a long message typed in the chat was gone after going to another page or tab (or picking a
// command from the / menu). What you type is kept per tab until you send it.
import { beforeEach, describe, expect, it } from 'vitest'

import view from './ChatView.tsx?raw'
import { DRAFT_MAX, loadDraft, saveDraft } from './draft'

const store = new Map<string, string>()
beforeEach(() => {
  store.clear()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v) },
      removeItem: (k: string) => { store.delete(k) },
    },
  })
})
const tab = { cluster: 'wulver', session: 'hpchub-claude-1659999-ab12cd34' }

describe('the text you typed', () => {
  it('comes back for the same tab', () => {
    const long = 'Please rewrite the analysis section.\n'.repeat(80)
    saveDraft(tab, long)
    expect(loadDraft(tab)).toBe(long)
    expect(loadDraft({ ...tab })).toBe(long)  // a new view of the same session (another page and back, a reload)
  })
  it('is kept per tab and per cluster', () => {
    saveDraft(tab, 'for this one')
    expect(loadDraft({ ...tab, session: 'hpchub-claude-1659999-ef56ab78' })).toBe('')
    expect(loadDraft({ ...tab, cluster: 'delta' })).toBe('')
  })
  it('goes once sent (an empty box forgets it)', () => {
    saveDraft(tab, 'hello')
    saveDraft(tab, '')
    expect(loadDraft(tab)).toBe('')
    saveDraft(tab, '   \n')
    expect(store.size).toBe(0)
  })
  it('is capped', () => {
    saveDraft(tab, 'x'.repeat(DRAFT_MAX + 50))
    expect(loadDraft(tab).length).toBe(DRAFT_MAX)
  })
  it('without storage nothing breaks', () => {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => { throw new Error('off') } })
    expect(() => saveDraft(tab, 'hi')).not.toThrow()
    expect(loadDraft(tab)).toBe('')
  })
})

describe('the chat view keeps it', () => {
  it('starts from the kept text and keeps every change', () => {
    expect(view).toContain('useState(() => loadDraft(tab))')
    expect(view).toContain('useEffect(() => saveDraft(tab, draft), [tab, draft])')
  })
  it('a command from the / menu never wipes what you typed', () => {
    expect(view).toContain('const mine = text === draft')
    expect(view).toContain("if (mine) setDraft('')")
    expect(view).not.toContain("if (c === '/model' || c === '/effort') setDraft(c + ' ')")
    expect(view).toContain("else if (!draft.trim()) setDraft(c + ' ')")
  })
})
