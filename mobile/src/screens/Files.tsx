// Files: Browse (the file manager) and Transfers, as tabs like the desktop. go('files', { tab: 'transfers' }) opens the
// second; each keeps its own screen for now.
import { lazy, Suspense } from 'react'

import { Spinner } from '@shared/components/ui/Spinner'
import { usePageParams } from '@shared/nav'
import { usePhoneNav } from '../nav'
import { Tabs } from '../ui'

const FilesManager = lazy(() => import('./FilesManager').then((m) => ({ default: m.FilesManager })))
const Transfers = lazy(() => import('./Transfers').then((m) => ({ default: m.Transfers })))

export function Files() {
  const params = usePageParams()
  const { go } = usePhoneNav()
  const tab = params.tab === 'transfers' ? 'transfers' : 'browse'
  const tabs = <Tabs label="Files" current={tab} onPick={(t) => go('files', t === 'transfers' ? { tab: t } : {})}
    tabs={[{ id: 'browse', title: 'Browse' }, { id: 'transfers', title: 'Transfers' }]} />
  return (
    <Suspense fallback={<div className="grid h-full place-items-center"><Spinner size={28} /></div>}>
      {tab === 'browse' ? <FilesManager tabs={tabs} /> : <Transfers tabs={tabs} />}
    </Suspense>
  )
}
