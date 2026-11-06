import { changed, getTab } from './tabStore'
import type { Tab } from './tabs'

export function banner(tab: Tab, text: string, button?: string, action?: () => void) {
  tab.banners = [...tab.banners, { id: `${Date.now()}-${tab.banners.length}`, text, button, action }]
  changed()
}

export function addBanner(key: string, text: string, button?: string, action?: () => void) {
  const tab = getTab(key)
  if (tab) banner(tab, text, button, action)
}

export function dismiss(tab: Tab, id: string) {
  tab.banners = tab.banners.filter((b) => b.id !== id)
  changed()
}
