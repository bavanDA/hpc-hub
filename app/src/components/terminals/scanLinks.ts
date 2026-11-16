import { call } from '../../rpc'
import type { Link } from '../../types/terminals'
import { openLink } from '../app/openLink'
import { inTauri } from '../app/platform'
import { openHere as openSaved } from '../files/local'
import { banner } from './banners'
import { betterPagePath, linkBanner, mayHaveLinks, pageName } from './linkBanner'
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

/** An .html file the terminal named comes here with the files it uses (Downloads/HPC Hub/<cluster>/pages), fresh
 * each time, and opens in this computer's browser. A relative path is in the session's folder. */
async function openPage(tab: Tab, path: string) {
  tabNotify('Opening it on this computer…')
  try {
    const here = await call<string>('terminals.page', { cluster: tab.cluster, path, session: tab.session, node: tab.node })
    if (!inTauri) return tabNotify(`Saved to ${here}`)
    await openSaved(here)
  } catch (e) {
    tabNotify(`Could not open it: ${(e as Error).message ?? e}`)
  }
}

const pages = new WeakMap<Tab, Map<string, string>>()  // a tab's pages: file name -> the best path to it
function pagesOf(tab: Tab) {
  let known = pages.get(tab)
  if (!known) pages.set(tab, (known = new Map()))
  return known
}

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
    if (link.kind === 'page') {  // one banner a page, whichever ways it is named
      const known = pagesOf(tab)
      const name = pageName(link.url)
      const path = known.get(name)
      known.set(name, path ? betterPagePath(path, link.url) : link.url)
      if (path) continue
    }
    const id = link.url + link.code
    if (tab.seen.has(id)) continue
    tab.seen.add(id)
    const copied = link.kind === 'device-login' && link.code ? await copyText(link.code) : false
    const b = linkBanner(link, copied, tab.node || 'the login node')
    if (b) {
      banner(tab, b.text, b.button, b.copy
        ? () => copyText(link.code).then((ok) => tabNotify(ok ? 'Code copied' : 'Could not copy'))
        : b.forward ? () => openHere(tab, link.url)
        : b.file ? () => openPage(tab, pagesOf(tab).get(pageName(link.url)) ?? link.url)
        : () => openLink(link.url))
    }
    tab.onLink?.(link)
  }
}
