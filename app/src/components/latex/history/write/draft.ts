import type { Change } from '../../../../types/history'

export const commitMessage = (c: { subject: string; body: string }) => c.body.trim() ? `${c.subject.trim()}\n\n${c.body.trim()}`
  : c.subject.trim()

/** Files changed since the agent started: in the commit, not in its message. */
export function editedSince(before: Change[] | undefined, now: Change[]): string[] {
  if (!before) return []
  return now.filter((c) => {
    const b = before.find((x) => x.path === c.path)
    return !b || b.added !== c.added || b.removed !== c.removed
  }).map((c) => c.path)
}
