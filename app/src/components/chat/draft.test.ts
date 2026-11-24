// 2026-11-23 report: a long message typed in the chat was gone after going to another page or tab (or picking a
// command from the / menu). What you type is kept per tab until you send it.
import { beforeEach, describe, expect, it } from 'vitest'

import view from './ChatView.tsx?raw'
import { DRAFT_MAX, ECHO_MS, isEcho, loadDraft, saveDraft } from './draft'

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

// 2026-11-24 report: "I send the msg but still msg show in chat box". Claude's box showed the message on its way in
// (the paste, before Enter took it); the view took that for a message Claude gave back and put it in the box again.
describe('the message you just sent, still in Claude\'s box for a moment', () => {
  const text = 'I downloaded them, can you rename them\nand update your html'
  const sent = { text, at: 1_000, seen: false }
  it('is not brought back into your box', () => {
    expect(isEcho('I downloaded them, can you rename them and update your html', sent, 2_000)).toBe(true)
    expect(isEcho('I downloaded them, can you', sent, 2_000)).toBe(true)  // part of the paste so far
    expect(isEcho('[Pasted text #1 +12 lines]', sent, 2_000)).toBe(true)  // how Claude shows a long paste
  })
  it('other text in Claude\'s box still comes back', () => {
    expect(isEcho('a message from before', sent, 2_000)).toBe(false)
    expect(isEcho('', sent, 2_000)).toBe(false)
    expect(isEcho(text, null, 2_000)).toBe(false)  // nothing sent from here
  })
  it('long after the send, it is Claude\'s again (Enter never took it)', () => {
    expect(isEcho(text, sent, 1_000 + ECHO_MS + 1)).toBe(false)
  })
  it('the view hides it everywhere, and Stop or an emptied box ends it', () => {
    expect(view).toContain('const given = echo ? \'\' : inBox')
    expect(view).toContain('sent.current = { text: t, at: Date.now(), seen: false }')
    expect(view).toContain('if (sent.current?.seen) sent.current = null')
    expect(view).toContain('onClick={() => { sent.current = null; stop().catch(fail) }}')
  })
})
