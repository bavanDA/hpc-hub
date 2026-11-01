// The list of papers on the phone: your LaTeX projects, papers found on the clusters, and a .tex file by path.
// Tap one to open it; ⋮ removes it from the list (the folder stays on the cluster).
import { FileText, FolderSearch, MoreVertical, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { ago, short } from '@shared/components/latex/bits'
import { Spinner } from '@shared/components/ui'
import { call } from '@shared/rpc'
import type { LatexProject, Paper, Picker } from '@shared/types/latex'
import { ActionSheet, Button, Card, ListRow, PickerSheet, PromptSheet, SearchField, useToast } from '../../ui'

export function PaperList({ data, onOpen, onReload }:
  { data: Picker; onOpen: (cluster: string, path: string) => void; onReload: () => void }) {
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [papers, setPapers] = useState<Paper[]>(data.papers)
  const [searching, setSearching] = useState(false)
  const [menu, setMenu] = useState<LatexProject | null>(null)
  const [byPath, setByPath] = useState<'cluster' | 'path' | null>(null)
  const live = data.clusters.filter((c) => c.connected)
  const [cluster, setCluster] = useState(live[0]?.id ?? data.clusters[0]?.id ?? '')

  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const has = (hay: string) => words.every((w) => hay.toLowerCase().includes(w))
  const projects = data.projects.filter((p) => has(`${p.name} ${p.path}`))
  const found = papers.filter((p) => has(`${p.title} ${p.folder}`))
  const name = (id: string) => data.clusters.find((c) => c.id === id)?.name ?? id
  const connected = (id: string) => data.clusters.find((c) => c.id === id)?.connected
  const open = (c: string, p: string) => connected(c) ? onOpen(c, p) : toast(`Connect to ${name(c)} first`)

  const search = async () => {
    if (!live.length) { toast('Connect a cluster first'); return }
    setSearching(true)
    const results = await Promise.all(live.map((c) => call<Paper[]>('latex.scan', { cluster: c.id })
      .then((list) => [c.id, list] as const)
      .catch((e: Error) => { toast(`${c.name}: ${e.message}`); return null })))
    const fresh = results.filter((r) => r !== null)
    const ids = new Set(fresh.map(([id]) => id))
    setPapers([...papers.filter((p) => !ids.has(p.cluster)), ...fresh.flatMap(([, l]) => l)]
      .sort((a, b) => b.mtime - a.mtime))
    setSearching(false)
  }
  const forget = (p: LatexProject) => call('latex.forget', { cluster: p.cluster, path: p.path })
    .then(() => { toast('Removed from the list. The folder stays on the cluster.'); onReload() })
    .catch((e: Error) => toast(e.message))

  return (
    <>
      <SearchField value={query} onChange={setQuery} placeholder="Find a paper" />
      <h2 className="mt-5 mb-2 text-sm font-bold text-dim">Your papers</h2>
      <Card className="py-1">
        {projects.map((p) => (
          <div key={p.id} className="flex items-center">
            <div className="min-w-0 flex-1">
              <ListRow icon={FileText} title={p.name}
                subtitle={`${p.cluster_name} · ${short(p.path)}${connected(p.cluster) ? '' : ' · not connected'}`}
                onClick={() => open(p.cluster, p.main_tex ? `${p.path}/${p.main_tex}` : p.path)} trailing={<span />} />
            </div>
            <button aria-label={`More for ${p.name}`} onClick={() => setMenu(p)}
              className="-mr-2 grid size-11 shrink-0 place-items-center rounded-full text-dim active:bg-hover">
              <MoreVertical size={20} /></button>
          </div>
        ))}
        {!projects.length && <p className="py-4 text-center text-dim">
          {words.length ? 'No paper matches.' : 'No papers yet. Open one found on a cluster, or make a new one.'}</p>}
      </Card>

      <div className="mt-6 mb-2 flex items-end gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-dim">Found on the clusters</h2>
          <p className="text-sm text-dim">{searching ? 'Looking in home, project and scratch…'
            : papers.length ? `${papers.length} folders with a main .tex file, newest first.`
            : 'Look for .tex files with \\documentclass in home, project and scratch.'}</p>
        </div>
        <Button icon={searching ? undefined : FolderSearch} disabled={searching} onClick={search}>
          {searching && <Spinner size={18} />} Search</Button>
      </div>
      {found.length > 0 && (
        <Card className="py-1">
          {found.slice(0, 40).map((p) => (
            <ListRow key={`${p.cluster}:${p.folder}`} icon={FileText} title={p.title}
              subtitle={`${p.cluster_name} · ${p.short} · ${p.main}${p.others ? ` (+${p.others})` : ''} · ${ago(p.mtime)}`}
              onClick={() => open(p.cluster, `${p.folder}/${p.main}`)} />
          ))}
        </Card>
      )}

      <h2 className="mt-6 mb-2 text-sm font-bold text-dim">Open a .tex file by path</h2>
      <Card className="py-1">
        <ListRow title="Cluster" subtitle={name(cluster)} onClick={() => setByPath('cluster')} />
        <ListRow title="Path" subtitle="~/paper/main.tex" onClick={() => setByPath('path')} />
      </Card>

      {menu && <ActionSheet title={menu.name} onClose={() => setMenu(null)} actions={[
        { label: 'Open', icon: FileText, onPick: () => open(menu.cluster, menu.main_tex ? `${menu.path}/${menu.main_tex}`
          : menu.path) },
        { label: 'Remove from the list', icon: Trash2, danger: true, onPick: () => forget(menu) },
      ]} />}
      {byPath === 'cluster' && <PickerSheet title="Cluster" value={cluster} onClose={() => setByPath(null)}
        onPick={setCluster} options={data.clusters.map((c) => ({ value: c.id, label: c.name,
          hint: c.connected ? undefined : 'Not connected' }))} />}
      {byPath === 'path' && <PromptSheet title={`Open on ${name(cluster)}`} label="Path to the .tex file"
        placeholder="~/paper/main.tex" confirm="Open" onClose={() => setByPath(null)}
        onSubmit={(p) => open(cluster, p)} />}
    </>
  )
}
