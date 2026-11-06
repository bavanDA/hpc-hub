import type { Clip, Sort } from '../../types/files'

/** Kept while you visit other pages: where you were, what you copied, how you sort. */
export const memory = { cluster: '', paths: {} as Record<string, string>, clip: null as Clip | null,
  sort: { key: 'name', desc: false } as Sort, preview: true }
