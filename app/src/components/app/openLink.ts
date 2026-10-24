// Opening links, like the GTK app's open_uri: with Chrome profiles around, every link asks which one opens it
// (your default from Preferences picked); otherwise it goes straight to the system browser.
// From anywhere: openLink('https://example.com'). <LinkPicker /> in App shows the question.
import { call } from '../../rpc'
import { inTauri } from './platform'
import type { Profiles } from './types'

let profiles: Promise<Profiles> | null = null
type Ask = (url: string, found: Profiles) => void
let ask: Ask | null = null

/** The picker's way in (LinkPicker); without one, links open in your default. */
export const setAsk = (fn: Ask | null) => { ask = fn }

/** The Chrome profiles and the default, read once; Preferences calls forgetProfiles() after a change. */
export function getProfiles(): Promise<Profiles> {
  profiles ??= call<Profiles>('browser.profiles').catch(() => ({ profiles: [], default: '' }))
  return profiles
}
export const forgetProfiles = () => { profiles = null }

export async function openSystem(url: string): Promise<void> {
  if (!inTauri) { window.open(url, '_blank', 'noopener'); return }
  const { openUrl } = await import('@tauri-apps/plugin-opener')
  await openUrl(url)
}

/** In that Chrome profile ("" is the system browser), or the system browser when Chrome can't. */
export async function openIn(url: string, profile: string): Promise<void> {
  if (profile && await call<boolean>('browser.open', { url, profile }).catch(() => false)) return
  await openSystem(url)
}

export async function openLink(url: string): Promise<void> {
  const found = await getProfiles()
  if (!found.profiles.length) return openSystem(url)
  if (ask) ask(url, found)
  else await openIn(url, found.default)
}
