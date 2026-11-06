import type { HCommit } from '../../../types/history'

// your own commits put on top again get new hashes, so they also match by author and subject
export function newCommits(before: HCommit[], log: HCommit[]): Set<string> {
  const had = new Set(before.map((c) => `${c.author}\n${c.subject}`))
  return new Set(log.filter((c) => !before.some((b) => b.hash === c.hash) && !had.has(`${c.author}\n${c.subject}`))
    .map((c) => c.hash))
}
