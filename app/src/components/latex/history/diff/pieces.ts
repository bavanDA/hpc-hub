import type { FileDiff, Move, Row } from '../../../../types/history'
import type { Layout, PutBack, Target } from './types'

export function movesOf(moves: Move[], path: string): string {
  const into = moves.filter((m) => m.to.path === path).reduce((n, m) => n + m.lines, 0)
  const out = moves.filter((m) => m.from.path === path).reduce((n, m) => n + m.lines, 0)
  return [into && `${into} moved in`, out && `${out} moved out`].filter(Boolean).join(' · ')
}
export type Piece = { kind: 'gap'; lines: number } | { kind: 'row'; left?: Row; right?: Row; both?: Row; blk?: Target }
  | { kind: 'moved-out'; move: Move; rows: Row[] } | { kind: 'moved-in'; move: Move }
  | { kind: 'back'; put: PutBack }

export function pieces(f: FileDiff, layout: Layout, moved: boolean, moves: Move[], putBack: boolean): Piece[] {
  const out: Piece[] = []
  let lastOld = 0
  f.hunks.forEach((h, hi) => {
    const gap = h.old - 1 - lastOld
    if (gap > 0 && !(hi === 0 && f.status === 'A')) out.push({ kind: 'gap', lines: gap })
    lastOld = h.old - 1 + h.rows.filter((r) => r.k !== '+' && !r.src).length
    // without "Find moved text" a move is a plain delete and add
    const rows: Row[] = moved ? h.rows : h.rows.filter((r) => !r.src)
      .map((r) => r.mv ? { ...r, mv: undefined, same: false, o: r.k === '+' ? null : r.o } : r)
    const out_ = (r: Row) => !!r.mv && r.k === '-' && !r.src
    let i = 0, ctx: Row | null = null
    while (i < rows.length) {
      const r = rows[i]
      if (out_(r)) {  // moved away: one line saying where to
        const run: Row[] = []
        while (i < rows.length && rows[i].mv === r.mv && out_(rows[i])) run.push(rows[i++])
        out.push({ kind: 'moved-out', move: moves.find((m) => m.id === r.mv)!, rows: run })
        continue
      }
      if (r.mv && rows[i - 1]?.mv !== r.mv) out.push({ kind: 'moved-in', move: moves.find((m) => m.id === r.mv)! })
      if (r.k === ' ' || r.same) { out.push({ kind: 'row', both: r }); ctx = r; i++; continue }
      const old: Row[] = [], now: Row[] = []
      while (i < rows.length && rows[i].k !== ' ' && !rows[i].same && !out_(rows[i]) && rows[i].mv === r.mv) {
        if (rows[i].k === '-') old.push(rows[i])
        else now.push(rows[i])
        i++
      }
      const from = out.length
      if (layout === 'split') {
        for (let k = 0; k < Math.max(old.length, now.length); k++) out.push({ kind: 'row', left: old[k], right: now[k] })
      } else {
        old.forEach((x) => out.push({ kind: 'row', left: x }))
        now.forEach((x) => out.push({ kind: 'row', right: x }))
      }
      const ns = now.map((x) => x.n ?? 0).filter(Boolean)
      const at = ns[0] ?? (ctx?.n ?? h.new - 1) + 1
      const blk: Target = { path: f.path, line: at, end: ns[ns.length - 1] ?? at, anchor: anchorOf(f.path, out[out.length - 1]),
        diff: [...old.map((x) => `-${x.t}`), ...now.map((x) => `+${x.t}`)].join('\n') }
      for (let k = from; k < out.length; k++) (out[k] as Extract<Piece, { kind: 'row' }>).blk = blk
      if (putBack && !r.mv) {
        const line = now[0]?.n ?? ((ctx?.n ?? h.new - 1) + 1)
        out.push({ kind: 'back', put: { path: f.path, line, expect: now.map((x) => x.t), lines: old.map((x) => x.t) } })
      }
    }
  })
  return out
}

/** The row a thread shows under: its line now, or its old line when it was removed. */
export function anchorOf(path: string, p: Piece | undefined): string {
  if (!p || p.kind !== 'row') return `${path}#top`
  const r = p.right ?? p.both
  return r?.n != null ? `${path}#n${r.n}` : `${path}#o${p.left?.o ?? 0}`
}
