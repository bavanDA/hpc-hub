import { lazy, Suspense } from 'react'

import { Tabs, type TabItem } from '../components/app/Tabs'
import { Transfers } from '../components/files/Transfers'
import { useTransfers } from '../components/files/useTransfers'
import { Spinner } from '../components/ui'
import { useGo, usePageParams } from '../nav'
import { Files } from './Files'

const Globus = lazy(() => import('./Globus').then((m) => ({ default: m.Globus })))

export type FilesTab = 'browse' | 'transfers'
const TABS: TabItem<FilesTab>[] = [{ id: 'browse', title: 'Browse' }, { id: 'transfers', title: 'Transfers' }]

export const filesTab = (asked: string | undefined): FilesTab => (asked === 'transfers' ? 'transfers' : 'browse')

/** Copies that went through this laptop; Globus copies are in Globus's own list below. */
function LaptopCopies() {
  const transfers = useTransfers(() => {})
  const items = transfers.items.filter((t) => t.how !== 'globus')
  if (!items.length) return null
  return (
    <section className="px-4 pt-4">
      <h2 className="mb-1.5 text-xs font-semibold tracking-wide text-dim uppercase">Through this laptop</h2>
      <Transfers items={items} onX={transfers.x} />
    </section>
  )
}

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
