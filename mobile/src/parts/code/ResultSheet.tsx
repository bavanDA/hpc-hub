// An ask's answer: what the agent said, and each change it suggests as a diff to accept or reject piece by piece,
// then Accept and save. While it still runs, it says what the agent is doing; it keeps going with the app closed.
import { agentName, getAsk, isRunning, useAsks } from '@shared/components/code/ask'
import { Result } from '@shared/components/code/Result'
import { startAgent } from '@shared/components/tools/run'
import { useGo } from '@shared/nav'
import { fileKey, getFile, isDirty } from '@shared/components/code/store'
import { Sheet, useToast } from '../../ui'
import { folderOf, languageFor, nameOf } from './util'

type Props = { askId: string; onClose: () => void; onOpenFile: (cluster: string, path: string) => void }

export function ResultSheet({ askId, onClose, onOpenFile }: Props) {
  useAsks()  // redraw as it moves along
  const go = useGo()
  const toast = useToast()
  const ask = getAsk(askId)
  const title = ask ? `${agentName(ask.status.agent)} on ${nameOf(ask.status.path)}` : 'Answer'
  return (
    <Sheet title={ask && isRunning(ask) ? `${title}, working` : title} onClose={onClose}>
      <Result askId={askId} languageFor={languageFor}
        onOpenFile={(cluster, path) => {
          onClose()
          onOpenFile(cluster, path)
          const f = getFile(fileKey(cluster, path))
          toast(f && isDirty(f) ? 'In the editor. Save when ready.' : `Saved ${nameOf(path)}`)
        }}
        onKeepTalking={(cluster, chatId, agent) => {
          onClose()
          startAgent(cluster, { agent, name: agentName(agent), folder: folderOf(ask?.status.path ?? '~'), chat_id: chatId,
            label: '', task: '', options: {}, new_node: false, remote_control: false, profile: null }, go)
        }} />
    </Sheet>
  )
}
