import { BookOpen, File, FileText, Folder, FolderOpen, Image } from 'lucide-react'

import { ext, IMAGE_EXT } from '../bits'
import type { Node } from './tree'

export function FileIcon({ node, open }: { node: Node; open: boolean }) {
  const x = ext(node.name)
  const I = node.dir ? (open ? FolderOpen : Folder) : x === '.tex' ? FileText : x === '.bib' ? BookOpen
    : IMAGE_EXT.includes(x) || x === '.pdf' || x === '.eps' ? Image : File
  return <I size={16} className="shrink-0 text-dim" />
}
