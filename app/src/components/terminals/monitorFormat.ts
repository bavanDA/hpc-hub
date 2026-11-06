// in the app's units: kB, "2 h 47 min"
const UNITS = ['B', 'kB', 'MB', 'GB', 'TB']

export function size(n: number): string {
  let i = 0
  while (n >= 1000 && i < UNITS.length - 1) { n /= 1000; i++ }
  return `${i === 0 || n >= 100 ? n.toFixed(0) : n.toFixed(1)} ${UNITS[i]}`
}

export const rate = (n: number | null) => (n === null ? '...' : `${size(n)}/s`)

export function duration(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return days ? `${days} d ${hours} h` : hours ? `${hours} h ${minutes} min` : `${minutes} min`
}

export type Level = '' | 'warn' | 'high'
export const level = (percent: number | null): Level => (percent === null || percent < 80 ? '' : percent < 90 ? 'warn' : 'high')

export function usedOf(used: number, total: number): string {
  const [a, unitA] = size(used).split(' ')
  const b = size(total)
  return unitA === b.split(' ')[1] ? `${a} / ${b}` : `${size(used)} / ${b}`
}

// a level, not an error: bold and the text color, never red
export const COLORS: Record<Level, string> = { '': '', warn: 'text-text', high: 'font-semibold text-text' }
