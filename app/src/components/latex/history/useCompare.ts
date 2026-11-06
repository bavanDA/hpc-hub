import { useState } from 'react'

import type { GitState, HCommit, Lanes, Refs } from '../../../types/history'
import { useToast } from '../../useToast'
import { lastLine } from './format'
import { git, type Where } from './git'
import type { Sel } from './list/CommitList'

type Args = { where: Where; state: GitState | null; refs: Refs | null; commits: HCommit[]; sel: Sel
  setSel: (s: Sel) => void }

/** Compare two versions: the timeline, a branch's lanes, and picking an end in the list. */
export function useCompare({ where, state, refs, commits, sel, setSel }: Args) {
  const toast = useToast()
  const [timeline, setTimeline] = useState(false)
  const [lanes, setLanes] = useState<Lanes | null>(null)
  const [picking, setPicking] = useState<'from' | 'to' | null>(null)

  const open = () => {
    setTimeline(true)
    setLanes(null)
    if (sel.kind !== 'compare') {
      const c = sel.kind === 'commit' ? commits.find((x) => x.hash === sel.hash) : null
      setSel(c ? { kind: 'compare', from: c.parents[0] ?? c.hash, to: c.hash }
        : { kind: 'compare', from: commits[0]?.hash ?? '', to: '' })
    }
  }
  const close = () => { setTimeline(false); setLanes(null) }
  const branch = async (name: string) => {
    try {
      const l = await git<Lanes>('lanes', where, { a: state?.branch || 'HEAD', b: name })
      setLanes(l)
      setTimeline(true)
      const tip = l.only_b[0]?.hash ?? refs?.remote.find((r) => r.name === name)?.hash ?? name
      setSel({ kind: 'compare', from: state?.head ?? '', to: tip })
    } catch (e) { toast(lastLine((e as Error).message), { kind: 'error' }) }
  }
  // true when s was taken as the end being picked
  const pick = (s: Sel) => {
    if (!picking || (s.kind !== 'commit' && s.kind !== 'now') || sel.kind !== 'compare') return false
    const v = s.kind === 'now' ? '' : s.hash
    setSel(picking === 'from' ? { ...sel, from: v } : { ...sel, to: v })
    setPicking(null)
    return true
  }

  return { timeline, lanes, picking, setPicking, open, close, branch, pick }
}
