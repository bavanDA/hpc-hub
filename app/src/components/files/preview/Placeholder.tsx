import { FileQuestion, FileType, ImageOff } from 'lucide-react'

import type { Entry } from '../../../types/files'
import { Button } from '../../ui/Button'
import { kind } from '../format'
import { Note } from './Note'

export function Placeholder({ entry, onOpen }: { entry: Entry; onOpen: () => void }) {
  const k = kind(entry)
  if (k === 'pdf') {
    return <Note icon={FileType} title="Big PDF" text="Too big to preview here. Open it to read it."
      action={<Button kind="primary" onClick={onOpen}>Open</Button>} />
  }
  if (k === 'image') return <Note icon={ImageOff} title="Too big to preview" text="Open it to see it." />
  return <Note icon={FileQuestion} title="No preview" text="No preview for this type of file." />
}
