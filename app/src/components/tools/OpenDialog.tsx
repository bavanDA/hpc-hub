// "Open thesis": where to open a folder, as rows (the phone's ProjectActions sheet at desktop size). Code, Files and
// Terminal go to their page; VS Code, an agent or Ask all goes on to its own window, with an arrow back to this one.
import { Code, FileCode2, FolderOpen, SquareTerminal, Users, type LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useGo } from '../../nav'
import { agentIcon } from '../agents/AgentIcon'
import { EDialog, List, Row, Section } from '../e/ui'
import { useToast } from '../toast'
import { Spinner } from '../ui'
import { whenConnected } from './run'
import { useTools } from './useTools'

const PLACES: [string, string, LucideIcon][] = [['code', 'Code', FileCode2], ['files', 'Files', FolderOpen],
  ['terminal', 'Terminal', SquareTerminal], ['vscode', 'VS Code', Code]]
const AGENTS: [string, string, LucideIcon][] = [['agent:claude', 'Claude', agentIcon('claude')],
  ['agent:codex', 'ChatGPT', agentIcon('codex')], ['agent:agy', 'Antigravity', agentIcon('agy')],
  ['agent:cursor', 'Cursor', agentIcon('cursor')], ['ask', 'Ask all agents', Users]]

export type Extra = { label: string; icon: LucideIcon; onPick: () => void }

/** prepare: runs once connected and answers the folder (a project's path with ~ expanded, see useTools). extra:
 *  more rows at the end (a project's LaTeX). */
export function OpenDialog({ name, cluster, clusterName, folder, prepare, extra = [], onClose }: {
  name: string; cluster: string; clusterName: string; folder: string; prepare?: () => Promise<string>
  extra?: Extra[]; onClose: () => void
}) {
  const go = useGo()
  const toast = useToast()
  const tools = useTools()
  const [busy, setBusy] = useState('')
  const [away, setAway] = useState(false)  // the next window is up
  useEffect(() => { if (away && !tools.dialog) onClose() }, [away, tools.dialog, onClose])

  const pick = async (key: string) => {
    if (busy) return
    setBusy(key)
    if (key === 'code') {
      prepare?.().catch(() => {})
      go('code', { cluster, folder })
      onClose()
      return
    }
    if (key === 'terminal') {
      try {
        await whenConnected(cluster, clusterName)
        const where = prepare ? await prepare() : folder
        go('terminals', { cluster, new: '1', folder: where })
        onClose()
      } catch (e) {
        toast((e as Error).message)
        setBusy('')
      }
      return
    }
    const r = await tools.open(cluster, clusterName, key, folder, prepare, () => setAway(false))
    setBusy('')
    if (r === 'window') setAway(true)
    else if (r === 'done') onClose()
  }

  const row = ([key, label, icon]: [string, string, LucideIcon]) => (
    <Row key={key} icon={icon} label={label} opens={busy !== key} onPress={() => void pick(key)}>
      {busy === key && <Spinner />}</Row>
  )
  return (
    <>
      {!away && <EDialog title={`Open ${name}`} width={440} onClose={onClose}>
        <List>{PLACES.map(row)}</List>
        <Section title="Agents">{AGENTS.map(row)}</Section>
        {extra.length > 0 && <div className="pt-5"><List>
          {extra.map((x) => <Row key={x.label} icon={x.icon} label={x.label} opens
            onPress={() => { onClose(); x.onPick() }} />)}
        </List></div>}
      </EDialog>}
      {tools.dialog}
    </>
  )
}
