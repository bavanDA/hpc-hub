// What the sign-in screens say. The words are in loginStrings.ts, made from hpc_hub/core/login_copy.py so the
// GTK app and this one say the same thing. The full cluster name only in the title; after that the org or nothing.
import type { Cluster } from '../../types/clusters'
import { S } from './loginStrings'

type Named = Pick<Cluster, 'name' | 'org'>

/** "Sign in to {name}" with name filled in. */
export const fill = (t: string, v: Record<string, string> = {}) => t.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '')
/** "Wulver" for "Wulver (NJIT)". */
export const shortName = (c: Pick<Cluster, 'name'>) => c.name.split(' (')[0]
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
  savedIn: (store: string) => fill(S.SAVED_IN, { store }),
  skip: S.SKIP,
  continue: S.CONTINUE,
  portal: (c: Named) => fill(S.PORTAL, { short: shortName(c) }),
  orPassword: S.OR_PASSWORD,
  keyIntro: (c: Named) => fill(S.KEY_INTRO, { who: who(c) }),
  whatsAKey: S.WHATS_A_KEY,
  usePassword: S.USE_PASSWORD,
  useKey: S.USE_KEY,
}
