// More › Papers (experimental): LaTeX next to your code, with the PDF and the build log.
import { FileText } from 'lucide-react'

import { Placeholder } from '../parts/Placeholder'

export function Papers() {
  return <Placeholder title="Papers" icon={FileText}
    text="Edit a LaTeX paper on the cluster, build it, and read the PDF." />
}
