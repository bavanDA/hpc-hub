import { useState } from 'react'

import { call } from '../../../rpc'
import type { Cluster, Profile } from '../../../types/clusters'
import { ASK } from '../../clusters/ComputeDialog'
import { copy, shortName } from '../../clusters/loginCopy'
import { NodeFields } from '../../clusters/node/NodeFields'
import { List } from '../../e/List'
import { MainButton } from '../../e/MainButton'
import { Section } from '../../e/Section'
import { ToggleRow } from '../../e/ToggleRow'
import { Footer } from './Footer'
import { Heading } from './Heading'

export function NodeStep({ cluster: c, onNext, last }: { cluster: Cluster; onNext: () => void; last: boolean }) {
  const [want, setWant] = useState(c.request_node_on_connect ?? true)
  const [ask, setAsk] = useState(c.ask_node ?? false)
  const [p, setP] = useState<Profile>(c.profile)
  const [ok, setOk] = useState(true)
  const [error, setError] = useState('')

  async function save() {
    try {
      await call('clusters.update', { cluster: c.id, changes: { request_node_on_connect: want, ask_node: ask,
        profile: { cpus: p.cpus, mem_gb: p.mem_gb, gpus: p.gpus ?? 0, gpu_type: p.gpu_type ?? '', time: p.time,
          partition: p.partition, account: p.account ?? '', qos: p.qos ?? '' } } })
      onNext()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); save() }}>
      <Heading title={`Compute node on ${shortName(c)}`}
        text="Your terminals and agents run on a compute node, not the busy login node." />
      <div>
        <List>
          <ToggleRow label="Get a compute node when I connect" checked={want} onChange={setWant}
            sub={want ? 'Ready as soon as you sign in.' : 'You can still get one from the cluster card.'} />
        </List>
        {want && <div className="pt-5">
          <NodeFields cluster={c.id} value={p} onChange={setP} onValid={setOk} extra={false} /></div>}
        {want ? <Section note="You can change this later in Settings.">
          <ToggleRow label={ASK} sub="Shows the node window when you connect." checked={ask} onChange={setAsk} />
        </Section> : <p className="px-5 pt-2 text-sm text-dim">You can change this later in Settings.</p>}
      </div>
      {error && <p role="alert" className="px-5 font-semibold text-bad">{error}</p>}
      <Footer>
        <MainButton type="submit" disabled={want && !ok}>{last ? 'Done' : copy.continue}</MainButton>
      </Footer>
    </form>
  )
}
