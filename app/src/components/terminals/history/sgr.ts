// Turns tmux's colored lines (capture-pane -e) into runs of text and style. tmux carries a style from one line to the
// next, so a window of lines is read top to bottom with one running state.
import type { CSSProperties } from 'react'

export type Span = { text: string; style?: CSSProperties }
export type Row = { spans: Span[]; plain: string }
export type Palette = string[]  // the 16 ANSI colors

// xterm's own defaults, so the reading copy matches the live terminal
export const ANSI_DARK: Palette = ['#2e3436', '#cc0000', '#4e9a06', '#c4a000', '#3465a4', '#75507b', '#06989a', '#d3d7cf',
  '#555753', '#ef2929', '#8ae234', '#fce94f', '#729fcf', '#ad7fa8', '#34e2e2', '#eeeeec']
export const ANSI_LIGHT: Palette = [...ANSI_DARK.slice(0, 3), '#9c6e03', ...ANSI_DARK.slice(4, 7), '#77767b',
  ...ANSI_DARK.slice(8, 11), '#b58300', ...ANSI_DARK.slice(12, 15), '#5e5c64']

type State = { fg?: string; bg?: string; bold: boolean; dim: boolean; italic: boolean; under: boolean; strike: boolean; inverse: boolean }

const fresh = (): State => ({ bold: false, dim: false, italic: false, under: false, strike: false, inverse: false })

function color256(n: number, palette: Palette): string {
  if (n < 16) return palette[n]
  if (n >= 232) { const v = 8 + (n - 232) * 10; return `rgb(${v},${v},${v})` }
  const steps = [0, 95, 135, 175, 215, 255]
  const k = n - 16
  return `rgb(${steps[Math.floor(k / 36) % 6]},${steps[Math.floor(k / 6) % 6]},${steps[k % 6]})`
}

function readColor(codes: number[], at: number, palette: Palette): [string | undefined, number] {
  if (codes[at + 1] === 5) return [color256(codes[at + 2], palette), 2]
  if (codes[at + 1] === 2) return [`rgb(${codes[at + 2]},${codes[at + 3]},${codes[at + 4]})`, 4]
  return [undefined, 0]
}

function apply(state: State, codes: number[], palette: Palette): State {
  let s = state
  for (let i = 0; i < codes.length; i++) {
    const c = codes[i]
    if (c === 0) s = fresh()
    else if (c === 1) s = { ...s, bold: true }
    else if (c === 2) s = { ...s, dim: true }
    else if (c === 3) s = { ...s, italic: true }
    else if (c === 4) s = { ...s, under: true }
    else if (c === 7) s = { ...s, inverse: true }
    else if (c === 9) s = { ...s, strike: true }
    else if (c === 22) s = { ...s, bold: false, dim: false }
    else if (c === 23) s = { ...s, italic: false }
    else if (c === 24) s = { ...s, under: false }
    else if (c === 27) s = { ...s, inverse: false }
    else if (c === 29) s = { ...s, strike: false }
    else if (c >= 30 && c <= 37) s = { ...s, fg: palette[c - 30] }
    else if (c === 38) { const [v, n] = readColor(codes, i, palette); s = { ...s, fg: v }; i += n }
    else if (c === 39) s = { ...s, fg: undefined }
    else if (c >= 40 && c <= 47) s = { ...s, bg: palette[c - 40] }
    else if (c === 48) { const [v, n] = readColor(codes, i, palette); s = { ...s, bg: v }; i += n }
    else if (c === 49) s = { ...s, bg: undefined }
    else if (c >= 90 && c <= 97) s = { ...s, fg: palette[c - 90 + 8] }
    else if (c >= 100 && c <= 107) s = { ...s, bg: palette[c - 100 + 8] }
  }
  return s
}

function styleOf(s: State): CSSProperties | undefined {
  const color = s.inverse ? (s.bg ?? 'var(--term-bg, inherit)') : s.fg
  const backgroundColor = s.inverse ? (s.fg ?? 'var(--term-fg, currentColor)') : s.bg
  const style: CSSProperties = {}
  if (color) style.color = color
  if (backgroundColor) style.backgroundColor = backgroundColor
  if (s.bold) style.fontWeight = 700
  if (s.dim) style.opacity = 0.6
  if (s.italic) style.fontStyle = 'italic'
  if (s.under || s.strike) style.textDecoration = [s.under ? 'underline' : '', s.strike ? 'line-through' : ''].filter(Boolean).join(' ')
  return Object.keys(style).length ? style : undefined
}

// the marker of an SGR sequence, ESC [ ... m
// eslint-disable-next-line no-control-regex
const SGR = /\x1b\[([0-9;:]*)m/g
// eslint-disable-next-line no-control-regex
const OTHER = /\x1b(?:\[[0-9;?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\)|[@-_])|[\x00-\x08\x0b-\x1f\x7f]/g

/** Parse lines as tmux gave them, in order, a style running on from one to the next. */
export function parseRows(lines: string[], palette: Palette): Row[] {
  let state = fresh()
  return lines.map((line) => {
    const spans: Span[] = []
    let last = 0
    const push = (text: string) => {
      const clean = text.replace(OTHER, '')
      if (clean) spans.push({ text: clean, style: styleOf(state) })
    }
    SGR.lastIndex = 0
    for (let m = SGR.exec(line); m; m = SGR.exec(line)) {
      push(line.slice(last, m.index))
      state = apply(state, m[1] === '' ? [0] : m[1].split(/[;:]/).map(Number), palette)
      last = m.index + m[0].length
    }
    push(line.slice(last))
    return { spans, plain: spans.map((s) => s.text).join('') }
  })
}

/** The line as plain text: what a mark saves and Copy gives. */
export const stripped = (line: string) => line.replace(SGR, '').replace(OTHER, '')
