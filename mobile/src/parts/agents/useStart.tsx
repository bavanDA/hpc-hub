// Starting an agent, Ask all or VS Code from the phone: connects the cluster first when needed, reads its setup,
// then shows the right sheet. The phone's version of the desktop's useTools (keys: agent:<id>, ask, vscode).
// const start = useStart(); start.open('wulver', 'Wulver (NJIT)', 'agent:claude'); and render {start.sheet}.
import { useCallback, useEffect, useState, type ReactNode } from 'react'

import { shortName } from '@shared/components/clusters/loginCopy'
import { setNotify, startVscode, whenConnected } from '@shared/components/tools/run'
import { useGo } from '@shared/nav'
import { call } from '@shared/rpc'
import type { ToolSetup, VsFound } from '@shared/types/tools'
import { useToast } from '../../ui'
import { AgentSheet } from './AgentSheet'
import { AskAllSheet } from './AskAllSheet'
import { VsCodeSheet } from './VsCodeSheet'

export function useStart() {
  const toast = useToast()
  const go = useGo()
  const [sheet, setSheet] = useState<ReactNode>(null)
  useEffect(() => setNotify(toast), [toast])
  const close = useCallback(() => setSheet(null), [])

  const open = useCallback(async (cluster: string, name: string, key: string, folder = '') => {
    const [kind, what = ''] = key.split(':')
    try {
      await whenConnected(cluster, name)
      const looking = kind === 'vscode' ? toast(`Looking for VS Code on ${shortName({ name })}…`) : undefined
      const [setup, found] = await Promise.all([call<ToolSetup>('tools.setup', { cluster }),
        kind === 'vscode' ? call<VsFound>('tools.vscode_find', { cluster }) : Promise.resolve(null)])
        .finally(() => looking?.())  // found it: the sheet opens, the note would only cover it
      if (kind === 'vscode' && found) {
        const v = setup.vscode
        if (v.ask === false) {  // Ask every time is off: the saved choices, a running job if there is one
          startVscode(cluster, name, { folder: folder || v.workdir || '~', target: 'browser', job: found.job?.id ?? '',
            replace_job: false, profile: null, remember: false, remember_folder: false }, true)
            .catch((e: Error) => toast(`VS Code didn't start: ${e.message}`, { kind: 'error' }))
          return
        }
        setSheet(<VsCodeSheet setup={setup} found={found} folder={folder} onClose={close} />)
      } else if (kind === 'agent') {
        const agent = setup.agents.find((a) => a.id === what)
        if (!agent) throw new Error(`${name} has no agent called ${what}`)
        setSheet(<AgentSheet key={`${cluster}-${what}`} setup={setup} agent={agent} project={folder} onClose={close} />)
      } else if (kind === 'ask') {
        setSheet(<AskAllSheet setup={setup} folder={folder} onClose={close} />)
      }
    } catch (e) {
      toast((e as Error).message)
    }
  }, [toast, close, go])

  return { open, sheet }
}
