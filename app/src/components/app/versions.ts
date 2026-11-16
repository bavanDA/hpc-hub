/** a > b in semver order: 0.2.6 > 0.2.6-beta.3 > 0.2.6-beta.2 > 0.2.5. */
export function newer(a: string, b: string): boolean {
  const split = (v: string) => { const [core, pre = ''] = v.split('-', 2); return [core.split('.').map(Number), pre] as const }
  const [ca, pa] = split(a), [cb, pb] = split(b)
  for (let i = 0; i < 3; i++) if ((ca[i] ?? 0) !== (cb[i] ?? 0)) return (ca[i] ?? 0) > (cb[i] ?? 0)
  if (!pa || !pb) return !pa && !!pb  // a release is newer than its own betas
  const na = Number(pa.split('.').pop()), nb = Number(pb.split('.').pop())
  return Number.isFinite(na) && Number.isFinite(nb) ? na > nb : pa > pb
}
