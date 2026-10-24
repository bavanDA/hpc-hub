// A colored icon per kind of file, like GNOME Files' list view.
import { File, FileArchive, FileCode, FileImage, FileSpreadsheet, FileText, FileType, Folder,
  type LucideIcon } from 'lucide-react'

import type { Entry } from '../../types/files'
import { kind, type Kind } from './format'

const ICONS: Record<Kind, [LucideIcon, string]> = {
  folder: [Folder, 'text-accent'],
  text: [FileText, 'text-dim'],
  code: [FileCode, 'text-[#9141ac] dark:text-[#c061cb]'],
  image: [FileImage, 'text-[#c64600] dark:text-[#ffa348]'],
  pdf: [FileType, 'text-[#c01c28] dark:text-[#ff7b63]'],
  archive: [FileArchive, 'text-[#986a44] dark:text-[#cdab8f]'],
  data: [FileSpreadsheet, 'text-[#26a269] dark:text-[#8ff0a4]'],
  other: [File, 'text-dim'],
}

export function FileIcon({ entry, size = 20 }: { entry: Entry; size?: number }) {
  const k = kind(entry)
  const [Icon, color] = ICONS[k]
  return <Icon size={size} strokeWidth={1.75} className={`shrink-0 ${color}`}
    fill={k === 'folder' ? 'currentColor' : 'none'} fillOpacity={k === 'folder' ? 0.22 : 0} />
}
