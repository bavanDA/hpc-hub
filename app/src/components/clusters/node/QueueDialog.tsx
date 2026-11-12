import { createContext } from 'react'

import type { Limits, Profile } from '../../../types/clusters'
import { EDialog } from '../../e/EDialog'
import { Field } from '../../e/Field'
import { MainButton } from '../../e/MainButton'
import { QueuePickers } from '../QueuePickers'

export function QueueDialog({ cluster, limits, value: p, onChange, onClose, extra, only, hide }: {
  cluster: string; limits: Limits | null; value: Profile; onChange: (p: Profile) => void; onClose: () => void; extra: boolean
  only?: string[]
  hide?: string[]
}) {
  const set = (change: Partial<Profile>) => onChange({ ...p, ...change })
  return (
    <EDialog title="Queue and priority" width={440} onClose={onClose}
      actions={<MainButton onClick={onClose}>Done</MainButton>}>
      <QueuePickers cluster={cluster} limits={limits} queue={p.partition} qos={p.qos ?? ''} onQueue={(partition) => set({ partition })}
        only={only} hide={hide}
        onQos={(qos) => set({ qos })} account={p.account ?? ''} onAccount={(account) => set({ account })} />
      <div className="px-5 pt-3">
        {extra && <Field label="Extra options" value={p.extra_args ?? ''} placeholder="--constraint=intel"
          onChange={(e) => set({ extra_args: e.target.value })} />}
      </div>
    </EDialog>
  )
}

/** The window NodeFields opens for the queue: the phone gives its own, which answers Android's Back. */
export const QueueWindow = createContext(QueueDialog)
