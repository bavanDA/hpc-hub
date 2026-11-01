// Skills (experimental): what Claude, ChatGPT and the other agents know on each cluster. Add HPC Hub's own skills,
// any from a git repository, and remove the ones you added. Spec: hpc_hub/agents/ui/skills_page.py.
import { CircleAlert, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { useActiveCluster } from '../components/clusters/active'
import { NotConnected } from '../components/clusters/NotConnected'
import { Group } from '../components/permissions/controls'
import { AddSkillsDialog } from '../components/skills/AddSkillsDialog'
import { AddTo } from '../components/skills/AddTo'
import { BuiltIn, SkillRow } from '../components/skills/parts'
import { useToast } from '../components/toast'
import { Button, Dialog, EmptyState, IconButton, Spinner } from '../components/ui'
import { useEvent } from '../hooks'
import { call } from '../rpc'
import type { Session } from '../types'
import type { Skill, SkillList } from '../types/skills'

export function Skills() {
  const toast = useToast()
  const { cluster: active, session, connected } = useActiveCluster()
  const cluster = active?.id ?? ''
  const [list, setList] = useState<SkillList | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState('')  // the catalog skill being added
  const [dialog, setDialog] = useState(false)
  const [removing, setRemoving] = useState<Skill | null>(null)

  useEffect(() => { setList(null); setError('') }, [cluster])  // another cluster picked

  const load = useCallback(() => {
    if (!cluster || !connected) return
    setLoading(true)
    call<SkillList>('skills.list', { cluster })
      .then((l) => { setList(l); setError('') })
      .catch((e: Error) => { setList(null); setError(e.message) })
      .finally(() => setLoading(false))
  }, [cluster, connected])
  useEffect(load, [load])
  useEvent<Session>('session', (s) => { if (s.id === cluster && s.state === 'Connected' && !list) load() })
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
  else if (error || !list) body = <div className="h-[60vh]"><EmptyState icon={CircleAlert}
    title="Could not read skills" text={error} /></div>
  else body = (
    <div className="flex flex-col gap-6">
      <Group title="HPC Hub skills" description="Ready to use. Add them to your favourite agents.">
        {list.catalog.map((k) => (
          <SkillRow key={k.folder} name={k.name} description={k.on.length
            ? <><span className="font-semibold text-ok">In {k.on.map(label).join(', ')}</span> · {k.description}</>
            : k.description}
            suffix={<AddTo name={k.name} targets={list.targets} has={k.on} busy={adding === k.folder}
              onAdd={(t) => addOwn(k.folder, k.name, t)} />} />
        ))}
      </Group>
      {list.targets.map((t) => {
        const mine = list.installed.filter((k) => k.target === t.id && !k.managed)
        const builtIn = list.installed.filter((k) => k.target === t.id && k.managed)
        return (
          <Group key={t.id} title={`${t.label} skills`} description={`${t.folder} on ${list.name}`}>
            {mine.map((k) => <SkillRow key={k.path} name={k.name} description={k.description} path={k.path}
              suffix={<IconButton icon={Trash2} label={`Remove ${k.name}`} size={16}
                onClick={() => setRemoving(k)} />} />)}
            {!mine.length && <SkillRow name="None added yet" description="Press Add skills." />}
            {!!builtIn.length && <BuiltIn label={t.label} skills={builtIn} />}
          </Group>
        )
      })}
    </div>
  )

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-5 px-4 py-6">
      {connected && <div className="flex items-center gap-2">
        <span className="flex-1" />
        {loading && list && <Spinner />}
        <IconButton icon={RefreshCw} label="Refresh" size={16} onClick={load} />
        <Button kind="suggested" disabled={!list} onClick={() => setDialog(true)}><Plus size={16} />Add skills</Button>
      </div>}
      {body}
      {dialog && list && <AddSkillsDialog cluster={cluster} name={list.name} targets={list.targets}
        repo={list.default_repo} onClose={() => setDialog(false)} onDone={load} />}
      {removing && (
        <Dialog title={`Remove ${removing.name}?`} onClose={() => setRemoving(null)} width={420}
          actions={<>
            <Button onClick={() => setRemoving(null)}>Cancel</Button>
            <Button kind="destructive" onClick={() => remove(removing)}>Remove</Button>
          </>}>
          <p className="text-dim">{label(removing.target)} no longer has it on {list?.name}. Its folder is deleted.</p>
        </Dialog>
      )}
    </div>
  )
}
