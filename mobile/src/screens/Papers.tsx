// Papers (experimental): LaTeX next to your code. The list of papers, or one open paper (parts/papers).
// go('latex', {cluster, path}) opens a paper straight away.
import { FileX } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { Spinner } from '@shared/components/ui/Spinner'
import { useCall, useEvent } from '@shared/hooks'
import { usePageParams } from '@shared/nav'
import { call } from '@shared/rpc'
import type { Choices, Opened, Picker } from '@shared/types/latex'
import { Header } from '../parts/Header'
import { Paper } from '../parts/papers/Paper'
import { PaperList } from '../parts/papers/PaperList'
import { Button, EmptyState, PickDialog, useToast } from '../ui'

// The open paper stays open while you visit other screens
const memory = { opened: null as Opened | null, asked: '' }

export function Papers() {
  const toast = useToast()
  const params = usePageParams()
  const picker = useCall<Picker>('latex.picker')
  const [opened, setOpenedState] = useState<Opened | null>(memory.opened)
  const [opening, setOpening] = useState(false)
  const [choices, setChoices] = useState<(Choices & { cluster: string }) | null>(null)
  const setOpened = (o: Opened | null) => { memory.opened = o; setOpenedState(o) }
  const { reload } = picker
  useEvent('session', reload)

  const open = useCallback((cluster: string, path: string, main = '') => {
    setOpening(true)
    call<Opened | Choices>('latex.open', { cluster, path, main })
      .then((r) => 'choices' in r ? setChoices({ ...r, cluster }) : setOpened(r))
      .catch((e: Error) => toast(e.message))
      .finally(() => setOpening(false))
  }, [toast])

  useEffect(() => {  // opened from Projects or Files with a path
    const key = params.cluster && params.path ? `${params.cluster}:${params.path}` : ''
    if (key && key !== memory.asked) { memory.asked = key; open(params.cluster, params.path) }
  }, [params, open])

  if (opened) {
    return <Paper key={`${opened.cluster}:${opened.folder}:${opened.main}`} paper={opened}
      onClose={() => { setOpened(null); reload() }} />
  }
  const data = picker.data
  return (
    <div className="flex h-full flex-col">
      <Header title="Papers" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {picker.error && !data && <EmptyState icon={FileX} title="Could not load your papers" text={picker.error}
          action={<Button onClick={reload}>Try again</Button>} />}
        {!data && !picker.error && <div className="grid h-40 place-items-center"><Spinner size={24} /></div>}
        {data && <PaperList data={data} onOpen={open} onReload={reload} />}
      </div>
      {opening && <div className="fixed inset-0 z-30 grid place-items-center bg-scrim"><Spinner size={24} /></div>}
      {choices && <PickDialog title="Which file builds the PDF?" onClose={() => setChoices(null)}
        onPick={(c) => open(choices.cluster, choices.folder, c)}
        options={choices.choices.map((c) => ({ value: c, label: c }))} />}
    </div>
  )
}
