export function stored(key: string, fallback: string) {
  try { return localStorage.getItem(key) ?? fallback } catch { return fallback }
}

export function store(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* private window */ }
}
