/** Seconds as m:ss, or h:mm:ss from an hour on. */
export function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}
