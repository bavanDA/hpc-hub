/** 1234567 -> "1.2 MB", like GLib.format_size. */
export function formatSize(n: number) {
  const units = ['kB', 'MB', 'GB', 'TB']
  if (n < 1000) return `${n} bytes`
  let v = n
  let unit = ''
  for (const u of units) {
    v /= 1000
    unit = u
    if (v < 1000) break
  }
  return `${v.toFixed(1)} ${unit}`
}
