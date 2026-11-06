import { FileX } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { useCall, useEvent } from '../../hooks'
import { usePageParams } from '../../nav'
import { call } from '../../rpc'
import type { Choices, Opened, Picker as PickerData } from '../../types/latex'
import { Button, Dialog, EmptyState, Spinner } from '../ui'
import { useToast } from '../useToast'
import { Picker } from './picker/Picker'
import { Project } from './Project'

// The open project stays open while you visit other pages
const memory = { opened: null as Opened | null, asked: '' }

export default function LatexPage() {
  const toast = useToast()
  const params = usePageParams()
  const picker = useCall<PickerData>('latex.picker')
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

  useEffect(() => {  // opened from another page with a path
    const key = params.cluster && params.path ? `${params.cluster}:${params.path}` : ''
    if (key && key !== memory.asked) { memory.asked = key; open(params.cluster, params.path) }
  }, [params, open])

  if (opened) {
    return <Project key={`${opened.cluster}:${opened.folder}:${opened.main}`} project={opened}
      onClose={() => { setOpened(null); reload() }} />
  }
  if (picker.error && !picker.data) {
    return <EmptyState icon={FileX} title="Could not load your papers" text={picker.error}
      action={<Button onClick={reload}>Try again</Button>} />
  }
  if (!picker.data) return <div className="grid h-full place-items-center"><Spinner size={24} /></div>
  return (
    <>
      <Picker data={picker.data} onOpen={open} onReload={reload} />
      {opening && <div className="fixed inset-0 z-30 grid place-items-center bg-black/10"><Spinner size={24} /></div>}
      {choices && (
        <Dialog title="Which file builds the PDF?" onClose={() => setChoices(null)} width={420}>
          <div className="flex flex-col gap-1 pb-2">
            <p className="mb-2 text-center text-sm text-dim">More than one .tex file in {choices.folder} has
              \documentclass.</p>
            {choices.choices.map((c) => (
              <Button key={c} kind="flat" className="justify-start font-mono font-normal"
                onClick={() => { setChoices(null); open(choices.cluster, choices.folder, c) }}>{c}</Button>
            ))}
          </div>
        </Dialog>
      )}
    </>
  )
}
