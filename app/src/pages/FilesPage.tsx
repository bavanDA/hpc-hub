import { lazy, Suspense } from 'react'

import { Tabs, type TabItem } from '../components/app/Tabs'
import { LaptopCopies } from '../components/files/LaptopCopies'
import { Spinner } from '../components/ui/Spinner'
import { useGo, usePageParams } from '../nav'
import { Files } from './Files'

const Globus = lazy(() => import('./Globus').then((m) => ({ default: m.Globus })))

type FilesTab = 'browse' | 'transfers'
const TABS: TabItem<FilesTab>[] = [{ id: 'browse', title: 'Browse' }, { id: 'transfers', title: 'Transfers' }]

const filesTab = (asked: string | undefined): FilesTab => (asked === 'transfers' ? 'transfers' : 'browse')

export function FilesPage() {
  const go = useGo()
  const params = usePageParams()
  const tab = filesTab(params.tab)
  return (
    <div className="flex h-full flex-col">
      <Tabs label="Files" tabs={TABS} current={tab} onPick={(t) => go('files', { tab: t })} />
      <div className="min-h-0 flex-1 overflow-auto">
        {tab === 'browse' ? <Files /> : (
          <div className="flex min-h-full flex-col">
            <LaptopCopies />
            <div className="min-h-0 flex-1">
              <Suspense fallback={<div className="grid h-64 place-items-center"><Spinner size={24} /></div>}>
                <Globus />
              </Suspense>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
