// The list of papers on the phone: your LaTeX projects, papers found on the clusters, and a .tex file by path.
// Tap one to open it; ⋮ removes it from the list (the folder stays on the cluster).
import { FileText, FolderSearch, MoreVertical, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { ago, short } from '@shared/components/latex/bits'
import { Spinner } from '@shared/components/ui'
import { call } from '@shared/rpc'
import type { LatexProject, Paper, Picker } from '@shared/types/latex'
import { ActionSheet, PickerSheet, PromptSheet, Row, SearchField, Section, useToast } from '../../ui'
import { shortCluster, wrapPath } from '../code/util'

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
  const name = (id: string) => shortCluster(data.clusters.find((c) => c.id === id)?.name ?? id)
  const connected = (id: string) => data.clusters.find((c) => c.id === id)?.connected
  const open = (c: string, p: string) => connected(c) ? onOpen(c, p) : toast(`Connect to ${name(c)} first`)
  const many = data.clusters.length > 1
  const where = (c: string, rest: string) => wrapPath(many ? `${name(c)} · ${rest}` : rest)

  const search = async () => {
    if (!live.length) { toast('Connect a cluster first'); return }
    setSearching(true)
    const results = await Promise.all(live.map((c) => call<Paper[]>('latex.scan', { cluster: c.id })
      .then((list) => [c.id, list] as const)
      .catch((e: Error) => { toast(`${shortCluster(c.name)}: ${e.message}`); return null })))
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
      {data.projects.length + papers.length > 8 && (
        <div className="px-4"><SearchField value={query} onChange={setQuery} placeholder="Find a paper" /></div>
      )}
      <Section title="Your papers">
        {projects.map((p) => (
          <div key={p.id} className="flex items-center border-b border-line">
            <button onClick={() => open(p.cluster, p.main_tex ? `${p.path}/${p.main_tex}` : p.path)}
              className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2 pl-4 text-left active:bg-pressed">
              <FileText size={22} className="shrink-0 text-dim" />
              <span className="min-w-0 flex-1">
                <span className="block break-words">{p.name}</span>
                <span className="block text-sm break-words text-dim">
                  {where(p.cluster, short(p.path))}{connected(p.cluster) ? '' : ' · not connected'}</span>
              </span>
            </button>
            <button aria-label={`More for ${p.name}`} onClick={() => setMenu(p)}
              className="grid size-12 shrink-0 place-items-center text-dim active:bg-pressed">
              <MoreVertical size={20} /></button>
          </div>
        ))}
        {!projects.length && <p className="border-b border-line px-4 py-4 text-dim">
          {words.length ? 'No paper matches.' : 'No papers yet.'}</p>}
      </Section>

      <Section title="Found on the clusters">
        {found.slice(0, 40).map((p) => (
          <Row key={`${p.cluster}:${p.folder}`} icon={FileText} label={p.title}
            sub={where(p.cluster, `${p.short} · ${ago(p.mtime)}`)}
            onPress={() => open(p.cluster, `${p.folder}/${p.main}`)} />
        ))}
        <Row icon={FolderSearch} label={papers.length ? 'Look again' : 'Find papers on the clusters'}
          sub={searching ? 'Looking in home, project and scratch' : undefined}
          onPress={searching ? undefined : () => void search()}>{searching && <Spinner size={18} />}</Row>
      </Section>

      <Section title="Open a .tex file">
        <Row label="Cluster" value={name(cluster)} opens onPress={() => setByPath('cluster')} />
        <Row label="Path" value={<span className="text-dim">~/paper/main.tex</span>} opens onPress={() => setByPath('path')} />
      </Section>

      {menu && <ActionSheet title={menu.name} onClose={() => setMenu(null)} actions={[
        { label: 'Open', icon: FileText, onPick: () => open(menu.cluster, menu.main_tex ? `${menu.path}/${menu.main_tex}`
          : menu.path) },
        { label: 'Remove from the list', icon: Trash2, danger: true, onPick: () => forget(menu) },
      ]} />}
      {byPath === 'cluster' && <PickerSheet title="Cluster" value={cluster} onClose={() => setByPath(null)}
        onPick={setCluster} options={data.clusters.map((c) => ({ value: c.id, label: shortCluster(c.name),
          hint: c.connected ? undefined : 'Not connected' }))} />}
      {byPath === 'path' && <PromptSheet title={`Open on ${name(cluster)}`} label="Path to the .tex file"
        placeholder="~/paper/main.tex" confirm="Open" onClose={() => setByPath(null)}
        onSubmit={(p) => open(cluster, p)} />}
    </>
  )
}
