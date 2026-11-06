import type { NotePlace } from '../../../../types/history'

export const isLine = (p: NotePlace | null): p is { path: string; line: number } => !!p && 'path' in p
export const isPage = (p: NotePlace | null): p is { page: number; x: number; y: number } => !!p && 'page' in p
