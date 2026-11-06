import type { Limits, Profile } from '../../../types/clusters'
import { EDialog, Field, MainButton } from '../../e/ui'
import { QueuePickers } from '../QueuePickers'

export function QueueDialog({ limits, value: p, onChange, onClose, extra, only }: {
  limits: Limits | null; value: Profile; onChange: (p: Profile) => void; onClose: () => void; extra: boolean
  only?: string[]
}) {
  const set = (change: Partial<Profile>) => onChange({ ...p, ...change })
  return (
    <EDialog title="Queue and priority" width={440} onClose={onClose}
      actions={<MainButton onClick={onClose}>Done</MainButton>}>
      <QueuePickers limits={limits} queue={p.partition} qos={p.qos ?? ''} onQueue={(partition) => set({ partition })}
        only={only}
        onQos={(qos) => set({ qos })} account={p.account ?? ''} onAccount={(account) => set({ account })} />
      <div className="px-5 pt-3">
        {extra && <Field label="Extra options" value={p.extra_args ?? ''} placeholder="--constraint=intel"
          onChange={(e) => set({ extra_args: e.target.value })} />}
      </div>
    </EDialog>
  )
}
