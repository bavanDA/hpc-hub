// Agents › Skills (experimental): what Claude, ChatGPT and the others know on a cluster. Add HPC Hub's own skills,
// any from a git repository, and remove the ones you added (a long press, or ⋮).
import { CircleAlert, GitBranch, MoreVertical, Plus, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { EmptyState, Spinner } from '@shared/components/ui'
import { call } from '@shared/rpc'
import type { CatalogSkill, Skill, SkillList, Target } from '@shared/types/skills'
import { Button, Card, ConfirmSheet, Field, Sheet, Switch, useToast } from '../../ui'
import { NotConnectedHere, useClusterTab } from './ClusterTabs'

export function Skills() {
  const toast = useToast()
  const { current, picker } = useClusterTab()
  const cluster = current?.id ?? ''
  const [list, setList] = useState<SkillList | null>(null)
  const [error, setError] = useState('')
  const [adding, setAdding] = useState<CatalogSkill | null>(null)
  const [fromGit, setFromGit] = useState(false)
  const [removing, setRemoving] = useState<Skill | null>(null)

  const load = useCallback(() => {
    if (!cluster) return
    call<SkillList>('skills.list', { cluster })
      .then((l) => { setList(l); setError('') })
      .catch((e: Error) => { setList(null); setError(e.message) })
  }, [cluster])
  useEffect(() => { setList(null); setError(''); load() }, [load])
  const label = (id: string) => list?.targets.find((t) => t.id === id)?.label ?? id

  const addOwn = (k: CatalogSkill, targets: string[]) => {
    call('skills.add', { cluster, folder: k.folder, targets })
      .then(() => { toast(`Added ${k.name} to ${targets.map(label).join(', ')}`); load() })
      .catch((e: Error) => toast(`Could not add ${k.name}: ${e.message}`))
  }
  const remove = (k: Skill) => {
    call('skills.remove', { cluster, path: k.path, target: k.target })
      .then(() => { toast(`Removed ${k.name}`); load() })
      .catch((e: Error) => toast(`Could not remove ${k.name}: ${e.message}`))
  }

  if (!current) return <NotConnectedHere what="skills" />
  return (
    <div>
      {picker}
      {error && <EmptyState icon={CircleAlert} title="Could not read the skills" text={error} />}
      {!error && !list && <div className="grid h-40 place-items-center"><Spinner size={24} /></div>}
      {list && <>
        <h2 className="mb-1 text-sm font-bold text-dim">HPC Hub skills</h2>
        <Card className="mb-4 py-1">
          {list.catalog.map((k) => (
            <div key={k.folder} className="flex min-h-16 items-center gap-3 py-2">
              <Sparkles size={22} className="shrink-0 text-dim" />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{k.name}</span>
                <span className="line-clamp-2 text-sm text-dim">{k.on.length
                  ? <><span className="font-semibold text-ok">In {k.on.map(label).join(', ')}</span> · </> : null}
                  {k.description}</span>
              </span>
              <Button icon={Plus} className="h-11 shrink-0" onClick={() => setAdding(k)}>Add</Button>
            </div>
          ))}
        </Card>
        {list.targets.map((t) => {
          const mine = list.installed.filter((k) => k.target === t.id && !k.managed)
          const builtIn = list.installed.filter((k) => k.target === t.id && k.managed)
          return (
            <section key={t.id} className="mb-4">
              <h2 className="mb-1 text-sm font-bold text-dim">{t.label}</h2>
              <Card className="py-1">
                {mine.map((k) => (
                  <div key={k.path} className="flex min-h-14 items-center gap-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{k.name}</span>
                      <span className="block truncate text-sm text-dim">{k.description || k.path}</span>
                    </span>
                    <button aria-label={`Remove ${k.name}`} onClick={() => setRemoving(k)}
                      className="grid size-12 shrink-0 place-items-center rounded-full text-dim active:bg-hover">
                      <MoreVertical size={20} /></button>
                  </div>
                ))}
                {!mine.length && <p className="py-3 text-dim">None added yet.</p>}
                {builtIn.length > 0 && <p className="pb-3 text-sm text-dim">Comes with {t.label}: {builtIn.map((k) => k.name)
                  .join(', ')}</p>}
              </Card>
            </section>
          )
        })}
        <Button icon={GitBranch} className="w-full" onClick={() => setFromGit(true)}>Add skills from a git repository</Button>
      </>}

      {adding && list && <AddToSheet skill={adding} targets={list.targets} onClose={() => setAdding(null)}
        onAdd={(t) => addOwn(adding, t)} />}
      {fromGit && list && <FromGitSheet cluster={cluster} targets={list.targets} repo={list.default_repo}
        onClose={() => setFromGit(false)} onDone={load} />}
      {removing && (
        <ConfirmSheet title={`Remove ${removing.name}?`} danger keep="Keep it" confirm="Remove" onClose={() => setRemoving(null)}
          text={`${label(removing.target)} no longer has it on ${list?.name ?? 'this cluster'}. Its folder is deleted.`}
          onConfirm={() => remove(removing)} />
      )}
    </div>
  )
}

/** Tick the agents that should get one of HPC Hub's skills (those without it are ticked). */
function AddToSheet({ skill, targets, onClose, onAdd }:
  { skill: CatalogSkill; targets: Target[]; onClose: () => void; onAdd: (targets: string[]) => void }) {
  const [picked, setPicked] = useState(() => targets.map((t) => t.id).filter((t) => !skill.on.includes(t)))
  return (
    <Sheet title={`Add ${skill.name}`} onClose={onClose} actions={
      <Button kind="primary" className="flex-1" disabled={!picked.length}
        onClick={() => { onClose(); onAdd(picked) }}>Add</Button>}>
      <p className="mb-2 text-dim">{skill.description}</p>
      <Card className="py-1">
        {targets.map((t) => (
          <Switch key={t.id} label={t.label} hint={skill.on.includes(t.id) ? 'Has it already' : t.folder}
            checked={picked.includes(t.id)}
            onChange={(on) => setPicked(on ? [...picked, t.id] : picked.filter((x) => x !== t.id))} />
        ))}
      </Card>
    </Sheet>
  )
}

/** A git repository's skills: look first, then pick which ones and for which agents. */
function FromGitSheet({ cluster, targets, repo, onClose, onDone }:
  { cluster: string; targets: Target[]; repo: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const [url, setUrl] = useState(repo)
  const [found, setFound] = useState<Skill[] | null>(null)
  const [looking, setLooking] = useState(false)
  const [note, setNote] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [to, setTo] = useState<string[]>(['claude'])
  const [installing, setInstalling] = useState(false)

  const look = () => {
    setLooking(true); setNote(''); setFound(null)
    call<Skill[]>('skills.browse', { cluster, url: url.trim() })
      .then((s) => { setFound(s); setPicked([]); if (!s.length) setNote('No skills found there.') })
      .catch((e: Error) => setNote(e.message))
      .finally(() => setLooking(false))
  }
  const install = () => {
    setInstalling(true)
    call('skills.install', { cluster, paths: picked, targets: to })
      .then(() => { toast(`Added ${picked.length} skill${picked.length === 1 ? '' : 's'}`); onClose(); onDone() })
      .catch((e: Error) => { setNote(e.message); setInstalling(false) })
  }

  return (
    <Sheet title="Skills from git" onClose={onClose} actions={found?.length ? (
      <Button kind="primary" className="flex-1" disabled={!picked.length || !to.length || installing} onClick={install}>
        {installing && <Spinner size={16} />}Add {picked.length || ''}</Button>) : undefined}>
      <Field label="Repository" value={url} autoCapitalize="none" autoCorrect="off" spellCheck={false}
        inputMode="url" onChange={(e) => setUrl(e.target.value)} />
      <Button className="w-full" disabled={!url.trim() || looking} onClick={look}>
        {looking && <Spinner size={16} />}Look for skills</Button>
      {note && <p className="mt-3 rounded-xl bg-pill p-3 text-dim">{note}</p>}
      {found && found.length > 0 && <>
        <h2 className="mt-4 mb-1 text-sm font-bold text-dim">Skills ({found.length})</h2>
        <Card className="py-1">
          {found.map((k) => (
            <Switch key={k.path} label={k.name} hint={k.description} checked={picked.includes(k.path)}
              onChange={(on) => setPicked(on ? [...picked, k.path] : picked.filter((x) => x !== k.path))} />
          ))}
        </Card>
        <h2 className="mt-4 mb-1 text-sm font-bold text-dim">Add them to</h2>
        <Card className="py-1">
          {targets.map((t) => (
            <Switch key={t.id} label={t.label} checked={to.includes(t.id)}
              onChange={(on) => setTo(on ? [...to, t.id] : to.filter((x) => x !== t.id))} />
          ))}
        </Card>
      </>}
    </Sheet>
  )
}
