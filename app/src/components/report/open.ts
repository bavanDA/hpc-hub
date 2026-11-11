// Opening the report window from anywhere: an error's Report button, the crash page, Settings. ReportHost (mounted
// once in each app) shows it.
import { failureFor } from './recent'

/** error: what the person saw. ref: the backend's traceback of that failure. cluster: whose connection log to add. */
export type ReportStart = { kind: 'error' | 'user'; error?: string; ref?: number; cluster?: string }

const listeners = new Set<(r: ReportStart) => void>()
let page = ''

export const openReport = (r: ReportStart) => listeners.forEach((fn) => fn(r))

export function onOpenReport(fn: (r: ReportStart) => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** A report about an error on screen, with the failed call behind it when there is one. */
export function errorReport(error: string, cluster?: string): ReportStart {
  return { kind: 'error', error, ref: failureFor(error)?.ref, ...(cluster ? { cluster } : {}) }
}

/** Where in the app the person is, for the report's page field (each app sets it when the page changes). */
export const setReportPage = (p: string) => { page = p }
export const reportPage = () => page
