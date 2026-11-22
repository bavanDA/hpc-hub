export type Choice = { id: string; name: string; short?: string; org?: string; host: string; vpn: boolean; second_factor: string }

export type SetupStatus = { first_run: boolean; chosen: string[]; choices: Choice[] }

/** "NJIT" under "Wulver" (named "Wulver (NJIT)"); nothing when the name starts with it ("Yale Bouchet"). */
export function university(c: Choice): string {
  return c.org && (c.name.includes(`(${c.org})`) || !c.name.includes(c.org)) ? c.org : ''
}

// A cluster turned on in Settings gets the same sign-in step as first-time setup when it has no saved username
// (2026-11-21 reports: Yale was turned on, its card never asked for a NetID or password, and Connect failed with
// "Add your Yale Bouchet username in the cluster's settings first"). The window reloads with ?setup=<id>.
const SETUP = 'setup'

/** The address that opens the sign-in step for this cluster. */
export function setupUrl(href: string, id: string): string {
  const u = new URL(href)
  u.searchParams.set(SETUP, id)
  return u.toString()
}

/** The address again without it, once signed in (or skipped). */
export function withoutSetup(href: string): string {
  const u = new URL(href)
  u.searchParams.delete(SETUP)
  return u.toString()
}

/** The cluster whose sign-in step to show: one asked for in the address that you use; else ''. */
export function setupFor(search: string, chosen: string[]): string {
  const id = new URLSearchParams(search).get(SETUP) ?? ''
  return chosen.includes(id) ? id : ''
}

/** Whether a cluster just turned on still needs your sign-in (no username saved). */
export const needsSignIn = (login: { ssh?: { username?: string } } | null) => !login?.ssh?.username
