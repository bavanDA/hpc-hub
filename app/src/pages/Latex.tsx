// CodeMirror and pdf.js load with the page on its first visit, out of the main bundle.
import { lazy, Suspense } from 'react'

import { Spinner } from '../components/ui/Spinner'

const Page = lazy(() => import('../components/latex/Page'))

export function Latex() {
  return (
    <Suspense fallback={<div className="grid h-full place-items-center"><Spinner size={24} /></div>}>
      <Page />
    </Suspense>
  )
}
