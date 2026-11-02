// What every Open menu item does (keys as in hpc_hub/ui/widgets.py open_menu): vscode:<target> or vscode, files,
// ask, agent:<id>. const tools = useTools(); tools.open('wulver', 'Wulver', 'agent:claude', '~/thesis'); and render
// {tools.dialog} somewhere that stays on screen.
import { useCallback, useEffect, useState, type ReactNode } from 'react'

import { useGo } from '../../nav'
import { call } from '../../rpc'
import type { Target, ToolSetup, VsFound } from '../../types/tools'
import { shortName } from '../clusters/loginCopy'
import { useToast } from '../toast'
import { AgentDialog } from './AgentDialog'
import { AskAllDialog } from './AskAllDialog'
import { setNotify, startVscode, whenConnected } from './run'
import { VsCodeDialog } from './VsCodeDialog'

export function useTools() {
  const go = useGo()
  const toast = useToast()
  const [dialog, setDialog] = useState<ReactNode>(null)
  useEffect(() => setNotify(toast), [toast])
  const close = useCallback(() => setDialog(null), [])

  /** prepare: runs once connected and answers the folder to use (a project's path with ~ expanded). */
  const open = useCallback(async (cluster: string, name: string, key: string, folder = '',
    prepare?: () => Promise<string>) => {
    const [kind, what = ''] = key.split(':')
    try {
      await whenConnected(cluster, name)
      const where = prepare ? await prepare() : folder
      if (kind === 'files' || kind === 'latex') {
        go(kind, where ? { cluster, path: where } : { cluster })
        return
      }
      const looking = kind === 'vscode' ? toast(`Looking for VS Code on ${shortName({ name })}…`) : undefined
      const [setup, found] = await Promise.all([call<ToolSetup>('tools.setup', { cluster }),
        kind === 'vscode' ? call<VsFound>('tools.vscode_find', { cluster }) : Promise.resolve(null)])
        .finally(() => looking?.())  // found it: the window opens, the note would only cover it
      if (kind === 'vscode' && found) {
        const target = what === 'desktop' || what === 'browser' ? what as Target : undefined
        if (setup.vscode.ask === false) {  // Ask every time is off: the saved choices, a running job if there is one
          startVscode(cluster, { folder: where || setup.vscode.workdir || '~', target: target ?? setup.vscode.open_in,
            job: found.job?.id ?? '', replace_job: false, profile: null, remember: false, remember_folder: false },
          setup.vscode.open_links, go)
          return
        }
        setDialog(<VsCodeDialog setup={setup} found={found} folder={where} target={target} onClose={close} />)
      } else if (kind === 'agent') {
        const agent = setup.agents.find((a) => a.id === what)
        if (!agent) throw new Error(`No agent ${what}`)
        setDialog(<AgentDialog key={`${cluster}-${what}`} setup={setup} agent={agent} project={where}
          onClose={close} />)
      } else if (kind === 'ask') {
        setDialog(<AskAllDialog setup={setup} folder={where} onClose={close} />)
      } else {
        toast(`Can't open ${key}`)
      }
    } catch (e) {
      toast((e as Error).message)
    }
  }, [go, toast, close])

  return { open, dialog }
}
