export function LoginStep({ n, title, text }: { n: number; title: string; text: string }) {
  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <span className="w-5 shrink-0 text-center text-xl font-semibold text-dim">{n}</span>
      <div className="min-w-0">
        <div>{title}</div>
        <div className="text-sm text-dim">{text}</div>
      </div>
    </div>
  )
}
