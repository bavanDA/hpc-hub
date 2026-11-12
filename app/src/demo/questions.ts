// The browser preview's sign-in questions (?question=chrome-window|web-login|confirm, &cluster=id), for design work.
import type { Question } from '../types/clusters'

export const DEMO_CLUSTER = 'wulver'  // the cluster the preview's dialogs use when the address names none

const DEMO_NAMES: Record<string, string> = { wulver: 'Wulver (NJIT)', yale: 'Yale Bouchet', sdsc: 'SDSC Expanse' }

export function demoQuestions(demo: URLSearchParams | null): Question[] {
  const kind = demo?.get('question') as Question['kind'] | undefined
  const cluster = demo?.get('cluster') ?? DEMO_CLUSTER
  const confirm = kind === 'confirm' ? { title: 'Let HPC Hub start the VPN',
    prompt: 'Your computer asks for your permission once. After that, Connect starts the VPN by itself.' } : {}
  return kind ? [{ id: 'demo', kind, cluster, name: DEMO_NAMES[cluster] ?? cluster, default: '',
    fill: { socket: '', token: '' }, ...confirm }] : []
}
