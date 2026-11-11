// The list of papers on the phone, the desktop's Picker: your LaTeX projects, papers found on the clusters, and a .tex
// file by path. Tap a row to open the paper; Open offers where else to open its folder (Code, Files, an agent) and
// removes it from the list (the folder stays on the cluster).
import { FileText, FolderSearch, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { shortName } from '@shared/components/clusters/loginCopy'
import { ago, basename, short } from '@shared/components/latex/bits'
import { matchPapers, matchProjects, mergeFound, openPath } from '@shared/components/latex/picker/papers'
import { Spinner } from '@shared/components/ui/Spinner'
import { call } from '@shared/rpc'
import type { LatexProject, Paper, Picker } from '@shared/types/latex'
import { Button, Dialog, PickDialog, Row, SearchField, SelectButton, useToast } from '../../ui'
import { useOpenIn } from '../projects/openIn'
import { NewPaperDialog } from './NewPaperDialog'

type Folder = { name: string; cluster: string; clusterName: string; folder: string; project?: LatexProject }

const HEADING = 'text-xs font-semibold tracking-wide text-dim uppercase'

export function PaperList({ data, onOpen, onReload }:
  { data: Picker; onOpen: (cluster: string, path: string) => void; onReload: () => void }) {
  const toast = useToast()
  const openIn = useOpenIn()
  const [filter, setFilter] = useState('')
  const [papers, setPapers] = useState<Paper[]>(data.papers)
  const [searching, setSearching] = useState(false)
  const [at, setAt] = useState(data.found_at)
  const [creating, setCreating] = useState(false)
  const [picking, setPicking] = useState(false)
  const live = data.clusters.filter((c) => c.connected)
  const [cluster, setCluster] = useState(live[0]?.id ?? data.clusters[0]?.id ?? '')
  const [path, setPath] = useState('')
  const [openDialog, setOpenDialog] = useState<Folder | null>(null)

  const projects = matchProjects(data.projects, filter)
  const found = matchPapers(papers, filter)
  const connected = (id: string) => data.clusters.find((c) => c.id === id)?.connected
  const nameOf = (id: string) => data.clusters.find((c) => c.id === id)?.name ?? id
  const open = (c: string, p: string) => {
    if (!connected(c)) { toast(`Connect to ${nameOf(c)} first`); return }
    onOpen(c, p)
  }

  const search = async () => {
    if (!live.length) { toast('Connect a cluster first'); return }
    setSearching(true)
    const results = await Promise.all(live.map((c) => call<Paper[]>('latex.scan', { cluster: c.id })
      .then((list) => [c.id, list] as const)
      .catch((e: Error) => { toast(`${c.name}: search failed: ${e.message}`); return null })))
    const fresh = results.filter((r) => r !== null)
    setPapers(mergeFound(papers, fresh))
    setAt({ ...at, ...Object.fromEntries(fresh.map(([id]) => [id, Date.now() / 1000])) })
    setSearching(false)
  }
  const forget = (p: LatexProject) => call('latex.forget', { cluster: p.cluster, path: p.path })
    .then(() => { toast('Removed from the list. The folder stays on the cluster'); onReload() })
    .catch((e: Error) => toast(e.message))

  const oldest = Math.min(...Object.values(at))
  const row = (key: string, title: string, sub: string, when: number, onPress: () => void, f: Folder, off = false) => (
    <div key={key} className="flex min-h-[60px] items-center gap-3 border-b border-line py-2">
      <button onClick={onPress} className="flex min-w-0 flex-1 items-center gap-3 text-left active:opacity-60">
        <FileText size={20} className="shrink-0 text-dim" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{title}</span>
          <span className="block truncate text-sm text-dim">{sub}{off ? ' · not connected' : ''}</span>
        </span>
      </button>
      <span className="shrink-0 text-sm text-dim">{ago(when)}</span>
      <Button small onClick={() => setOpenDialog(f)}>Open</Button>
    </div>
  )

  return (
    <div className="flex flex-col p-4">
      <div className="mb-2 flex items-center gap-2">
        <div className="min-w-0 flex-1"><SearchField value={filter} onChange={setFilter} placeholder="Find a paper" /></div>
        <Button kind="primary" icon={Plus} onClick={() => setCreating(true)}>New paper</Button>
      </div>
      <div className="border-t border-line">
        {projects.map((p) => row(p.id, p.name,
          `${shortName({ name: p.cluster_name })} · ${short(p.path)}${p.main_tex ? ` · ${p.main_tex}` : ''}`,
          p.opened, () => open(p.cluster, openPath(p)),
          { name: p.name, cluster: p.cluster, clusterName: p.cluster_name, folder: p.path, project: p },
          !connected(p.cluster)))}
        {!projects.length && <p className="py-6 text-center text-dim">
          {filter.trim() ? 'No project matches.' : 'No papers yet. Pick one found below, or make a new project.'}</p>}
      </div>

      <div className="mt-4 mb-1.5 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <h2 className={`${HEADING} mb-1`}>Papers found on the clusters</h2>
          <p className="text-sm text-dim">
            {searching ? 'Searching home, project and scratch for .tex files with \\documentclass…'
              : papers.length ? `${papers.length} ${papers.length === 1 ? 'paper' : 'papers'}, newest first.${
                Number.isFinite(oldest) ? ` Searched ${ago(oldest)}.` : ''} Open one to add it to your projects.`
              : 'Search home, project and scratch for .tex files with \\documentclass.'}</p>
        </div>
        <Button disabled={searching} onClick={search}>
          {searching ? <Spinner size={16} /> : <FolderSearch size={16} />} Search</Button>
      </div>
      {found.length > 0 && (
        <div className="mt-1 border-t border-line">
          {found.slice(0, 40).map((p) => row(`${p.cluster}:${p.folder}`, p.title,
            `${shortName({ name: p.cluster_name })} · ${p.short} · ${p.main}${p.others ? ` (+${p.others} more)` : ''}`,
            p.mtime, () => open(p.cluster, `${p.folder}/${p.main}`),
            { name: basename(p.folder), cluster: p.cluster, clusterName: p.cluster_name, folder: p.folder }))}
        </div>
      )}

      <h2 className={`${HEADING} mt-4 mb-1.5`}>Open a .tex file by path</h2>
      <div className="flex items-center gap-2">
        <SelectButton label={nameOf(cluster)} onPress={() => setPicking(true)} className="shrink-0" />
        <input value={path} onChange={(e) => setPath(e.target.value)} placeholder="~/paper/main.tex" aria-label="Path to the .tex file"
          autoCapitalize="none" autoCorrect="off" spellCheck={false}
          onKeyDown={(e) => e.key === 'Enter' && path.trim() && open(cluster, path.trim())}
          className="h-9 min-w-0 flex-1 rounded-lg bg-soft px-3 font-mono text-sm outline-none placeholder:text-faint
            focus:ring-1 focus:ring-accent" />
      </div>
      <div className="pt-2">
        <Button className="w-full" disabled={!path.trim()} onClick={() => open(cluster, path.trim())}>Open</Button>
      </div>

      {openDialog && <OpenPaper folder={openDialog} onClose={() => setOpenDialog(null)}
        actions={openIn({ cluster: openDialog.cluster, clusterName: openDialog.clusterName, folder: openDialog.folder }, toast)}
        onForget={openDialog.project && (() => forget(openDialog.project!))} />}
      {picking && <PickDialog title="Cluster" value={cluster} onClose={() => setPicking(false)} onPick={setCluster}
        options={data.clusters.map((c) => ({ value: c.id, label: c.name, hint: c.connected ? undefined : 'Not connected' }))} />}
      {creating && <NewPaperDialog clusters={data.clusters} start={cluster} onClose={() => setCreating(false)}
        onMade={(c, p) => { setCreating(false); onOpen(c, p) }} />}
    </div>
  )
}

function OpenPaper({ folder, actions, onForget, onClose }: { folder: Folder; onForget?: () => void; onClose: () => void
  actions: ReturnType<ReturnType<typeof useOpenIn>> }) {
  return (
    <Dialog title={`Open ${folder.name}`} onClose={onClose}>
      <div className="border-t border-line">
        {actions.map((a) => <Row key={a.label} icon={a.icon} label={a.label} opens
          onPress={() => { onClose(); a.onPick() }} />)}
        {onForget && <Row icon={Trash2} label="Remove from the list" danger onPress={() => { onClose(); onForget() }} />}
      </div>
    </Dialog>
  )
}
