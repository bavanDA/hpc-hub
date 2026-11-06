import { call } from '../../rpc'
import type { Link } from '../../types/terminals'
import { banner } from './banners'
import { linkBanner, mayHaveLinks } from './linkBanner'
import { openLink } from './pty'
import { tabNotify } from './tabNotify'
import type { Tab } from './tabs'
import { copyText } from './xterm'

/** Links the terminal printed (VS Code tunnel, device sign-in...) become banners, once each. */
export async function scanLinks(tab: Tab, text: string) {
  if (!mayHaveLinks(text)) return
  let found: Link[]
  try {
    found = await call<Link[]>('terminals.links', { text, node: tab.node })
  } catch {
    return
  }
  for (const link of found) {
    const id = link.url + link.code
    if (tab.seen.has(id)) continue
    tab.seen.add(id)
    const copied = link.kind === 'device-login' && link.code ? await copyText(link.code) : false
    const b = linkBanner(link, copied)
    if (b) {
      banner(tab, b.text, b.button, b.copy
        ? () => copyText(link.code).then((ok) => tabNotify(ok ? 'Code copied' : 'Could not copy'))
        : () => openLink(link.url))
    }
    tab.onLink?.(link)
  }
}
