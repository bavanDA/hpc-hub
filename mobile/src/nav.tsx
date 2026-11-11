// Where you are on the phone: one page of the desktop's sidebar (nav.ts on the desktop, the drawer here). Shared
// desktop code moves around with go('files', { cluster, path }) (app/src/nav.ts); here
// each desktop page maps to a page, or to a tab of one. Android's Back walks the browser history, so every sheet,
// dialog on top pushes an entry and Back closes the top one first (useBackLayer), and only then leaves
// the app.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

import { setActiveCluster } from '@shared/components/clusters/active'
import type { Page } from '@shared/components/app/pages'
import { leave, NavContext, type Go } from '@shared/nav'

/** The pages in the drawer, the desktop sidebar's (latex is Papers there). */
export type PhonePage = 'clusters' | 'projects' | 'terminals' | 'code' | 'agents' | 'latex' | 'jobs' | 'usage' | 'files'
export type Place = { page: PhonePage; params: Record<string, string> }

/** A desktop page (and its tab param), or an older phone name, on the phone. Unknown pages land on Clusters. */
export function placeOf(page: Page | PhonePage | string, params: Record<string, string> = {}): Place {
  const p = { ...params }
  switch (page) {
    case 'clusters': case 'projects': case 'terminals': case 'code': case 'jobs': case 'usage': case 'latex':
    case 'files':
      return { page, params: p }
    case 'papers': return { page: 'latex', params: p }
    case 'backup': return { page: 'agents', params: { ...p, tab: 'backup' } }
    case 'agents': return { page: 'agents', params: p }
    case 'permissions': return { page: 'agents', params: { ...p, tab: 'permissions' } }
    case 'skills': return { page: 'agents', params: { ...p, tab: 'skills' } }
    case 'schedules': return { page: 'agents', params: { ...p, tab: 'scheduled' } }
    case 'globus': return { page: 'files', params: { ...p, tab: 'transfers', view: 'globus' } }
    case 'transfers': return { page: 'files', params: { ...p, tab: 'transfers' } }
    default: return { page: 'clusters', params: {} }
  }
}

// -- Back: one stack of open layers (sheets, screens on top), one history entry each ----------------------------
// Layers only say what is open; history follows a moment later (sync), so changes that cancel out cost nothing:
// React's dev mode mounting twice, or closing one sheet and opening the next in the same tap. While our own
// history.go() is on its way, nothing else moves; its popstate lands, then the rest is done.
type Layer = { back: () => void }
const layers: Layer[] = []
let depth = 0  // history entries we pushed above the page's own
let pending = false  // our history.go() hasn't landed yet
let queued = false

const depthOf = (state: unknown) =>
  typeof (state as { hpcDepth?: unknown } | null)?.hpcDepth === 'number' ? (state as { hpcDepth: number }).hpcDepth : 0

function sync() {
  queued = false
  if (pending) return
  while (depth < layers.length) {
    depth++
    history.pushState({ hpcDepth: depth }, '')
  }
  if (depth > layers.length) {
    pending = true
    history.go(layers.length - depth)  // closed from the UI: drop those entries too
  }
}

function later() {
  if (!queued) { queued = true; setTimeout(sync, 0) }
}

if (typeof window !== 'undefined') {
  history.replaceState({ ...(history.state ?? {}), hpcDepth: 0 }, '')  // entries from before a reload don't count
  window.addEventListener('popstate', (e) => {
    const now = depthOf(e.state)
    if (pending) {
      pending = false
      depth = now
    } else {
      // Back (or Forward): close what's above the entry we're on now, top first
      for (; depth > now; depth--) layers.pop()?.back()
      depth = now
    }
    later()
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
    later()
    return () => {
      const i = layers.indexOf(layer)
      if (i < 0) return  // Back already took it off
      layers.splice(i, 1)
      later()
    }
  }, [active])
}

// -- the provider ----------------------------------------------------------------------------------------------
type PhoneNav = {
  place: Place; go: Go; open: (page: PhonePage) => void
  drawer: boolean; setDrawer: (on: boolean) => void; settings: boolean; setSettings: (on: boolean) => void
}
const PhoneNavContext = createContext<PhoneNav | null>(null)

export function usePhoneNav() {
  const nav = useContext(PhoneNavContext)
  if (!nav) throw new Error('usePhoneNav outside NavProvider')
  return nav
}

export function NavProvider({ first, children }: { first: Place; children: ReactNode }) {
  const [place, setPlace] = useState<Place>(first)
  const [drawer, setDrawer] = useState(false)
  const [settings, setSettings] = useState(firstSettings)
  // leave: a page with unsaved changes (Agents › Permissions) can hold the move and ask first
  const go: Go = useCallback((page, params = {}) => leave(() => {
    if (params.cluster) setActiveCluster(params.cluster)
    setPlace(placeOf(page, params))
  }), [])
  const open = useCallback((page: PhonePage) => leave(() => setPlace({ page, params: {} })), [])
  // Back: another page goes back to Clusters, and from Clusters Back leaves the app.
  useBackLayer(() => open('clusters'), place.page !== 'clusters')
  return (
    <PhoneNavContext.Provider value={{ place, go, open, drawer, setDrawer, settings, setSettings }}>
      <NavContext.Provider value={{ go, params: place.params }}>{children}</NavContext.Provider>
    </PhoneNavContext.Provider>
  )
}

const inTauri = () => '__TAURI_INTERNALS__' in window

/** ?page=jobs&tab=transfers, or the older ?tab=jobs, in a plain browser (design work with the demo data). */
export function firstPlace(): Place {
  if (inTauri()) return { page: 'clusters', params: {} }
  const search = new URLSearchParams(location.search)
  const asked = search.get('page') ?? search.get('tab')
  if (!asked || asked === 'settings') return { page: 'clusters', params: {} }
  const skip = search.has('page') ? ['page', 'theme', 'experimental'] : ['tab', 'theme', 'experimental']
  const params = Object.fromEntries([...search].filter(([k]) => !skip.includes(k)))
  return placeOf(asked, params)
}

/** ?page=settings opens the Settings dialog on start (design work). */
function firstSettings() {
  return !inTauri() && new URLSearchParams(location.search).get('page') === 'settings'
}
