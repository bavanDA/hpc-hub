// Code: a light editor for files on the cluster, made to work with the agents (docs/design/code.md). Phase 0 holds
// the page's place; the editor (components/code) and the desktop shell (components/code/desktop) come next.
import { FileCode2 } from 'lucide-react'

import { EmptyState } from '../components/ui'

export function Code() {
  return <EmptyState icon={FileCode2} title="Code is on its way"
    text="Open and edit files on your cluster here, and ask an agent about them." />
}
