// Agents › Skills (experimental): what Claude, ChatGPT and the others know on the cluster picked in the header. Add
// HPC Hub's own skills, any from a git repository, and remove the ones you added. The desktop's page.
import { CircleAlert, GitBranch, RefreshCw } from 'lucide-react'
import { useState } from 'react'

import { useActiveCluster } from '@shared/components/clusters/active'
import { shortName } from '@shared/components/clusters/loginCopy'
import { NotConnected } from '@shared/components/clusters/NotConnected'
import { AddSkillsDialog } from '@shared/components/skills/AddSkillsDialog'
import { AddToDialog } from '@shared/components/skills/AddTo'
import { SkillSections } from '@shared/components/skills/SkillSections'
import { useSkills } from '@shared/components/skills/useSkills'
import { Spinner } from '@shared/components/ui/Spinner'
import { call } from '@shared/rpc'
import type { CatalogSkill, Skill } from '@shared/types/skills'
import { BackLayer, Button, ConfirmDialog, EmptyState, IconBtn, PageBar, useToast } from '../../ui'

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
    call('skills.remove', { cluster, path: k.path, target: k.target })
      .then(() => { toast(`Removed ${k.name}`); load() })
      .catch((e: Error) => toast(`Could not remove ${k.name}: ${e.message}`))
  }

  let body
  if (active && (!connected || error.startsWith('Connect to'))) body = <div className="h-[60vh]"><NotConnected
    cluster={active} session={session} what="skills" /></div>
  else if ((!cluster && !error) || (!list && !error)) body = <div className="grid h-64 place-items-center"><Spinner size={24} /></div>
  else if (error || !list) body = <EmptyState icon={CircleAlert} title="Could not read the skills" text={error} report />
  else body = <SkillSections list={list} adding={adding} label={label} onAdd={setChoosing} onRemove={setRemoving} />

  return (
    <>
      <PageBar>
        <span className="flex-1" />
        {connected && <>
          {loading && list && <Spinner />}
          <IconBtn icon={RefreshCw} label="Refresh" onClick={load} />
          <Button kind="primary" icon={GitBranch} disabled={!list} onClick={() => setDialog(true)}>Add skills from git</Button>
        </>}
      </PageBar>
      <div className="min-h-0 flex-1 overflow-y-auto pb-6">{body}</div>
      {choosing && list && (
        <BackLayer onBack={() => setChoosing(null)}>
          <AddToDialog skill={choosing} targets={list.targets} onClose={() => setChoosing(null)}
            onAdd={(t) => addOwn(choosing.folder, choosing.name, t)} />
        </BackLayer>
      )}
      {dialog && list && (
        <BackLayer onBack={() => setDialog(false)}>
          <AddSkillsDialog cluster={cluster} name={shortName(list)} targets={list.targets} repo={list.default_repo}
            onClose={() => setDialog(false)} onDone={load} />
        </BackLayer>
      )}
      {removing && (
        <ConfirmDialog title={`Remove ${removing.name}?`} danger keep="Keep it" confirm="Remove"
          text={`${label(removing.target)} no longer has it on ${list ? shortName(list) : ''}. Its folder is deleted.`}
          onClose={() => setRemoving(null)} onConfirm={() => remove(removing)} />
      )}
    </>
  )
}
