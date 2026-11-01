// Where you are on the phone: a tab at the bottom, and inside More a screen on top of the list. Shared desktop code
// moves around with go('files', { cluster, path }) (app/src/nav.ts); here each desktop page maps to a tab or a More
// screen. Android's Back walks the browser history, so every sheet and every screen on top pushes an entry and
// Back closes the top one first (useBackLayer), and only then leaves the app.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

import { setActiveCluster } from '@shared/components/clusters/active'
import type { Page } from '@shared/components/Sidebar'
import { NavContext, type Go } from '@shared/nav'

export type Tab = 'clusters' | 'terminals' | 'code' | 'jobs' | 'more'
export type MoreScreen = 'projects' | 'agents' | 'files' | 'transfers' | 'papers' | 'usage' | 'settings' | 'about'
export type Place = { tab: Tab; screen?: MoreScreen; params: Record<string, string> }

export const TABS: Tab[] = ['clusters', 'terminals', 'code', 'jobs', 'more']
export const SCREENS: MoreScreen[] = ['projects', 'agents', 'files', 'transfers', 'papers', 'usage', 'settings', 'about']

/** A desktop page (and its tab param) on the phone. Unknown pages land on Clusters. */
export function placeOf(page: Page | Tab | MoreScreen | string, params: Record<string, string> = {}): Place {
  const p = { ...params }
  switch (page) {
    case 'clusters': case 'terminals': case 'code': case 'jobs': case 'more':
      return { tab: page, params: p }
    case 'latex': return { tab: 'more', screen: 'papers', params: p }
    case 'permissions': return { tab: 'more', screen: 'agents', params: { ...p, tab: 'permissions' } }
    case 'skills': return { tab: 'more', screen: 'agents', params: { ...p, tab: 'skills' } }
    case 'schedules': return { tab: 'more', screen: 'agents', params: { ...p, tab: 'scheduled' } }
    case 'globus': return { tab: 'more', screen: 'transfers', params: p }
    case 'files':
      return { tab: 'more', screen: p.tab === 'transfers' ? 'transfers' : 'files', params: p }
    default:
      return SCREENS.includes(page as MoreScreen)
        ? { tab: 'more', screen: page as MoreScreen, params: p } : { tab: 'clusters', params: {} }
  }
}

// -- Back: one stack of open layers (sheets, screens on top), each with a history entry -------------------------
type Layer = { back: () => void }
const layers: Layer[] = []
let ignore = 0  // popstates we caused ourselves (closing a layer from the UI), not Back presses

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    if (ignore > 0) { ignore--; return }
    layers.pop()?.back()
  })
}

/** While mounted, Android Back calls onBack (closes this sheet or screen) before anything below it. */
export function useBackLayer(onBack: () => void, active = true) {
  const ref = useRef(onBack)
  ref.current = onBack
  useEffect(() => {
    if (!active) return
    const layer: Layer = { back: () => ref.current() }
    layers.push(layer)
    history.pushState({ layer: layers.length }, '')
    return () => {
      const i = layers.indexOf(layer)
      if (i < 0) return  // Back already took it off
      layers.splice(i, 1)
      ignore++
      history.back()  // closed from the UI: drop its history entry too
    }
  }, [active])
}

// -- the provider ----------------------------------------------------------------------------------------------
type PhoneNav = { place: Place; go: Go; open: (tab: Tab) => void; openScreen: (s: MoreScreen) => void; closeScreen: () => void }
const PhoneNavContext = createContext<PhoneNav | null>(null)

export function usePhoneNav() {
  const nav = useContext(PhoneNavContext)
  if (!nav) throw new Error('usePhoneNav outside NavProvider')
  return nav
}

/** The More screen on top, so its Header shows a back arrow (null on the tabs themselves). */
export const ScreenBackContext = createContext<(() => void) | null>(null)

export function NavProvider({ first, children }: { first: Place; children: ReactNode }) {
  const [place, setPlace] = useState<Place>(first)
  const go: Go = useCallback((page, params = {}) => {
    if (params.cluster) setActiveCluster(params.cluster)
    setPlace(placeOf(page, params))
  }, [])
  const open = useCallback((tab: Tab) => setPlace({ tab, params: {} }), [])
  const openScreen = useCallback((screen: MoreScreen) => setPlace({ tab: 'more', screen, params: {} }), [])
  const closeScreen = useCallback(() => setPlace((p) => ({ tab: p.tab, params: {} })), [])
  // Back: a screen on top of More goes back to the list first; another tab then goes back to Clusters. The tab's
  // layer is declared first so the screen's sits above it.
  useBackLayer(() => open('clusters'), place.tab !== 'clusters')
  useBackLayer(closeScreen, !!place.screen)
  return (
    <PhoneNavContext.Provider value={{ place, go, open, openScreen, closeScreen }}>
      <NavContext.Provider value={{ go, params: place.params }}>{children}</NavContext.Provider>
    </PhoneNavContext.Provider>
  )
}

/** ?tab=jobs, ?tab=usage or ?tab=files&path=... in a plain browser (design work with the demo data). */
export function firstPlace(): Place {
  if ('__TAURI_INTERNALS__' in window) return { tab: 'clusters', params: {} }
  const search = new URLSearchParams(location.search)
  const tab = search.get('tab')
  if (!tab) return { tab: 'clusters', params: {} }
  const params = Object.fromEntries([...search].filter(([k]) => k !== 'tab' && k !== 'theme'))
  return placeOf(tab, params)
}
