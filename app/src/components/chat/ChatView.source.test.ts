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
    expect(view).toContain("const given = screen?.draft ?? ''")
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
    expect(view).toMatch(/const keep = \(e: Error\) => \{ setDraft\(\(d\) => d\.trim\(\) \? d : t\); fail\(e\) \}/)
    expect(view).toContain('void send(t).catch(keep)')
  })
})
