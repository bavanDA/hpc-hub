// Code: a light editor for files on the cluster, made to work with the agents (docs/design/code.md).
import { FileCode2 } from 'lucide-react'

import { Placeholder } from '../parts/Placeholder'

export function Code() {
  return <Placeholder title="Code" icon={FileCode2}
    text="Open and edit files on your cluster here, and ask an agent to explain or fix them." />
}
