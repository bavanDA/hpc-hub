export type Where = { cluster: string; folder: string }

export const lastLine = (s: string) => s.trim().split('\n').pop() ?? s
