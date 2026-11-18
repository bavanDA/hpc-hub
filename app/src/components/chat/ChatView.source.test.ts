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
