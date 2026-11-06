import { Tex } from '../diff/Tex'

export function CodeLine({ n, t, changed }: { n: number; t: string; changed?: boolean }) {
  return (
    <div className={`flex ${changed ? 'diff-add' : ''}`}>
      <span className="w-11 shrink-0 pr-3 text-right text-faint select-none">{n}</span>
      <span className="min-w-0 flex-1 pr-3 break-words whitespace-pre-wrap"><Tex text={t} /></span>
    </div>
  )
}
