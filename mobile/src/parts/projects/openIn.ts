// Where a folder opens, for a project's or a paper's sheet: Code, Files and Terminal open their screens here; VS Code,
// the agents and Ask all open on the Agents screen with the folder: go('agents', { cluster, folder, start }), where
// start is the desktop's open key (agent:claude, ask, vscode:browser). Anything that needs the cluster connects first.
import { FileCode, FolderOpen, Globe, SquareTerminal, Users } from 'lucide-react'

import { agentIcon } from '@shared/components/agents/AgentIcon'
import { whenConnected } from '@shared/components/tools/run'
import { useGo } from '@shared/nav'
import type { SheetAction } from '../../ui'

/** prepare: runs once connected and answers the folder to use (a project's path with ~ expanded). */
export type OpenTarget = { cluster: string; clusterName: string; folder: string; prepare?: () => Promise<string> }

export function useOpenIn() {
  const go = useGo()
  return (t: OpenTarget, failed: (text: string) => void): SheetAction[] => {
    const where = async () => {
      await whenConnected(t.cluster, t.clusterName)
      return t.prepare ? t.prepare() : t.folder
    }
    const then = (to: (folder: string) => void) => () => where().then(to).catch((e: Error) => failed(e.message))
    const start = (key: string) => then((folder) => go('agents', { cluster: t.cluster, folder, start: key }))
    return [
      { label: 'Code', icon: FileCode, onPick: then((path) => go('code', { cluster: t.cluster, path })) },
      { label: 'Files', icon: FolderOpen, onPick: then((path) => go('files', { cluster: t.cluster, path })) },
      { label: 'Terminal', icon: SquareTerminal,
        onPick: then((folder) => go('terminals', { cluster: t.cluster, new: '1', folder })) },
      { label: 'VS Code in the browser', icon: Globe, onPick: start('vscode:browser') },
      { label: 'Claude', icon: agentIcon('claude'), onPick: start('agent:claude') },
      { label: 'ChatGPT', icon: agentIcon('codex'), onPick: start('agent:codex') },
      { label: 'Antigravity', icon: agentIcon('agy'), onPick: start('agent:agy') },
      { label: 'Cursor', icon: agentIcon('cursor'), onPick: start('agent:cursor') },
      { label: 'Ask all agents', icon: Users, onPick: start('ask') },
    ]
  }
}
