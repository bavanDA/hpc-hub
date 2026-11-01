// Pick a paper, like Overleaf's project list: your LaTeX projects, papers found on the clusters, or a .tex path.
import { ChevronRight, FileText, FolderSearch, Plus, Search, X } from 'lucide-react'
import { useState } from 'react'

import { call } from '../../rpc'
import type { LatexCluster, Paper, Picker as PickerData } from '../../types/latex'
import { useToast } from '../toast'
import { Button, Card, Dialog, Spinner } from '../ui'
import { ago, short } from './bits'

export function Picker({ data, onOpen, onReload }:
  { data: PickerData; onOpen: (cluster: string, path: string) => void; onReload: () => void }) {
  const toast = useToast()
  const [filter, setFilter] = useState('')
  const [papers, setPapers] = useState<Paper[]>(data.papers)
  const [searching, setSearching] = useState(false)
  const [at, setAt] = useState(data.found_at)
  const [creating, setCreating] = useState(false)
  const live = data.clusters.filter((c) => c.connected)
  const [cluster, setCluster] = useState(live[0]?.id ?? data.clusters[0]?.id ?? '')
  const [path, setPath] = useState('')

  const f = filter.trim().toLowerCase()
  const projects = data.projects.filter((p) => !f || `${p.name} ${p.path}`.toLowerCase().includes(f))
  const found = papers.filter((p) => !f || `${p.title} ${p.folder}`.toLowerCase().includes(f))
  const connected = (id: string) => data.clusters.find((c) => c.id === id)?.connected
  const open = (c: string, p: string) => {
    if (!connected(c)) { toast(`Connect to ${data.clusters.find((x) => x.id === c)?.name ?? c} first`); return }
    onOpen(c, p)
  }

  const search = async () => {
    if (!live.length) { toast('Connect a cluster first'); return }
    setSearching(true)
    const results = await Promise.all(live.map((c) => call<Paper[]>('latex.scan', { cluster: c.id })
      .then((list) => [c.id, list] as const)
      .catch((e: Error) => { toast(`${c.name}: search failed: ${e.message}`); return null })))
    const fresh = results.filter((r) => r !== null)
    const ids = new Set(fresh.map(([id]) => id))
    setPapers([...papers.filter((p) => !ids.has(p.cluster)), ...fresh.flatMap(([, l]) => l)]
      .sort((a, b) => b.mtime - a.mtime))
    setAt({ ...at, ...Object.fromEntries(fresh.map(([id]) => [id, Date.now() / 1000])) })
    setSearching(false)
  }
  const forget = (c: string, p: string) => call('latex.forget', { cluster: c, path: p })
    .then(() => { toast('Removed from the list. The folder stays on the cluster'); onReload() })
    .catch((e: Error) => toast(e.message))

  const oldest = Math.min(...Object.values(at))
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-[860px] flex-col gap-4 px-6 pb-10 pt-7">
        <div className="flex items-center gap-3">
          <h1 className="flex-1 text-xl font-semibold">LaTeX projects</h1>
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dim" />
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find a paper"
              className="h-9 w-56 rounded-md bg-pill pl-9 pr-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus" />
          </div>
          <Button kind="suggested" onClick={() => setCreating(true)}><Plus size={16} /> New project</Button>
        </div>

        <Card className="divide-y divide-line overflow-hidden">
          {projects.map((p) => (
            <div key={p.id} onClick={() => open(p.cluster, p.main_tex ? `${p.path}/${p.main_tex}` : p.path)}
              className="group flex min-h-[60px] items-center gap-3 px-4 py-2 hover:bg-hover">
              <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-ok-bg text-ok"><FileText size={20} /></div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{p.name}</div>
                <div className="truncate text-sm text-dim">
                  {p.cluster_name} · {short(p.path)}{p.main_tex ? ` · ${p.main_tex}` : ''}</div>
              </div>
              {!connected(p.cluster) && <span className="text-xs text-dim">not connected</span>}
              <span className="w-28 text-right text-sm text-dim">{ago(p.opened)}</span>
              <button aria-label="Remove from the list" title="Remove from the list (the folder stays)"
                onClick={(e) => { e.stopPropagation(); forget(p.cluster, p.path) }}
                className="grid size-7 place-items-center rounded-md text-dim opacity-0 hover:bg-hover group-hover:opacity-100">
                <X size={14} /></button>
            </div>
          ))}
          {!projects.length && <p className="px-4 py-6 text-center text-base text-dim">
            {f ? 'No project matches.' : 'No papers yet. Pick one found below, or make a new project.'}</p>}
        </Card>

        <div className="mt-4 flex items-end gap-3">
          <div className="flex-1">
            <h2 className="text-lg font-semibold">Papers found on the clusters</h2>
            <p className="text-sm text-dim">
              {searching ? 'Searching home, project and scratch for .tex files with \\documentclass…'
                : papers.length ? `${papers.length} folders with a main .tex file, newest first.${
                  Number.isFinite(oldest) ? ` Searched ${ago(oldest)}.` : ''} Open one to add it to your projects.`
                : 'Search home, project and scratch for .tex files with \\documentclass.'}</p>
          </div>
          <Button onClick={search} disabled={searching}>
            {searching ? <Spinner size={16} /> : <FolderSearch size={16} />} Search</Button>
        </div>
        {found.length > 0 && (
          <Card className="divide-y divide-line overflow-hidden">
            {found.slice(0, 40).map((p) => (
              <div key={`${p.cluster}:${p.folder}`} onClick={() => open(p.cluster, `${p.folder}/${p.main}`)}
                title={`${p.folder}/${p.main}`} className="flex min-h-[56px] items-center gap-3 px-4 py-2 hover:bg-hover">
                <FileText size={20} className="shrink-0 text-dim" />
                <div className="min-w-0 flex-1">
                  <div className="truncate">{p.title}</div>
                  <div className="truncate text-sm text-dim">{p.cluster_name} · {p.short} · {p.main}
                    {p.others ? ` (+${p.others} more)` : ''}</div>
                </div>
                <span className="w-28 text-right text-sm text-dim">{ago(p.mtime)}</span>
                <ChevronRight size={16} className="text-dim" />
              </div>
            ))}
          </Card>
        )}

        <h2 className="mt-4 text-lg font-semibold">Open a .tex file by path</h2>
        <div className="flex gap-2">
          <ClusterSelect clusters={data.clusters} value={cluster} onChange={setCluster} />
          <input value={path} onChange={(e) => setPath(e.target.value)} placeholder="~/paper/main.tex"
            onKeyDown={(e) => e.key === 'Enter' && path.trim() && open(cluster, path.trim())}
            className="h-9 flex-1 rounded-md bg-pill px-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus" />
          <Button disabled={!path.trim()} onClick={() => open(cluster, path.trim())}>Open</Button>
        </div>
      </div>
      {creating && <NewProject clusters={data.clusters} start={cluster} onClose={() => setCreating(false)}
        onMade={(c, p) => { setCreating(false); onOpen(c, p) }} />}
    </div>
  )
}

function ClusterSelect({ clusters, value, onChange }:
  { clusters: LatexCluster[]; value: string; onChange: (id: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-md bg-pill px-2 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus">
      {clusters.map((c) => <option key={c.id} value={c.id}>{c.name}{c.connected ? '' : ' (not connected)'}</option>)}
    </select>
  )
}

function NewProject({ clusters, start, onClose, onMade }: { clusters: LatexCluster[]; start: string;
  onClose: () => void; onMade: (cluster: string, path: string) => void }) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [cluster, setCluster] = useState(start)
  const [parent, setParent] = useState('~/papers')
  const [git, setGit] = useState(true)
  const [busy, setBusy] = useState(false)
  const go = () => {
    if (!name.trim() || busy) return
    setBusy(true)
    call<{ path: string; main_tex: string }>('projects.create', { cluster, parent, name, template: 'LaTeX paper', git })
      .then((p) => onMade(cluster, p.main_tex ? `${p.path}/${p.main_tex}` : p.path))
      .catch((e: Error) => { toast(e.message); setBusy(false) })
  }
  const field = 'h-9 w-full rounded-md bg-pill px-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus'
  return (
    <Dialog title="New LaTeX project" onClose={onClose} width={440}
      actions={<><Button onClick={onClose}>Cancel</Button>
        <Button kind="suggested" disabled={!name.trim() || busy} onClick={go}>{busy && <Spinner size={14} />} Create</Button></>}>
      <div className="flex flex-col gap-3 text-base">
        <label className="flex flex-col gap-1"><span className="text-sm text-dim">Name</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="my-paper"
            onKeyDown={(e) => e.key === 'Enter' && go()} className={field} /></label>
        <label className="flex flex-col gap-1"><span className="text-sm text-dim">Cluster</span>
          <ClusterSelect clusters={clusters} value={cluster} onChange={setCluster} /></label>
        <label className="flex flex-col gap-1"><span className="text-sm text-dim">In the folder</span>
          <input value={parent} onChange={(e) => setParent(e.target.value)} className={`${field} font-mono text-sm`} />
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={git} onChange={(e) => setGit(e.target.checked)} className="accent-accent" />
          Start a git repository</label>
        <p className="text-sm text-dim">Makes main.tex and a .gitignore for LaTeX build files.</p>
      </div>
    </Dialog>
  )
}
