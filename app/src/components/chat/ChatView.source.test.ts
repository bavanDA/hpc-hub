// The chat view's wiring, read from its source (these unit tests run without a page to draw in).
import { describe, expect, it } from 'vitest'

import tab from '../terminals/makeTab.ts?raw'
import view from './ChatView.tsx?raw'

describe('the chat view can be read, copied and followed', () => {
  // 2026-11-18: the app turns selection off everywhere, and the chat never turned it back on (owner's report)
  it('its conversation can be selected', () => {
    expect(view).toMatch(/ref=\{list\}[^>]*select-text/)
  })
  it("Claude's replies and code blocks have a Copy button", () => {
    expect(view).toContain('<CopyButton text={text}')
    expect(view).toContain('copyText(b.text)')
  })
  it('a link opens in the browser the app uses for links, not inside the window', () => {
    expect(view).toMatch(/onClick=\{\(e\) => \{ e\.preventDefault\(\); void openLink\(p\.url\) \}\}/)
  })
})

describe('terminal links', () => {
  // 2026-11-18: Claude's long login link, cut into full rows, was not a link (owner's report)
  it('every tab finds links with the finder that joins cut rows, and opens the whole address', () => {
    expect(tab).toContain('linksAt(row, term.cols, line - 1)')
    expect(tab).toContain('openLink(f.url)')
    expect(tab).not.toContain('WebLinksAddon')
  })
})

// 2026-11-20 report (Linux): "when claude is not starting it should say wait or claude loading", and switching
// modes was slow with nothing showing it was on its way
describe('while Claude starts, and while a mode switch is on its way', () => {
  it('says Claude is starting', () => {
    expect(view).toContain('const wait = starting(screen)')
    expect(view).toMatch(/\{!state\.waiting && wait && \(/)
    expect(view).toContain('Claude is starting…')
  })

  it('the mode buttons wait for Claude, and the one clicked pulses until the switch is done', () => {
    expect(view).toContain('disabled={wait || !!switching}')
    expect(view).toMatch(/setSwitching\(m\.value as Mode\)\s+mode\(m\.value as Mode\)\.catch\(fail\)\.finally\(\(\) => setSwitching\(null\)\)/)
    expect(view).toContain("'animate-pulse bg-hover'")
  })
})

describe('stopping and editing a message (2026-11-22 report: messages ran together, some never showed)', () => {
  it("a message Claude gave back comes into the message box to edit, with a note that sending replaces it", () => {
    expect(view).toContain("const inBox = screen?.draft ?? ''")
    expect(view).toContain("const given = echo ? '' : inBox")  // not the message just sent, on its way in
    expect(view).toMatch(/setDraft\(\(d\) => d\.trim\(\) \? d : given\)/)  // never over what you are writing
    expect(view).toContain("Claude gave your message back, unsent.")
    expect(view).toContain("onClick={() => setDraft(given)}")
  })
  it('every message shows; one stopped and sent again is marked, never left out', () => {
    expect(view).toContain('items(state.events, state.cwd, given, state.links)')
    expect(view).toContain('Stopped before Claude answered · sent again below')
  })
  it('Stop goes through chat.stop (Esc only while Claude works), and a message not sent comes back to the box', () => {
    expect(view).toContain('stop().catch(fail)')
    expect(view).not.toContain("key('escape')")
    expect(view).toMatch(/const keep = \(e: Error\) => \{ setDraft\(\(d\) => d\.trim\(\) \? d : t\); if \(p\) drop\(p\); fail\(e\) \}/)
    expect(view).toContain('void send(t).catch(keep)')
  })
})

// 2026-11-24 report: "when I send msg in claude chat, it doesn't look real, I don't see any animation, or scrolling,
// I should scroll myself"
describe('the chat feels live', () => {
  it('your message shows at once, dimmed, until Claude\'s file has it (not a / command)', () => {
    expect(view).toContain("const p = pends(t) ? pend(t, shownItems, pending, Date.now(), `pending-${++sends.current}`) : null")
    expect(view).toContain('settle(pending, shownItems, given, now)')
    expect(view).toContain('{left.map((p) => (')
    expect(view).toContain('opacity-60')
    expect(view).toContain('pendingNote(p, !!screen?.busy, now)')
  })

  it('follows the end whenever the chat grows, not only on a new item, and sending always goes there', () => {
    expect(view).toContain('new ResizeObserver(() => { if (atEnd.current) toEnd(live.current) })')
    expect(view).toContain('grew.observe(body)')
    expect(view).toMatch(/<div ref=\{content\}/)
    expect(view).not.toContain('}, [shownItems.length, ask])')  // the old follow, on the count only
    expect(view).toMatch(/sent\.current = \{ text: t, at: Date\.now\(\), seen: false \}\s+follow\(\)/)
  })

  it('a smooth scroll of ours never stops the following; you scrolling up does', () => {
    expect(view).toContain("el.scrollTo({ top, behavior: gliding.current ? 'smooth' : 'auto' })")
    expect(view).toContain('if (gliding.current && !up) { if (gap < 2) gliding.current = false; return }')
    expect(view).toContain('atEnd.current = gap < 80')
    expect(view).toContain('onWheel={(e) => { if (e.deltaY < 0) gliding.current = false }}')
    expect(view).toContain('onPointerDown={() => { gliding.current = false }}')
    expect(view).toContain('gliding.current = smooth && !calm()')  // less motion asked for: no glide
    expect(view).toContain("matchMedia('(prefers-reduced-motion: reduce)')")
  })

  it('new messages below while you read further up: a button takes you there', () => {
    expect(view).toMatch(/!atEnd\.current\) setBelow\(true\)/)
    expect(view).toContain('<ArrowDown size={12} />New messages</button>')
    expect(view).toContain('<button onClick={follow}')
  })

  it('what arrives while you watch rises in; the history never does', () => {
    expect(view).toContain('seen.current = arrive(seen.current,')
    expect(view).toContain("state.waiting ? null : state.events)")
    expect(view).toContain("rises(seen.current!, id) && !swapped.current.has(id) ? ' chat-in' : ''")
    expect(view).toContain('<ToolCard key={it.id} t={it} rise={rise(it.id)} />')
    expect(view).toContain('<Prose key={it.id} text={it.text} rise={rise(it.id)} />')
    expect(view).toContain('${rise(askId)}')
    expect(view).toContain('<span className="typing" aria-hidden="true"><span /><span /><span /></span>Claude is working')
  })
})
