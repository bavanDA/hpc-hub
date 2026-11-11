import { errorReport, openReport } from './open'

/** A quiet Report next to an error on screen: opens the report window with that error, and the failed call behind
 *  it when there is one. cluster: add that cluster's connection log. */
export function ReportLink({ error, cluster, className = '' }:
  { error: string; cluster?: string; className?: string }) {
  return (
    <button type="button" onClick={() => openReport(errorReport(error, cluster))}
      className={`shrink-0 rounded font-semibold text-dim underline underline-offset-2 hover:text-text ${className}`}>
      Report</button>
  )
}
