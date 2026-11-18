// The report window: what will be sent, in full, as the backend scrubbed it (report.preview), an optional note and
// email, and a screenshot only when ticked, taken now, pasted (Ctrl+V), or taken after Minimize (the report waits
// in a small bar while you go to the screen that shows it). Send posts exactly what the window shows (report.send).
import { Camera, CircleCheck, Minus } from 'lucide-react'
import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'

import { call } from '../../rpc'
import { readImage } from '../app/clipboard'
import { imageIn } from '../terminals/imageData'
import { OnTop } from '../ui/OnTop'
import { CheckRow } from '../e/CheckRow'
import { DialogNote } from '../e/DialogNote'
import { EButton } from '../e/EButton'
import { EDialog } from '../e/EDialog'
import { Field } from '../e/Field'
import { TextArea } from '../e/TextArea'
import { Spinner } from '../ui/Spinner'
import { reportPage, type ReportStart } from './open'
import { caughtLines } from './recent'
import { captureWindow, fitPicture } from './screenshot'
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
  const [small, setSmall] = useState(false)  // minimized to a bar, to take the screenshot of another screen
  const [pasted, setPasted] = useState(false)
  const bar = useRef<HTMLDivElement>(null)
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

  async function takePicture(blob: Blob) {
    setShotError('')
    try {
      setShot(await fitPicture(blob))
      setWithShot(true)
      setPasted(true)
    } catch (e) {
      setShotError(`No screenshot: ${(e as Error).message}.`)
    }
  }

  // Ctrl+V with a picture on the clipboard: it becomes the screenshot (text pastes as usual)
  function onPaste(e: ClipboardEvent) {
    const items = [...e.clipboardData.items].filter((i) => i.kind === 'file')
    const at = imageIn(items)
    const blob = at >= 0 ? items[at].getAsFile() : null
    if (!blob) return
    e.preventDefault()
    void takePicture(blob)
  }
  // some webviews give a paste no picture: ask the system's clipboard when it holds no text
  function onKey(e: KeyboardEvent) {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'v') return
    void readImage().then((blob) => { if (blob) void takePicture(blob) })
  }

  async function shootNow() {
    setShotError('')
    try {
      setShot(await captureWindow((el) => el === bar.current?.parentElement))
      setWithShot(true)
      setPasted(false)
    } catch (e) {
      setShotError(`No screenshot: ${(e as Error).message || 'this window could not be drawn'}.`)
    }
    setSmall(false)
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

  if (small) {
    return (
      <OnTop>
        <div className="style-e fixed bottom-4 left-1/2 z-40 -translate-x-1/2">
          <div ref={bar} role="dialog" aria-label="Report a problem, minimized" className="dialog-in flex items-center
            gap-2 rounded-xl bg-window py-2 pr-2 pl-4 shadow-[var(--shadow-dialog)]">
            <span className="text-sm">Go to the screen that shows the problem.</span>
            <EButton kind="primary" icon={Camera} onClick={shootNow}>Take screenshot</EButton>
            <EButton onClick={() => setSmall(false)}>Back to report</EButton>
          </div>
        </div>
      </OnTop>
    )
  }

  const ready = !!preview && scrubbed.of === note && (!withShot || !!shot) && (!user || !!note.trim())
  return (
    <EDialog title={user ? 'Report a problem' : 'Report this problem'} width={600} onClose={onClose} actions={<>
      <EButton className="flex-1" onClick={onClose}>Cancel</EButton>
      <EButton kind="primary" className="flex-1" disabled={!ready || sending} onClick={send}>
        {sending ? 'Sending…' : sendError ? 'Try again' : 'Send report'}</EButton>
    </>}>
      <div onPaste={onPaste} onKeyDown={onKey}>
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
        <div className="flex flex-wrap items-center gap-2 px-5 pt-1 pb-2">
          <EButton kind="quiet" icon={Minus} onClick={() => setSmall(true)}>Minimize</EButton>
          <span className="text-sm text-dim">to take it of another screen, or paste a picture with Ctrl+V.</span>
        </div>
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
        {shot && <img src={shot} alt={pasted ? 'The picture you pasted, which will be sent' : 'The screenshot that will be sent'}
          className="mt-2 max-h-48 rounded-lg border border-line object-contain" />}
        <p className="pt-2 pb-1 text-sm text-dim">Names, folders and addresses were replaced with placeholders such
          as {'<user>'} and {'<ip>'}. Passwords are never included. Nothing is sent until you press Send.</p>
      </div>
      {sendError && <div ref={problem} className="pt-2"><DialogNote error>{sendError}</DialogNote></div>}
      </div>
    </EDialog>
  )
}
