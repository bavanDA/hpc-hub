import { useCallback, useEffect, useState, type ReactNode } from 'react'

import { useGo } from '../../nav'
import { call } from '../../rpc'
import type { Target, ToolSetup } from '../../types/tools'
import { useToast } from '../useToast'
import { AgentDialog } from './AgentDialog'
import { AskAllDialog } from './AskAllDialog'
import { setNotify, whenConnected } from './run'
import { VsCodeDialog } from './VsCodeDialog'

export function useTools() {
  const go = useGo()
  const toast = useToast()
  const [dialog, setDialog] = useState<ReactNode>(null)
  useEffect(() => setNotify(toast), [toast])
  const close = useCallback(() => setDialog(null), [])

  /** prepare: runs once connected and answers the folder to use (a project's path with ~ expanded). back: the
   * window it opens gets an arrow back (to an Open window). Answers 'window' when a window opened, 'done' when it
   * went straight on (a page, VS Code with the saved choices) and 'failed'. */
  const open = useCallback(async (cluster: string, name: string, key: string, folder = '',
    prepare?: () => Promise<string>, back?: () => void): Promise<'window' | 'done' | 'failed'> => {
    const [kind, what = ''] = key.split(':')
    const onBack = back && (() => { setDialog(null); back() })
    try {
      await whenConnected(cluster, name)
      const where = prepare ? await prepare() : folder
      if (kind === 'files' || kind === 'latex') {
        go(kind, where ? { cluster, path: where } : { cluster })
        return 'done'
      }
      if (kind === 'vscode') {  // the window shows at once and says what it finds; never a silent start
        const target = what === 'desktop' || what === 'browser' ? what as Target : undefined
        const ask = await call<ToolSetup>('tools.setup', { cluster }).then((s) => s.vscode.ask !== false)
        setDialog(<VsCodeDialog key={`${cluster}-vscode`} cluster={cluster} name={name} folder={where}
          target={target} go={!ask} onClose={close} onBack={onBack} />)
        return 'window'
      }
      const setup = await call<ToolSetup>('tools.setup', { cluster })
      if (kind === 'agent') {
        const agent = setup.agents.find((a) => a.id === what)
        if (!agent) throw new Error(`No agent ${what}`)
        setDialog(<AgentDialog key={`${cluster}-${what}`} setup={setup} agent={agent} project={where}
          onClose={close} onBack={onBack} />)
      } else if (kind === 'ask') {
        setDialog(<AskAllDialog setup={setup} folder={where} onClose={close} onBack={onBack} />)
      } else {
        toast(`Can't open ${key}`)
        return 'failed'
      }
      return 'window'
    } catch (e) {
      toast((e as Error).message, { kind: 'error' })
      return 'failed'
    }
  }, [go, toast, close])

  return { open, dialog }
}
