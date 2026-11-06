export type Choice = { id: string; name: string; short?: string; org?: string; host: string; vpn: boolean; second_factor: string }

export type SetupStatus = { first_run: boolean; chosen: string[]; choices: Choice[] }

/** "NJIT" under "Wulver" (named "Wulver (NJIT)"); nothing when the name starts with it ("Yale Bouchet"). */
export function university(c: Choice): string {
  return c.org && (c.name.includes(`(${c.org})`) || !c.name.includes(c.org)) ? c.org : ''
}
