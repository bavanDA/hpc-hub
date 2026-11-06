import { FileQuestion } from 'lucide-react'

import type { FileData } from '../../../types/files'
import { Note } from './Note'

export function Content({ data }: { data: FileData }) {
  if (data.kind === 'image') {
    return (
      <div className="grid h-full place-items-center p-4"
        style={{ backgroundImage: 'repeating-conic-gradient(var(--color-pill) 0 25%, transparent 0 50%)',
          backgroundSize: '16px 16px' }}>
        <img src={`data:${data.mime};base64,${data.data}`} alt="" className="max-h-full max-w-full object-contain" />
      </div>
    )
  }
  if (data.kind === 'binary') return <Note icon={FileQuestion} title="Binary file" text="Nothing to show as text." />
  return (
    <pre className="h-full overflow-auto whitespace-pre-wrap bg-view p-3 font-mono text-xs leading-[18px]
      select-text [overflow-wrap:anywhere]">
      {data.text}{data.cut && <span className="text-dim">{'\n'}… first 512 kB only</span>}
    </pre>
  )
}
