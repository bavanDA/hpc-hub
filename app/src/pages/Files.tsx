import { FolderOpen } from 'lucide-react'

import { EmptyState } from '../components/ui'

export function Files() {
  return <EmptyState icon={FolderOpen} title="Files" text="Coming soon. The GTK app has it today." />
}
