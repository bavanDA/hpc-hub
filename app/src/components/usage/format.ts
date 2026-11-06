export const n = (v: number, digits = 0) =>
  v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })

export const pct = (part: number, whole: number) => (whole ? `${((100 * part) / whole).toFixed(1)}%` : '0%')
