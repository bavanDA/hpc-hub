import type { GitState } from '../../../../types/history'

/** The bar's few words on the branch against origin. */
export function branchStatus(s: GitState): string {
  if (!s.upstream) return s.remotes.length ? 'Not on origin yet' : 'No remote'
  if (s.ahead && s.behind) return `${s.ahead} to push, ${s.behind} new`
  if (s.ahead) return `${s.ahead} to push`
  if (s.behind) return `${s.behind} new`
  return 'Up to date'
}
