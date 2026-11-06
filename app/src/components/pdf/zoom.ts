export const FITS = ['page-width', 'page-fit', 'auto']
export const ZOOMS: [string, string][] = [['auto', 'Automatic'], ['page-width', 'Fit width'], ['page-fit', 'Fit page'],
  ['0.5', '50%'], ['0.75', '75%'], ['1', '100%'], ['1.25', '125%'], ['1.5', '150%'], ['2', '200%'], ['3', '300%']]

export type Scale = { value: string; percent: number }

/** Zoom and scroll by memory name, kept while the app runs. */
export const places = new Map<string, { scale: string; top: number; left: number }>()
