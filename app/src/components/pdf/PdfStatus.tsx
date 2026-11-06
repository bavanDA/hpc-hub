import type { ReactNode } from 'react'

import { Spinner } from '../ui'

/** In place of the pages: the caller's message, the error, or a spinner with the download's progress. */
export function PdfStatus({ message, failed, loading, progress }:
  { message?: ReactNode; failed: string; loading?: boolean; progress?: number }) {
  return (
    <div className="absolute inset-0 grid place-items-center p-6 text-center">
      {message ?? (failed ? <p className="text-sm text-bad">Could not open the PDF: {failed}</p>
        : <div className="flex flex-col items-center gap-3 text-sm text-dim">
            <Spinner size={24} />
            {loading && progress !== undefined && progress > 0 && progress < 1 &&
              <span className="tabular-nums">{Math.round(progress * 100)}%</span>}
          </div>)}
    </div>
  )
}
