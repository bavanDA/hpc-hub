export function PanelHead({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex h-12 shrink-0 items-center gap-1 pr-2 pl-4">
      <h2 className="flex-1 font-semibold">{title}</h2>
      {children}
    </div>
  )
}
