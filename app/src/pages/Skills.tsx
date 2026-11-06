import { CircleAlert, GitBranch, Plus, RefreshCw, Sparkles, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { useActiveCluster } from '../components/clusters/active'
import { shortName } from '../components/clusters/loginCopy'
import { NotConnected } from '../components/clusters/NotConnected'
import { Confirm, EButton, EmptyState, EPage, IconBtn, ItemRow } from '../components/e/extra'
import { Row, Section } from '../components/e/ui'
import { AddSkillsDialog } from '../components/skills/AddSkillsDialog'
import { AddToDialog } from '../components/skills/AddTo'
import { useToast } from '../components/toast'
import { Spinner } from '../components/ui'
import { useEvent } from '../hooks'
import { call } from '../rpc'
import type { Session } from '../types'
import type { CatalogSkill, Skill, SkillList } from '../types/skills'

export function Skills() {
  const toast = useToast()
  const { cluster: active, session, connected } = useActiveCluster()
  const cluster = active?.id ?? ''
  const [list, setList] = useState<SkillList | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState('')  // the catalog skill being added
  const [choosing, setChoosing] = useState<CatalogSkill | null>(null)
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
  else if (error || !list) body = <EmptyState icon={CircleAlert} title="Could not read the skills" text={error} />
  else body = (
    <>
      <Section title="HPC Hub skills">
        {list.catalog.map((k) => (
          <ItemRow key={k.folder} icon={Sparkles} label={<span className="font-medium">{k.name}</span>}
            sub={<>{k.on.length > 0 && <span className="text-text">In {k.on.map(label).join(', ')} · </span>}
              {k.description}</>}
            trailing={adding === k.folder ? <span className="grid size-9 place-items-center"><Spinner /></span>
              : <EButton small icon={Plus} onClick={() => setChoosing(k)}>Add</EButton>} />
        ))}
      </Section>
      {list.targets.map((t) => {
        const mine = list.installed.filter((k) => k.target === t.id && !k.managed)
        const builtIn = list.installed.filter((k) => k.target === t.id && k.managed)
        return (
          <Section key={t.id} title={t.label}
            note={builtIn.length > 0 && `Comes with ${t.label}: ${builtIn.map((k) => k.name).join(', ')}`}>
            {mine.map((k) => (
              <ItemRow key={k.path} title={k.path} label={k.name} sub={k.description || k.path}
                trailing={<IconBtn icon={Trash2} label={`Remove ${k.name}`} onClick={() => setRemoving(k)} />} />
            ))}
            {!mine.length && <Row label={<span className="text-dim">None added yet</span>} />}
          </Section>
        )
      })}
    </>
  )

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
