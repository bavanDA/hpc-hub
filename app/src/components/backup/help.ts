/** Who to write to when copies don't match. Only help desks the clusters publish. */
const HELP: Record<string, string> = { wulver: 'hpc@njit.edu' }
export const helpFor = (cluster: string) => HELP[cluster] ?? 'your cluster\'s help desk'
