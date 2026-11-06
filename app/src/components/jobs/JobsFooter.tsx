import type { JobList } from '../../types/jobs'
import { usageText } from './format'

const SU_HELP = "Service units, the cluster's currency. 1 SU is roughly 1 core for 1 hour. Free queues cost nothing."

export function JobsFooter({ list, updated }: { list: JobList | null; updated: string }) {
  const usage = list ? usageText(list.accounts) : ''
  return (
    <footer className="flex h-11 shrink-0 items-center gap-4 border-t border-line bg-window px-4 text-sm">
      <span className="shrink-0 text-dim">{list ? `${list.jobs.length} jobs · updated ${updated}` : 'Loading…'}</span>
      <span className="min-w-0 flex-1 truncate text-right" title={usage && SU_HELP}>{usage}</span>
    </footer>
  )
}
