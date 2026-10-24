// Add skills from a git repository: it is cloned on the cluster, you tick skills and the agents to give them to.
import { Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { call } from '../../rpc'
import type { Skill, Target } from '../../types/skills'
import { EntryRow, Group } from '../clusters/fields'
import { Check, SwitchRow } from '../permissions/controls'
import { useToast } from '../toast'
import { Button, Dialog, Spinner } from '../ui'

export function AddSkillsDialog({ cluster, name, targets, repo, onClose, onDone }: {
  cluster: string; name: string; targets: Target[]; repo: string; onClose: () => void; onDone: () => void
}) {
  const toast = useToast()
  const [url, setUrl] = useState(repo)
  const [found, setFound] = useState<Skill[] | null>(null)
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const [to, setTo] = useState<string[]>(['claude'])
  const [filter, setFilter] = useState('')
  const [adding, setAdding] = useState(false)

  const load = useCallback((address: string) => {
    setLoading(true)
    setNote('Getting the repository...')
    setFound(null)
    setPicked([])
    call<Skill[]>('skills.browse', { cluster, url: address.trim() })
      .then((got) => { setFound(got); setNote(got.length ? `${got.length} skills. Tick the ones you want.`
        : 'No skills found.') })
      .catch((e: Error) => setNote(`Could not load: ${e.message}`))
      .finally(() => setLoading(false))
  }, [cluster])
  useEffect(() => load(repo), [load, repo])

  const shown = useMemo(() => {
    const words = filter.toLowerCase().split(/\s+/).filter(Boolean)
    return (found ?? []).filter((k) => words.every((w) => `${k.name} ${k.description} ${k.path}`.toLowerCase()
      .includes(w)))
  }, [found, filter])
  const tick = (path: string, on: boolean) => setPicked((p) => on ? [...p, path] : p.filter((x) => x !== path))
  const turn = (id: string, on: boolean) => setTo((t) => on ? [...t, id] : t.filter((x) => x !== id))

  const add = () => {
    if (!picked.length || !to.length) { setNote('Tick at least one skill and one agent.'); return }
    setAdding(true)
    call('skills.install', { cluster, paths: picked, targets: to })
      .then(() => { toast(`Added ${picked.length} ${picked.length === 1 ? 'skill' : 'skills'}`); onDone(); onClose() })
      .catch((e: Error) => { toast(`Could not add skills: ${e.message}`); setAdding(false) })
  }

  return (
    <Dialog title={`Add skills on ${name}`} onClose={onClose} width={640}
      actions={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button kind="suggested" disabled={adding || !picked.length || !to.length} onClick={add}>
          {adding && <Spinner size={14} />}Add {picked.length || ''} {picked.length === 1 ? 'skill' : 'skills'}
        </Button>
      </>}>
      <Group description="A git repository with SKILL.md folders. It is cloned on the cluster.">
        <div onKeyDown={(e) => e.key === 'Enter' && url.trim() && load(url)} className="flex items-center pr-3">
          <div className="min-w-0 flex-1"><EntryRow label="Repository" value={url} onChange={setUrl} /></div>
          <Button disabled={loading || !url.trim()} onClick={() => load(url)}>Load</Button>
        </div>
      </Group>
      <div className="mb-2 flex items-end gap-3 px-1">
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-bold">Skills in it</h3>
          <p className="text-[13px] text-dim">{note}</p>
        </div>
        {(found?.length ?? 0) > 8 && (
          <label className="flex h-9 w-48 items-center gap-2 rounded-md bg-pill px-2.5 focus-within:ring-2
            focus-within:ring-accent">
            <Search size={15} className="shrink-0 text-dim" />
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter"
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-dim" />
          </label>
        )}
      </div>
      {loading && <div className="grid h-24 place-items-center"><Spinner size={22} /></div>}
      {!!shown.length && (
        <div className="mb-5"><Group>
          {shown.map((k) => (
            <label key={k.path} title={k.path} className="flex min-h-[56px] items-center gap-3 px-4 py-2 hover:bg-hover">
              <Check on={picked.includes(k.path)} onChange={(v) => tick(k.path, v)} label={k.name} />
              <div className="min-w-0 flex-1">
                <div className="truncate">{k.name}</div>
                {k.description && <div className="line-clamp-2 text-[13px] text-dim">{k.description}</div>}
              </div>
            </label>
          ))}
        </Group></div>
      )}
      <Group title="Add them for">
        {targets.map((t) => <SwitchRow key={t.id} title={t.label} subtitle={t.folder} on={to.includes(t.id)}
          onChange={(v) => turn(t.id, v)} />)}
      </Group>
    </Dialog>
  )
}
