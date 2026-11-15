import type { Held, Sort } from '../../types/files'

/** Kept while you visit other pages: where you were, what you copied, how you sort. */
export const memory = { cluster: '', paths: {} as Record<string, string>, held: null as Held | null,
  sort: { key: 'name', desc: false } as Sort, preview: true }
