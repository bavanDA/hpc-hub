import type { Cluster, VsCode } from '../../../types/clusters'
import { Field } from '../../e/Field'
import { Section } from '../../e/Section'
import { Segments } from '../../e/Segments'
import { ToggleRow } from '../../e/ToggleRow'
import { ASK_VS, ASK_VS_SUB } from '../../tools/vscodeWords'
import { NodeFields } from '../node/NodeFields'

const TARGETS = [['desktop', 'VS Code app'], ['browser', 'Browser']] as const

export function VsCodePart({ d, up }: { d: Cluster; up: (change: Partial<Cluster>) => void }) {
  const vs = d.vscode
  if (!vs) return <p className="px-5 text-dim">No VS Code settings here.</p>
  const upVs = (change: Partial<VsCode>) => up({ vscode: { ...vs, ...change } })
  return <>
    <div className="px-5">
      <Field label="Runs first" value={vs.setup} placeholder="module load VSCode"
        onChange={(e) => upVs({ setup: e.target.value })} />
      <Field label="Command" value={vs.command} onChange={(e) => upVs({ command: e.target.value })} />
      <Field label="Folder it opens" value={vs.workdir === '~' ? '' : vs.workdir} placeholder="Home folder"
        onChange={(e) => upVs({ workdir: e.target.value || '~' })} />
      <div className="py-1.5">
        <p className="mb-1.5 text-sm text-dim">Open in</p>
        <Segments label="Open in" value={vs.open_in} options={TARGETS} onChange={(open_in) => upVs({ open_in })} />
      </div>
    </div>
    <Section>
      <ToggleRow label="Open automatically" sub="When the tunnel is ready, and the GitHub sign-in page."
        checked={vs.open_links} onChange={(open_links) => upVs({ open_links })} />
      <ToggleRow label={ASK_VS} sub={ASK_VS_SUB} checked={vs.ask ?? true} onChange={(ask) => upVs({ ask })} />
    </Section>
    <h3 className="px-5 pt-5 pb-1.5 text-xs font-semibold tracking-wide text-dim uppercase">Its own node</h3>
    <NodeFields cluster={d.id} value={vs.compute} onChange={(compute) => upVs({ compute })} />
  </>
}
