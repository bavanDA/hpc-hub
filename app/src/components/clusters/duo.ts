// How you answer Duo on a cluster (Settings): the same four ways as hpc_hub/connect/prompts.py's duo_action.
export type DuoMethod = 'push' | 'phone' | 'sms' | 'passcode'

export const DUO_OPTIONS: { value: DuoMethod; label: string }[] = [
  { value: 'push', label: 'Push to Duo Mobile' },
  { value: 'phone', label: 'Phone call' },
  { value: 'sms', label: 'Text message' },
  { value: 'passcode', label: 'Type a passcode' },
]

/** The saved answer as one of the four ("push2" is a second phone's push; an old saved number is a passcode). */
export function duoMethod(answer: string | undefined): DuoMethod {
  const a = (answer ?? '').trim().toLowerCase()
  for (const m of ['push', 'phone', 'sms', 'passcode'] as const) if (a.startsWith(m)) return m
  return /^\d+$/.test(a) ? 'passcode' : 'push'
}

/** What the waiting window says while Duo is on its way (text messages and passcodes ask for a code instead). */
export function duoWaiting(method: DuoMethod): { title: string; text: string } {
  return method === 'phone'
    ? { title: 'Answer the call from Duo', text: 'Duo is calling your phone. Answer, then press any key to approve.' }
    : { title: 'Approve Duo on your phone', text: 'Open Duo Mobile and tap Approve.' }
}
