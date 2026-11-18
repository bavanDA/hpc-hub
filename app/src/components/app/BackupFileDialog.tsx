// Settings > Back up: HPC Hub's settings and saved logins in one file locked with a password you choose
// (hpc_hub/core/settings_backup.py), and importing one back. The password never leaves this window except to the
// backend that seals or opens the file.
import { Download, Upload } from 'lucide-react'
import { useState } from 'react'

import { call } from '../../rpc'
import { EButton } from '../e/EButton'
import { EDialog } from '../e/EDialog'
import { Field } from '../e/Field'
import { MainButton } from '../e/MainButton'
import { inTauri } from './platform'

const MIN = 8

type Summary = { made?: number; version: string; files: string[]; clusters: string[]; logins: string[]; globus: boolean }

/** A folder, or a backup file, from the system's dialog. */
async function pick(folder: boolean): Promise<string | null> {
  if (!inTauri) return folder ? '/home/jdoe/Documents' : '/home/jdoe/Documents/hpc-hub-backup-2026-11-18.hpchub'
  const { open } = await import('@tauri-apps/plugin-dialog')
  const { documentDir } = await import('@tauri-apps/api/path')
  const start = await documentDir().catch(() => undefined)
  const got = await open(folder
    ? { title: 'Where to save the backup', directory: true, multiple: false, defaultPath: start }
    : { title: 'Pick an HPC Hub backup', multiple: false, defaultPath: start,
        filters: [{ name: 'HPC Hub backup', extensions: ['hpchub'] }] })
  return typeof got === 'string' ? got : null
}

/** Why a password can't be used yet, or '' when it can. */
export function passwordProblem(password: string, again: string): string {
  if (password.length < MIN) return `At least ${MIN} characters`
  if (again && again !== password) return "The two passwords don't match"
  return ''
}

function Holds({ s }: { s: Summary }) {
  const when = s.made ? new Date(s.made * 1000).toLocaleString() : ''
  return (
    <ul className="flex flex-col gap-1 rounded-lg bg-control px-4 py-3 text-sm">
      {when && <li>Made {when}{s.version ? ` with HPC Hub ${s.version}` : ''}</li>}
      <li>Clusters: {s.clusters.length ? s.clusters.join(', ') : 'none'}</li>
      <li>Saved logins: {s.logins.length ? s.logins.join(', ') : 'none'}{s.globus ? ', and your Globus sign-in' : ''}</li>
      <li>Settings files: {s.files.join(', ') || 'none'}</li>
    </ul>
  )
}

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<(Summary & { path: string }) | null>(null)
  const problem = passwordProblem(password, again)
  const ready = !problem && again === password

  async function save() {
    const folder = await pick(true)
    if (!folder) return
    setBusy(true)
    setError('')
    try {
      setDone(await call<Summary & { path: string }>('backup_file.export', { folder, password }))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <EDialog title="Backup saved" icon={Download} onClose={onClose}
        actions={<MainButton onClick={onClose}>Done</MainButton>}>
        <div className="flex flex-col gap-3 px-5 pb-2">
          <p className="break-all font-mono text-sm">{done.path}</p>
          <Holds s={done} />
          <p className="text-dim">Keep the password somewhere safe: without it, nobody can open this file, you included.</p>
        </div>
      </EDialog>
    )
  }
  return (
    <EDialog title="Export settings and logins" icon={Download} onClose={onClose}
      actions={<MainButton disabled={!ready || busy} onClick={save}>{busy ? 'Saving…' : 'Choose a folder and save'}</MainButton>}>
      <form className="flex flex-col gap-1 px-5" onSubmit={(e) => { e.preventDefault(); if (ready) void save() }}>
        <p className="mb-2 text-dim">One file with HPC Hub's settings, your clusters and projects, and the passwords it
          saved, locked with a password you choose. Your SSH keys aren't included.</p>
        <Field label="Password for the file" type="password" value={password} autoFocus
          onChange={(e) => setPassword(e.target.value)} />
        <Field label="The same password again" type="password" value={again} onChange={(e) => setAgain(e.target.value)} />
        <p className="min-h-5 text-sm text-dim">{password ? problem : ''}</p>
        {error && <p role="alert" className="rounded-lg bg-bad-bg px-3 py-2 font-semibold text-bad">{error}</p>}
      </form>
    </EDialog>
  )
}

export function ImportDialog({ onClose }: { onClose: () => void }) {
  const [path, setPath] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [holds, setHolds] = useState<Summary | null>(null)

  async function choose() {
    const got = await pick(false)
    if (got) { setPath(got); setHolds(null); setError('') }
  }
  async function open() {
    setBusy(true)
    setError('')
    try {
      setHolds(await call<Summary>('backup_file.inspect', { path, password }))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function restore() {
    setBusy(true)
    setError('')
    try {
      await call('backup_file.restore', { path, password })
      location.reload()  // the restored settings take over
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  if (holds) {
    return (
      <EDialog title="Import this backup?" icon={Upload} onClose={onClose}
        actions={<>
          <EButton onClick={onClose}>Keep my settings</EButton>
          <MainButton className="flex-1" disabled={busy} onClick={restore}>{busy ? 'Importing…' : 'Import'}</MainButton>
        </>}>
        <div className="flex flex-col gap-3 px-5 pb-2">
          <Holds s={holds} />
          <p className="text-dim">Its settings and logins replace the ones here. The settings here now are kept in a
            folder beside them, so nothing is lost. HPC Hub reloads after.</p>
          {error && <p role="alert" className="rounded-lg bg-bad-bg px-3 py-2 font-semibold text-bad">{error}</p>}
        </div>
      </EDialog>
    )
  }
  return (
    <EDialog title="Import from a backup" icon={Upload} onClose={onClose}
      actions={<MainButton disabled={!path || !password || busy} onClick={open}>{busy ? 'Opening…' : 'Open'}</MainButton>}>
      <form className="flex flex-col gap-2 px-5" onSubmit={(e) => { e.preventDefault(); if (path && password) void open() }}>
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-mono text-sm">{path || 'No file chosen'}</span>
          <EButton type="button" onClick={choose}>{path ? 'Another file' : 'Choose the file'}</EButton>
        </div>
        <Field label="The file's password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p role="alert" className="rounded-lg bg-bad-bg px-3 py-2 font-semibold text-bad">{error}</p>}
      </form>
    </EDialog>
  )
}
