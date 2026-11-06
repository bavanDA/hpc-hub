import type { ReactNode } from 'react'

export const GLOSSARY = {
  node: 'One computer in the cluster. A compute node runs your work; you borrow it for a set time.',
  'login node': "The shared entry computer. Fine for editing and submitting jobs; don't run heavy work here.",
  queue: 'Which group of nodes and time limits your job uses (Slurm calls it a partition).',
  priority: 'How your job is billed and how soon it starts (Slurm calls it QoS).',
  group: 'The account your hours are billed to. Empty: your default group.',
  su: "Service units, the cluster's currency. 1 SU is roughly 1 core for 1 hour.",
  'core hours': 'Cores times hours used. Free queues count here but cost 0 SU.',
  job: 'One request for cluster time. Your node, VS Code and agents each run as a job.',
  session: 'A terminal or agent that keeps running on the cluster.',
  globus: 'Copies big folders between clusters, even with the app closed.',
} as const

export type TermName = keyof typeof GLOSSARY

/** A word with its explanation on hover. children: the word as shown (defaults to the glossary key). */
export function Term({ name, children }: { name: TermName; children?: ReactNode }) {
  return (
    <span title={GLOSSARY[name]} className="cursor-help underline decoration-dotted decoration-1 underline-offset-2">
      {children ?? name}</span>
  )
}
