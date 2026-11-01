// The backup agent's flow for one cluster, shared by the desktop page and the phone screen (methods/backup.py):
// start, checking, what is at risk, the plan, space and the trial run, copying, done. Where you are is kept per
// cluster outside React, so leaving the page and coming back lands on the same step.
import { useCallback, useEffect, useRef, useState } from 'react'

import { call } from '../../rpc'
import type {
  BackupPolicy, Choice, CopyResult, Plan, PlanItem, Progress, Reminders, Scan, Summary,
} from '../../types/backup'
import { notify } from '../app/notify'
import { REMAKE, notices } from './copy'

export type Step = 'start' | 'scanning' | 'risk' | 'plan' | 'space' | 'copy' | 'done'
type Kept = { step: Step; scan: string; copy: string; job: string; tried: string }

const kept = new Map<string, Kept>()
const POLL_MS = 1500

const RUNNING = new Set(['starting', 'waiting_for_node', 'scanning', 'thinking'])
export const scanRunning = (s?: Scan | null) => !!s && RUNNING.has(s.state)
const COPYING = new Set(['filtering', 'copying', 'verifying', 'resubmitted'])
export const copyRunning = (p?: Progress | null) => !!p && COPYING.has(p.state)

export type Options = { horizon: number; whole: boolean; everything: boolean; codeToHome: boolean }

/** at: 'plan' opens the last finished check's plan (from a notice or the Files banner). */
export function useBackup(cluster: string, at = '') {
  const mine = kept.get(cluster) ?? { step: 'start' as Step, scan: '', copy: '', job: '', tried: '' }
  const [step, setStepState] = useState<Step>(mine.step)
  const [policy, setPolicy] = useState<BackupPolicy | null>(null)
  const [scan, setScan] = useState<Scan | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [result, setResult] = useState<CopyResult | null>(null)
  const [reminders, setRemindersState] = useState<Reminders | null>(null)
  const [options, setOptionsState] = useState<Options>({ horizon: 14, whole: false, everything: false,
    codeToHome: false })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [, bump] = useState(0)  // a change kept outside React (tried, the copy) shows right away
  const ref = useRef(mine)
  ref.current = kept.get(cluster) ?? mine

  const save = useCallback((change: Partial<Kept>) => {
    const next = { ...(kept.get(cluster) ?? mine), ...change }
    kept.set(cluster, next)
    ref.current = next
    if (change.step) setStepState(change.step)
    bump((n) => n + 1)
  }, [cluster])  // eslint-disable-line react-hooks/exhaustive-deps -- mine is the first value only
  const setStep = useCallback((s: Step) => save({ step: s }), [save])
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e))

  // the cluster's rules and the last check, once per cluster
  useEffect(() => {
    if (!cluster) return
    let live = true
    setError('')
    call<BackupPolicy>('backup.policy', { cluster }).then((p) => live && setPolicy(p)).catch((e) => live && fail(e))
    call<Reminders>('backup.reminders', { cluster }).then((r) => live && setRemindersState(r)).catch(() => {})
    call<Scan[]>('backup.scans', { cluster, limit: 10 }).then((list) => {
      if (!live) return
      const last = list.find((s) => s.id === ref.current.scan) ?? list[0]
      if (!last) return
      setScan(last)
      setOptionsState((o) => ({ ...o, horizon: last.horizon || o.horizon }))
      if (ref.current.step === 'start' && scanRunning(last)) save({ step: 'scanning', scan: last.id })
      else if (at === 'plan' && last.state === 'done' && ['start', 'risk'].includes(ref.current.step)) {
        save({ step: 'plan', scan: last.id })  // a notice or banner about this scratch: straight to its plan
      }
      else if (!ref.current.scan) save({ scan: last.id })
    }).catch(() => {})
    return () => { live = false }
  }, [cluster, save, at])

  // a check that runs: follow it, then load what it found
  useEffect(() => {
    if (!cluster || step !== 'scanning' || !ref.current.scan) return
    let live = true
    const look = () => call<Scan[]>('backup.scans', { cluster, limit: 10 }).then((list) => {
      if (!live) return
      const s = list.find((x) => x.id === ref.current.scan)
      if (!s) return
      setScan(s)
      if (s.state === 'done') save({ step: 'risk' })
    }).catch(() => {})
    look()
    const t = setInterval(look, POLL_MS)
    return () => { live = false; clearInterval(t) }
  }, [cluster, step, save])

  // what the last finished check found
  useEffect(() => {
    if (!cluster || !ref.current.scan || step === 'start' || step === 'scanning') return
    if (summary?.id === ref.current.scan) return
    let live = true
    call<Summary>('backup.summary', { cluster, id: ref.current.scan })
      .then((s) => live && setSummary(s)).catch((e) => live && fail(e))
    return () => { live = false }
  }, [cluster, step, summary?.id])

  const loadPlan = useCallback(async (changes: Choice[] = [], o: Options = options) => {
    if (!ref.current.scan) return null
    setBusy(true)
    try {
      const p = await call<Plan>('backup.plan', {
        cluster, id: ref.current.scan, horizon_days: o.horizon, scope: o.everything ? 'everything' : 'at_risk',
        whole_folders: o.whole, code_to_home: o.codeToHome, changes,
      })
      setPlan(p)
      setError('')
      return p
    } catch (e) {
      fail(e)
      return null
    } finally {
      setBusy(false)
    }
  }, [cluster, options])

  // the plan, whenever its step shows and none is loaded
  useEffect(() => {
    if ((step === 'plan' || step === 'space' || step === 'copy' || step === 'done') && !plan && summary) loadPlan()
  }, [step, plan, summary, loadPlan])

  // the trial run and the copy both report through backup.progress
  const watching = step === 'copy' ? ref.current.copy : step === 'space' && ref.current.tried === 'running'
    ? ref.current.scan : ''
  useEffect(() => {
    const id = watching
    if (!cluster || !id) return
    let live = true
    const look = () => call<Progress>('backup.progress', { cluster, copy_id: id }).then(async (p) => {
      if (!live) return
      setProgress(p)
      if (step === 'space' && p.state === 'tried') {
        save({ tried: 'yes' })
        await loadPlan()
      } else if (step === 'copy' && ['done', 'failed', 'cancelled'].includes(p.state)) {
        if (p.state === 'cancelled') { save({ step: 'space', copy: '' }); return }
        const r = await call<CopyResult>('backup.result', { cluster, copy_id: id }).catch(() => null)
        if (!live) return
        setResult(r)
        save({ step: 'done' })
        if (p.state === 'done' && r) notify(notices.done, notices.doneText(r.copied_files),
          { kind: 'backup_done', page: 'backup', params: { cluster } }).catch(() => {})
      }
    }).catch(() => {})
    look()
    const t = setInterval(look, POLL_MS)
    return () => { live = false; clearInterval(t) }
  }, [cluster, step, watching, loadPlan, save])

  return {
    step, policy, scan, summary, plan, progress, result, reminders, options, error, busy,
    tried: ref.current.tried, job: ref.current.job,
    setStep,
    clearError: () => setError(''),

    async startScan(everything = false, agent = 'claude') {
      setBusy(true)
      try {
        const r = await call<{ id: string; job_id: string }>('backup.scan',
          { cluster, horizon_days: options.horizon, group: false, agent })
        setSummary(null); setPlan(null); setResult(null); setProgress(null)
        setOptionsState((o) => ({ ...o, everything }))
        save({ step: 'scanning', scan: r.id, copy: '', tried: '', job: r.job_id })
        setError('')
      } catch (e) { fail(e) } finally { setBusy(false) }
    },
    async stopScan() {
      await call('backup.cancel', { cluster, id: ref.current.scan }).catch(fail)
      save({ step: 'start' })
    },
    async openPlan() { save({ step: 'plan', tried: '' }); await loadPlan() },
    async toggle(item: PlanItem, keep: boolean) {
      save({ tried: '' })
      await loadPlan([{ path: item.folder, class: item.kind, keep }])
    },
    async setOptions(change: Partial<Options>) {
      const o = { ...options, ...change }
      setOptionsState(o)
      save({ tried: '' })
      await loadPlan([], o)
    },
    /** Leaves out kept files that can be made again, biggest first, until the copy fits. */
    async leaveOutBiggest() {
      if (!plan) return
      const s = plan.space
      let over = (s.after_gb - s.quota_gb) * 1024 ** 3
      const changes: Choice[] = []
      for (const i of [...plan.items].filter((x) => REMAKE.includes(x.kind) || x.kind === 'unsure')
        .sort((a, b) => b.bytes - a.bytes)) {
        if (over <= 0 && changes.length) break
        changes.push({ path: i.folder, class: i.kind, keep: false })
        over -= i.bytes
      }
      save({ tried: '' })
      if (changes.length) await loadPlan(changes)
    },
    async tryFirst() {
      setBusy(true)
      try {
        await call('backup.dry_run', { cluster, id: ref.current.scan })
        save({ tried: 'running' })
        setProgress(null)
        setError('')
      } catch (e) { fail(e) } finally { setBusy(false) }
    },
    async copy() {
      if (!plan) return
      setBusy(true)
      try {
        const r = await call<{ copy_id: string; job_id: string }>('backup.start',
          { cluster, id: ref.current.scan, confirm: plan.hash })
        setProgress(null)
        save({ step: 'copy', copy: r.copy_id, job: r.job_id })
        setError('')
      } catch (e) { fail(e) } finally { setBusy(false) }
    },
    async stopCopy() {
      await call('backup.cancel', { cluster, id: ref.current.copy }).catch(fail)
      save({ step: 'space', copy: '', tried: '' })
    },
    async setReminders(r: Reminders) {
      try { setRemindersState(await call<Reminders>('backup.set_reminders', { cluster, ...r })) } catch (e) { fail(e) }
    },
    restart() {
      setSummary(null); setPlan(null); setResult(null); setProgress(null)
      save({ step: 'start', copy: '', tried: '' })
    },
  }
}

export type Backup = ReturnType<typeof useBackup>
