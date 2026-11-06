export function remembered<T extends string>(key: string, fallback: T): T {
  try { return (localStorage.getItem(key) as T) || fallback } catch { return fallback }
}

export function remember(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* private window */ }
}
