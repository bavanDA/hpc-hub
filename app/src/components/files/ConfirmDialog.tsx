import { AlertDialog } from '../ui/AlertDialog'

export function ConfirmDialog({ title, text, action, keep = 'Keep it', onYes, onClose }:
  { title: string; text: string; action: string; keep?: string; onYes: () => void; onClose: () => void }) {
  return (
    <AlertDialog title={title} keep={keep} act={action} onClose={onClose} onAct={() => { onClose(); onYes() }}>
      <p>{text}</p>
    </AlertDialog>
  )
}
