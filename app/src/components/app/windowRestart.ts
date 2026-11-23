import { invoke } from '@tauri-apps/api/core'

import { inTauri } from './platform'

export const RESTARTED = 'HPC Hub\'s window stopped and was loaded again. Your clusters, jobs and terminals kept running.'

/** The window just came back after the process drawing it stopped (window_crash.rs): what to tell you, once. */
export async function restartNote(): Promise<string | null> {
  if (!inTauri) return null
  const restarted = await invoke<boolean>('window_restarted').catch(() => false)
  return restarted ? RESTARTED : null
}
