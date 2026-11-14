import { call } from '../../rpc'
import type { Link } from '../../types/terminals'
import { openLink } from '../app/openLink'
import { banner } from './banners'
import { linkBanner, mayHaveLinks } from './linkBanner'
import { tabNotify } from './tabNotify'
import type { Tab } from './tabs'
import { copyText } from './xterm'

/** A page on the cluster opens in this computer's browser: its port comes here over the connection (once per
 * page and tab; the link keeps its path and token). */
function openHere(tab: Tab, url: string) {
  const known = forwarded.get(tab.key + url)
  if (known) return openLink(known)
  tabNotify('Opening it on this computer…')
  call<string>('tools.forward', { cluster: tab.cluster, url, node: tab.node })
    .then((here) => { forwarded.set(tab.key + url, here); openLink(here) })
    .catch((e: Error) => tabNotify(`Could not open it: ${e.message}`))
}

const forwarded = new Map<string, string>()

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
    const b = linkBanner(link, copied, tab.node || 'the login node')
    if (b) {
      banner(tab, b.text, b.button, b.copy
        ? () => copyText(link.code).then((ok) => tabNotify(ok ? 'Code copied' : 'Could not copy'))
        : b.forward ? () => openHere(tab, link.url)
        : () => openLink(link.url))
    }
    tab.onLink?.(link)
  }
}
