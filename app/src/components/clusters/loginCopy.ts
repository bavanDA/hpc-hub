// What the sign-in screens say. The words are in loginStrings.ts, made from hpc_hub/core/login_copy.py so the
// GTK app and this one say the same thing. The full cluster name only in the title; after that the org or nothing.
import type { Cluster } from '../../types/clusters'
import { S } from './loginStrings'

type Named = Pick<Cluster, 'name' | 'org'>

/** "Sign in to {name}" with name filled in. */
export const fill = (t: string, v: Record<string, string> = {}) => t.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '')
const SHORT = new Map<string, string>()  // full name -> short, for places that only have the name

/** Learn each cluster's short name (clusters/store.ts does it once the list loads). */
export function rememberShort(clusters: Pick<Cluster, 'name' | 'short'>[]) {
  for (const c of clusters) if (c.short) SHORT.set(c.name, c.short)
}

/** "Wulver", "Yale", "SDSC" for "Wulver (NJIT)", "Yale Bouchet", "SDSC Expanse" (config.py short_name). */
export const shortName = (c: { name: string; short?: string }) =>
  c.short || SHORT.get(c.name) || c.name.split(' (')[0]
/** "Yale": the org, else the short name. */
export const who = (c: Named) => c.org || shortName(c)
/** Where "What's an SSH key?" goes: the cluster's own guide, else GitHub's. */
export const keyHelp = (c: Pick<Cluster, 'key_help'>) => c.key_help || S.KEY_HELP

export const copy = {
  signIn: (c: Named) => fill(S.SIGN_IN, { name: c.name }),
  usernameHint: S.USERNAME_HINT,
  password: S.PASSWORD,
  saved: S.SAVED,
  remember: S.REMEMBER,
  rememberOff: S.REMEMBER_OFF,
  codeSetup: S.CODE_SETUP,
  savedIn: S.SAVED_IN,
  skip: S.SKIP,
  continue: S.CONTINUE,
  portal: (_c: Named) => S.PORTAL,
  orPassword: S.OR_PASSWORD,
  keyIntro: (c: Named) => fill(S.KEY_INTRO, { who: who(c) }),
  whatsAKey: S.WHATS_A_KEY,
  usePassword: S.USE_PASSWORD,
  useKey: S.USE_KEY,
  passwordNote: (c: Named) => fill(S.PASSWORD_NOTE, { who: who(c) }),
  forgetTitle: (c: Named) => fill(S.FORGET_TITLE, { short: shortName(c) }),
  forgetBody: (label: string) => fill(S.FORGET_BODY, { label }),
  forget: S.FORGET,
  keep: S.KEEP,
  duoLate: S.DUO_LATE,
  newPush: S.NEW_PUSH,
  portalNote: S.PORTAL_NOTE,
  connectVpn: (c: Named) => fill(S.CONNECT_VPN, { who: who(c) }),
}
