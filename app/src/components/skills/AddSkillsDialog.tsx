import { useCallback, useEffect, useMemo, useState } from 'react'

import { call } from '../../rpc'
import type { Skill, Target } from '../../types/skills'
import { EButton, SearchField } from '../e/extra'
import { EDialog, Field, MainButton, Section, ToggleRow } from '../e/ui'
import { Spinner } from '../ui'
import { useToast } from '../useToast'

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
    setNote('')
    setFound(null)
    setPicked([])
    call<Skill[]>('skills.browse', { cluster, url: address.trim() })
      .then((got) => { setFound(got); if (!got.length) setNote('No skills found there.') })
      .catch((e: Error) => setNote(`Could not load it: ${e.message}`))
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
    setAdding(true)
    call('skills.install', { cluster, paths: picked, targets: to })
      .then(() => { toast(`Added ${picked.length} ${picked.length === 1 ? 'skill' : 'skills'}`); onDone(); onClose() })
      .catch((e: Error) => { toast(`Could not add skills: ${e.message}`); setAdding(false) })
  }

  return (
    <EDialog title={`Skills from git on ${name}`} width={600} onClose={onClose}
      actions={<MainButton disabled={adding || !picked.length || !to.length} onClick={add}>
        {adding && <Spinner size={16} />}Add {picked.length || ''} {picked.length === 1 ? 'skill' : 'skills'}
      </MainButton>}>
      <form className="flex items-end gap-2 px-5" onSubmit={(e) => { e.preventDefault(); if (url.trim()) load(url) }}>
        <div className="min-w-0 flex-1"><Field label="Repository" value={url} onChange={(e) => setUrl(e.target.value)} /></div>
        <EButton type="submit" className="mb-1.5" disabled={loading || !url.trim()}>Look for skills</EButton>
      </form>
      {note && <p className="px-5 pt-2 text-dim">{note}</p>}
      {loading && <div className="grid h-24 place-items-center"><Spinner size={20} /></div>}
      {found && found.length > 0 && <>
        <Section title={`Skills (${found.length})`}>
          {found.length > 8 && <div className="border-b border-line px-5 py-2">
            <SearchField value={filter} onChange={setFilter} placeholder="Filter skills" /></div>}
          {shown.map((k) => (
            <div key={k.path} title={k.path}>
              <ToggleRow label={k.name} sub={k.description} checked={picked.includes(k.path)}
                onChange={(on) => tick(k.path, on)} />
            </div>
          ))}
        </Section>
        <Section title="Add them to">
          {targets.map((t) => <ToggleRow key={t.id} label={t.label} sub={t.folder} checked={to.includes(t.id)}
            onChange={(on) => turn(t.id, on)} />)}
        </Section>
      </>}
    </EDialog>
  )
}
