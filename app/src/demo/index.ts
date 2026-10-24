// Made-up answers for opening the UI in a plain browser (npm run dev, no Tauri): for design work and screenshots.
// Every file in this folder exports `answers` (method name -> result); they are all picked up here.
const modules = import.meta.glob<{ answers: Record<string, unknown> }>('./*.ts', { eager: true })
const answers: Record<string, unknown> = Object.assign({}, ...Object.values(modules).map((m) => m.answers ?? {}))

export async function demoCall<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  const a = answers[method]
  if (a === undefined) throw new Error(`${method} has no demo answer`)
  return (typeof a === 'function' ? a(params) : a) as T
}
