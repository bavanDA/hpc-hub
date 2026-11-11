// The report window: what will be sent, in full, as the backend scrubbed it (report.preview), an optional note and
// email, and a screenshot only when ticked. Send posts exactly what the window shows (report.send).
import { CircleCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { call } from '../../rpc'
import { CheckRow } from '../e/CheckRow'
import { DialogNote } from '../e/DialogNote'
import { EButton } from '../e/EButton'
import { EDialog } from '../e/EDialog'
import { Field } from '../e/Field'
import { TextArea } from '../e/TextArea'
import { Spinner } from '../ui/Spinner'
import { reportPage, type ReportStart } from './open'
import { caughtLines } from './recent'
import { captureWindow } from './screenshot'
import { reportText, type Preview } from './text'

const NOTE_LIMIT = 4000
const CONTACT_LIMIT = 200

export function ReportDialog({ start, onClose }: { start: ReportStart; onClose: () => void }) {
  const [preview, setPreview] = useState<Preview | null>(null)
  const [failed, setFailed] = useState('')
  const [note, setNote] = useState('')
  const [scrubbed, setScrubbed] = useState({ of: '', text: '' })  // the note as it will be sent
  const [contact, setContact] = useState('')
  const [withShot, setWithShot] = useState(false)
  const [shot, setShot] = useState('')
  const [shotError, setShotError] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [sent, setSent] = useState('')
  const marker = useRef<HTMLSpanElement>(null)
  const problem = useRef<HTMLDivElement>(null)
  const user = start.kind === 'user'

  useEffect(() => {
    call<Preview>('report.preview', { kind: start.kind, error: start.error ?? '', ref: start.ref ?? null,
      cluster: start.cluster ?? '', lines: caughtLines(), page: reportPage() })
      .then(setPreview, (e: Error) => setFailed(e.message))
  }, [start])

  useEffect(() => { if (sendError) problem.current?.scrollIntoView({ block: 'nearest' }) }, [sendError])

  useEffect(() => {  // the backend hides names in the note too; the block below shows the result as you type
    if (!note.trim()) { setScrubbed({ of: note, text: '' }); return }
    let live = true
    const t = setTimeout(() => {
      call<string>('report.scrub', { text: note }).then((text) => { if (live) setScrubbed({ of: note, text }) },
        (e: Error) => { if (live) setFailed(e.message) })
    }, 300)
    return () => { live = false; clearTimeout(t) }
  }, [note])

  async function tick(on: boolean) {
    setWithShot(on)
    setShot('')
    setShotError('')
    if (!on) return
    const own = marker.current?.closest('.dialog-scrim')
    try {
      setShot(await captureWindow((el) => el === own))
    } catch (e) {
      setWithShot(false)
      setShotError(`No screenshot: ${(e as Error).message || 'this window could not be drawn'}.`)
    }
  }

  async function send() {
    if (!preview) return
    setSending(true)
    setSendError('')
    try {
      const r = await call<{ id: string }>('report.send', { report: { ...preview, text: scrubbed.text, contact },
        screenshot: withShot ? shot : '' })
      setSent(r.id)
    } catch (e) {
      setSendError((e as Error).message)
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <EDialog title="Report sent" width={440} onClose={onClose}
        actions={<EButton kind="primary" className="flex-1" autoFocus onClick={onClose}>Close</EButton>}>
        <div className="flex flex-col items-center gap-3 px-5 pt-2 pb-3 text-center">
          <CircleCheck size={36} strokeWidth={1.5} className="text-ok" />
          <p>Thank you. This helps make HPC Hub better.</p>
          <p className="text-sm text-dim">If you write about it later, its number is{' '}
            <b className="font-semibold text-text select-text">{sent}</b>.</p>
        </div>
      </EDialog>
    )
  }

  const ready = !!preview && scrubbed.of === note && (!withShot || !!shot) && (!user || !!note.trim())
  return (
    <EDialog title={user ? 'Report a problem' : 'Report this problem'} width={600} onClose={onClose} actions={<>
      <EButton className="flex-1" onClick={onClose}>Cancel</EButton>
      <EButton kind="primary" className="flex-1" disabled={!ready || sending} onClick={send}>
        {sending ? 'Sending…' : sendError ? 'Try again' : 'Send report'}</EButton>
    </>}>
      <span ref={marker} hidden />
      <div className="px-5">
        {!user && start.error && <p className="pb-2 font-semibold break-words">{start.error.trim().split('\n')[0]}</p>}
        <TextArea label={user ? 'What went wrong?' : 'What were you doing? (optional)'} rows={3} value={note}
          maxLength={NOTE_LIMIT} autoFocus={user} onChange={(e) => setNote(e.target.value)}
          placeholder={user ? 'What you did, what you expected, and what happened instead' : undefined} />
        <Field label="Your email, if you would like an answer (optional)" type="email" value={contact}
          maxLength={CONTACT_LIMIT} onChange={(e) => setContact(e.target.value)} />
      </div>
      <div className="mt-2 border-t border-line">
        <CheckRow label={<span className="block break-normal">Add a screenshot of the window<span className="block
          text-sm text-dim">It shows whatever is on screen, so look at it below first.</span></span>}
          value={withShot && !shot ? <Spinner /> : undefined} checked={withShot} onChange={tick} />
      </div>
      {shotError && <p className="px-5 pt-2 text-sm text-dim">{shotError}</p>}

      <h3 className="px-5 pt-5 pb-1.5 text-xs font-semibold tracking-wide text-dim uppercase">
        Everything that will be sent</h3>
      <div className="px-5">
        {failed ? <DialogNote error>Could not prepare the report: {failed}</DialogNote>
          : !preview ? <div className="grid h-24 place-items-center"><Spinner size={20} /></div>
            : <pre aria-label="Report" tabIndex={0} className="max-h-64 overflow-auto rounded-lg border border-line
                bg-inset p-3 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap text-dim select-text">
                {reportText(preview, scrubbed.of === note ? scrubbed.text : note, contact)}</pre>}
        {shot && <img src={shot} alt="The screenshot that will be sent"
          className="mt-2 max-h-48 rounded-lg border border-line object-contain" />}
        <p className="pt-2 pb-1 text-sm text-dim">Names, folders and addresses were replaced with placeholders such
          as {'<user>'} and {'<ip>'}. Passwords are never included. Nothing is sent until you press Send.</p>
      </div>
      {sendError && <div ref={problem} className="pt-2"><DialogNote error>{sendError}</DialogNote></div>}
    </EDialog>
  )
}
