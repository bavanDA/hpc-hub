import { File, FileArchive, FileCode, FileImage, FileSpreadsheet, FileText, FileType, Folder,
  type LucideIcon } from 'lucide-react'

import type { Entry } from '../../types/files'
import { kind, type Kind } from './format'

const ICONS: Record<Kind, [LucideIcon, string]> = {
  folder: [Folder, 'text-dim'],
  text: [FileText, 'text-dim'],
  code: [FileCode, 'text-dim'],
  image: [FileImage, 'text-dim'],
  pdf: [FileType, 'text-dim'],
  archive: [FileArchive, 'text-dim'],
  data: [FileSpreadsheet, 'text-dim'],
  other: [File, 'text-dim'],
}

export function FileIcon({ entry, size = 20 }: { entry: Entry; size?: number }) {
  const k = kind(entry)
  const [Icon, color] = ICONS[k]
  return <Icon size={size} strokeWidth={1.75} className={`shrink-0 ${color}`}
    fill={k === 'folder' ? 'currentColor' : 'none'} fillOpacity={k === 'folder' ? 0.22 : 0} />
}
