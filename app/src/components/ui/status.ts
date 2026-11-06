export type Status = 'success' | 'info' | 'warning' | 'danger' | 'neutral'

/** For session states ("Connected", "Approve Duo on your phone") and Slurm job states ("RUNNING"). */
export function statusKind(state: string): Status {
  const s = state.toLowerCase()
  if (/^(connected|running|done|ready|succeeded|active)\b/.test(s)) return 'success'
  if (/duo|pending|waiting|queued|held|suspended|requeued/.test(s)) return 'warning'
  if (/error|fail|timeout|timed out|out_of_memory|node_fail|boot_fail|deadline|preempted|lost/.test(s)) return 'danger'
  if (/connecting|signing|vpn|requesting|transferring|configuring|completing|starting|copying|sending|resizing/
    .test(s)) return 'info'
  return 'neutral'
}
