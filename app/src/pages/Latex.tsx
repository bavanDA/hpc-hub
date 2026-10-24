// LaTeX papers on the clusters, like Overleaf: pick a project, then edit, build on the cluster and read the PDF.
// Experimental. Spec: hpc_hub/latex/ui/. Open with go('latex', { cluster, path }) for a .tex file or a folder.
// The page, CodeMirror and pdf.js load on the first visit, so they stay out of the main bundle.
import { lazy, Suspense } from 'react'

import { Spinner } from '../components/ui'

const Page = lazy(() => import('../components/latex/Page'))

export function Latex() {
  return (
    <Suspense fallback={<div className="grid h-full place-items-center"><Spinner size={24} /></div>}>
      <Page />
    </Suspense>
  )
}
