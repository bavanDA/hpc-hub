import { useCallback, useEffect, useState } from 'react'

import { call } from '../../../rpc'
import type { JobSize, SizeAdvice } from '../../../types/jobs'
import type { OpenFile } from '../store'

/** What earlier runs of the open job script used, asked again when the script opens or is saved, and after a fix.
 * Only advice: Submit works either way. A job with no earlier runs says nothing here. */
export function useJobSize(file: OpenFile | null, on: boolean) {
  const [got, setGot] = useState<{ key: string; advice: SizeAdvice[] }>({ key: '', advice: [] })
  const check = useCallback((text: string) => {
    if (!file) return
    const key = file.key
    call<JobSize>('jobs.size', { cluster: file.cluster, path: file.path, text })
      .then((r) => setGot({ key, advice: r.advice.filter((a) => a.kind !== 'new') }))
      .catch(() => setGot({ key, advice: [] }))  // a hint, never in the way
  }, [file?.key])  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (on && file && !file.loading && !file.error) check(file.text)
  }, [on, file?.key, file?.saved, file?.loading])  // eslint-disable-line react-hooks/exhaustive-deps
  return { advice: on && got.key === file?.key ? got.advice : [], check }
}
