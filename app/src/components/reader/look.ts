export const FONTS = [
  { id: 'literata', label: 'Literata', family: '"Literata", Georgia, serif' },
  { id: 'source', label: 'Source Serif', family: '"Source Serif 4", Georgia, serif' },
  { id: 'charter', label: 'Charter', family: '"Charter", "Bitstream Charter", "Charis SIL", Georgia, serif' },
  { id: 'inter', label: 'Inter', family: '"Inter", system-ui, sans-serif' },
  { id: 'atkinson', label: 'Atkinson', family: '"Atkinson Hyperlegible", system-ui, sans-serif' },
  { id: 'pdf', label: 'Like the PDF', family: '"Latin Modern Roman", "LM Roman 10", "CMU Serif", KaTeX_Main, serif' },
] as const
export const SPACINGS = { tight: 1.4, normal: 1.62, loose: 1.85 }
export const WIDTHS = { narrow: 28, medium: 34, wide: 44 }  // em
export const BACKGROUNDS = [
  { id: 'white', label: 'White', color: '#ffffff' },
  { id: 'sepia', label: 'Sepia', color: '#f6eedc' },
  { id: 'grey', label: 'Grey', color: '#e4e4e2' },
  { id: 'black', label: 'Black', color: '#1c1c1f' },
] as const
export const SIZES = { min: 14, max: 32 }

/** How the Reader looks. */
export type Look = {
  font: (typeof FONTS)[number]['id']
  size: number
  spacing: keyof typeof SPACINGS
  width: keyof typeof WIDTHS
  bg: (typeof BACKGROUNDS)[number]['id'] | ''  // '': follows the app, white or black
  math: 'source' | 'pdf'
}

export const START: Look = { font: 'literata', size: 20, spacing: 'normal', width: 'medium', bg: '', math: 'source' }

/** A remembered look, with anything missing or no longer valid back at its start value. */
export function parseLook(json: string): Look {
  try {
    const got = JSON.parse(json) as Partial<Look>
    const ok = <K extends keyof Look>(k: K, valid: (v: unknown) => boolean) => valid(got[k]) ? got[k] as Look[K] : START[k]
    return {
      font: ok('font', (v) => FONTS.some((f) => f.id === v)),
      size: ok('size', (v) => typeof v === 'number' && v >= SIZES.min && v <= SIZES.max),
      spacing: ok('spacing', (v) => typeof v === 'string' && v in SPACINGS),
      width: ok('width', (v) => typeof v === 'string' && v in WIDTHS),
      bg: ok('bg', (v) => v === '' || BACKGROUNDS.some((b) => b.id === v)),
      math: ok('math', (v) => v === 'source' || v === 'pdf'),
    }
  } catch { return START }
}
