// The three ways the key sign-in screen can talk (the design review's directions A, B and C), kept side by side
// until one is picked: ?variant=a|b|c switches them, B by default. B's words are the real ones (loginStrings.ts,
// shared with GTK); A and C live only here. Once one is picked, delete this file and KeyChecklist.tsx and use
// that one's words in loginStrings.
import type { KeyTest } from '../../types/clusters'
import { fill } from './loginCopy'
import { S } from './loginStrings'

export type Variant = 'a' | 'b' | 'c'

export function variant(): Variant {
  const v = new URLSearchParams(location.search).get('variant')
  return v === 'a' || v === 'c' ? v : 'b'
}

/** The stepper's words (A and B). Empty strings are not shown. */
export type Words = {
  intro: (who: string) => string
  help: string
  stepKey: string
  stepKeyDone: string
  create: string
  found: (file: string) => string
  made: (file: string) => string
  stepAdd: (who: string) => string
  copy: string
  copied: string
  pasteIt: (who: string) => string
  open: string
  pasted: string
  pastedDone: string
  pageNote: (note: string) => string
  stepTest: string
  tryIt: string
  duoNow: string
  tryAgain: string
  signedInAs: (user: string) => string
  change: string
  result: (t: KeyTest, who: string) => string
}

const said = (table: Record<string, string>) => (t: KeyTest, who: string) =>
  fill(table[t.reason ?? ''] ?? t.text, { who, last: t.last ?? '' }).trim()

export const B: Words = {
  intro: (who) => fill(S.KEY_INTRO, { who }),
  help: S.WHATS_A_KEY,
  stepKey: S.STEP_KEY,
  stepKeyDone: S.STEP_KEY_DONE,
  create: S.CREATE_KEY,
  found: (file) => fill(S.KEY_FOUND, { file }),
  made: (file) => fill(S.KEY_MADE, { file }),
  stepAdd: (who) => fill(S.STEP_ADD, { who }),
  copy: S.COPY_KEY,
  copied: S.COPIED,
  pasteIt: (who) => fill(S.PASTE_IT, { who }),
  open: S.OPEN_PAGE,
  pasted: S.PASTED_IT,
  pastedDone: S.PASTED,
  pageNote: (note) => note,
  stepTest: S.STEP_TEST,
  tryIt: S.TRY,
  duoNow: S.DUO_NOW,
  tryAgain: S.TRY_AGAIN,
  signedInAs: (user) => fill(S.SIGNED_IN_AS, { user }),
  change: S.CHANGE,
  result: said(S.TEST),
}

export const A: Words = {
  intro: () => '',
  help: "What's this?",
  stepKey: 'SSH key',
  stepKeyDone: 'SSH key',
  create: 'Create key',
  found: (file) => file,
  made: (file) => file,
  stepAdd: (who) => `Add to ${who}`,
  copy: 'Copy',
  copied: 'Copied',
  pasteIt: () => '',
  open: 'Open key page',
  pasted: 'Done',
  pastedDone: 'Added',
  pageNote: () => 'Campus network or VPN only',
  stepTest: 'Test',
  tryIt: 'Test',
  duoNow: 'Approve the Duo push',
  tryAgain: 'Test again',
  signedInAs: (user) => `Works · ${user}`,
  change: 'Change',
  result: said({
    ok: 'Works',
    not_yet: 'Not active yet. Can take 10 minutes.',
    no_vpn: 'No connection. {who} VPN on?',
    unreachable: 'No connection from this network.',
    host_key: "Server key changed. Ask {who}'s HPC team.",
    unfinished: "Didn't finish: {last}",
    no_ssh: 'No ssh program on this computer.',
  }),
}

/** The checklist's words (C). */
export const C = {
  title: (name: string) => `Set up ${name}`,
  done: (n: number) => `${n} of 3 done`,
  key: 'Create an SSH key',
  keyDone: 'Key ready',
  create: 'Create',
  add: (who: string) => `Paste it on ${who}'s key page`,
  addDone: 'Pasted',
  copy: 'Copy key',
  copied: 'Copied',
  open: 'Open page',
  mark: 'Mark done',
  test: 'Check it works',
  testDone: 'Works',
  check: 'Check',
  duoNow: 'Check your phone for a Duo push.',
  result: said({
    ok: 'Works',
    not_yet: 'Not active yet, give it a few minutes.',
    no_vpn: "Can't get through. Is the {who} VPN on?",
    unreachable: "Can't get through from this network.",
    host_key: "{who}'s server looks different. Ask {who}'s HPC team.",
    unfinished: "That didn't finish: {last}",
    no_ssh: 'No ssh program on this computer.',
  }),
}
