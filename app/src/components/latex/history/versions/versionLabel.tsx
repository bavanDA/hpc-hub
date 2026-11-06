import { GitCommitHorizontal, Pencil, Tag } from 'lucide-react'
import type { ReactNode } from 'react'

import type { HCommit, Refs } from '../../../../types/history'
import { shortHash, when } from '../format'

/** A version's name as people know it: Now, a tag, or the commit's short hash and subject. */
export function versionLabel(v: string, commits: HCommit[], refs: Refs | null): { icon: ReactNode; name: string; hint: string } {
  if (v === '') return { icon: <Pencil size={13} />, name: 'Now', hint: 'with changes not committed yet' }
  const c = commits.find((x) => x.hash === v || x.short === v)
  const tag = refs?.tags.find((t) => t.hash === c?.hash || t.name === v) ?? (c?.tags[0] ? { name: c.tags[0] } : null)
  if (tag) return { icon: <Tag size={13} />, name: tag.name, hint: c ? when(c.time) : '' }
  return { icon: <GitCommitHorizontal size={13} />, name: c ? shortHash(c.hash) : shortHash(v),
    hint: c?.subject ?? '' }
}
