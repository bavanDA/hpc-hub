import type { SwitchDone, SyncDone, SyncState } from '../../../types/history'
import { plural } from './format'

export function switchSteps(changes: number, remotes: number, files: number): string[] {
  return [...(changes ? [`Made a safe copy of your ${plural(changes, 'change')}`] : []),
    ...(remotes ? ['Got the latest from origin'] : []), `Updating ${plural(files, 'file')}`, 'Rebuild the PDF']
}

export function switchedText(target: string, r: SwitchDone): string {
  const along = r.brought ? ` Your ${plural(r.brought, 'change')} came along.` : r.kept ? ` Your changes wait on ${r.from}.` : ''
  const back = r.back === 'back' ? ' Your changes kept here are back.' : r.back === 'kept'
    ? ' Your changes kept here clash now, so they wait in Saved versions.' : ''
  return `Now on ${target}.${along}${back}`
}

export function syncedText(r: SyncDone): string {
  const parts = [r.push ? (r.pushed ? `Pushed ${plural(r.pushed, 'commit')}` : 'Nothing new to push')
    : (r.pulled ? `Got ${plural(r.pulled, 'new commit')}` : 'Already up to date'),
  r.back ? `your ${plural(r.back, 'change')} ${r.back === 1 ? 'is' : 'are'} back` : '']
  return parts.filter(Boolean).join(', ')
}

export function busyLabel(switching: string | null, run: { push: boolean; error: string } | null,
  paused: SyncState | null): { label: string } | null {
  return switching !== null ? { label: `Switching to ${switching}` }
    : run && !paused && !run.error ? { label: run.push ? 'Pushing' : 'Getting the latest' }
    : paused ? { label: `${run?.push ? 'Push' : 'Update'} paused: ${plural(paused.spots.length, 'spot')} to settle` } : null
}
