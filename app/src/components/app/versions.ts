/** a > b in semver order: 0.2.6 > 0.2.6-beta.3 > 0.2.6-beta.2 > 0.2.5. */
export function newer(a: string, b: string): boolean {
  const split = (v: string) => { const [core, pre = ''] = v.split('-', 2); return [core.split('.').map(Number), pre] as const }
  const [ca, pa] = split(a), [cb, pb] = split(b)
  for (let i = 0; i < 3; i++) if ((ca[i] ?? 0) !== (cb[i] ?? 0)) return (ca[i] ?? 0) > (cb[i] ?? 0)
  if (!pa || !pb) return !pa && !!pb  // a release is newer than its own betas
  const na = Number(pa.split('.').pop()), nb = Number(pb.split('.').pop())
  return Number.isFinite(na) && Number.isFinite(nb) ? na > nb : pa > pb
}

/** A newer offer than the one shown: a newer version, or a later quick fix ("0.2.7-beta.55 fix 2") of the same. */
export function replaces(next: string, shown: string): boolean {
  const base = (v: string) => v.split(' fix ')[0]
  const fix = (v: string) => Number(v.split(' fix ')[1] ?? 0)
  if (base(next) !== base(shown)) return newer(base(next), base(shown))
  return fix(next) > fix(shown)
}

/** Whether a quiet check's offer takes the place of what the update window shows now. An offer that failed to install
 * is replaced by a newer one: 2026-11-23, fix 32 couldn't install, and the app kept showing its error and never
 * offered the beta that came out after it until it was restarted. Busy (downloading, installing) is left alone. */
export function takesOver(next: string, now: { kind: string; version?: string }): boolean {
  if (now.kind === 'idle' || now.kind === 'none') return true
  if (now.kind !== 'available' && now.kind !== 'error') return false  // checking, downloading, installing
  return !now.version || replaces(next, now.version)
}

/** A download that is gone: the beta moved on (a newer one replaced its files) after this one was offered. */
export function gone(e: unknown): boolean {
  return /\b404\b|not found/i.test(e instanceof Error ? e.message : String(e))
}
