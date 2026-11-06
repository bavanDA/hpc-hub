import { CircleAlert, GitBranch, RefreshCw } from 'lucide-react'
import { useState } from 'react'

import { useActiveCluster } from '../components/clusters/active'
import { shortName } from '../components/clusters/loginCopy'
import { NotConnected } from '../components/clusters/NotConnected'
import { Confirm, EButton, EmptyState, EPage, IconBtn } from '../components/e/extra'
import { AddSkillsDialog } from '../components/skills/AddSkillsDialog'
import { AddToDialog } from '../components/skills/AddTo'
import { SkillSections } from '../components/skills/SkillSections'
import { useSkills } from '../components/skills/useSkills'
import { useToast } from '../components/useToast'
import { Spinner } from '../components/ui'
import { call } from '../rpc'
import type { CatalogSkill, Skill } from '../types/skills'

export function Skills() {
  const toast = useToast()
  const { cluster: active, session, connected } = useActiveCluster()
  const cluster = active?.id ?? ''
  const { list, error, loading, load } = useSkills(cluster, connected)
  const [adding, setAdding] = useState('')  // the catalog skill being added
  const [choosing, setChoosing] = useState<CatalogSkill | null>(null)
  const [dialog, setDialog] = useState(false)
  const [removing, setRemoving] = useState<Skill | null>(null)
  const label = (id: string) => list?.targets.find((t) => t.id === id)?.label ?? id

  const addOwn = (folder: string, skill: string, targets: string[]) => {
    setAdding(folder)
    call('skills.add', { cluster, folder, targets })
      .then(() => { toast(`Added ${skill} to ${targets.map(label).join(', ')}`); load() })
      .catch((e: Error) => toast(`Could not add ${skill}: ${e.message}`))
      .finally(() => setAdding(''))
  }
  const remove = (k: Skill) => {
    setRemoving(null)
    call('skills.remove', { cluster, path: k.path, target: k.target })
      .then(() => { toast(`Removed ${k.name}`); load() })
      .catch((e: Error) => toast(`Could not remove ${k.name}: ${e.message}`))
  }

  let body
  if (active && (!connected || error.startsWith('Connect to'))) body = <div className="h-[60vh]"><NotConnected
    cluster={active} session={session} what="skills" /></div>
  else if ((!cluster && !error) || (!list && !error)) body = <div className="grid h-64 place-items-center"><Spinner size={24} /></div>
  else if (error || !list) body = <EmptyState icon={CircleAlert} title="Could not read the skills" text={error} />
  else body = <SkillSections list={list} adding={adding} label={label} onAdd={setChoosing} onRemove={setRemoving} />

  return (
    <EPage actions={connected && <>
      {loading && list && <Spinner />}
      <IconBtn icon={RefreshCw} label="Refresh" onClick={load} />
      <EButton kind="primary" icon={GitBranch} disabled={!list} onClick={() => setDialog(true)}>
        Add skills from git</EButton>
    </>}>
      <div className="-mt-5">{body}</div>
      {choosing && list && <AddToDialog skill={choosing} targets={list.targets} onClose={() => setChoosing(null)}
        onAdd={(t) => addOwn(choosing.folder, choosing.name, t)} />}
      {dialog && list && <AddSkillsDialog cluster={cluster} name={shortName(list)} targets={list.targets}
        repo={list.default_repo} onClose={() => setDialog(false)} onDone={load} />}
      {removing && (
        <Confirm title={`Remove ${removing.name}?`} keep="Keep it" act="Remove" onClose={() => setRemoving(null)}
          onAct={() => remove(removing)}>
          <p>{label(removing.target)} no longer has it on {list ? shortName(list) : ''}. Its folder is deleted.</p>
        </Confirm>
      )}
    </EPage>
  )
}
