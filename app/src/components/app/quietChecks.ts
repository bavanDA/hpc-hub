// When the quiet update check (updates.ts: a quick fix, with Beta updates on also a beta and a release) runs. Each
// check opens a new HTTPS connection, so: every minute while the window shows, every 15 minutes while it is hidden
// (minimized, closed to the tray), and once right away when it shows again after a minute or more.
export const SHOWN_EVERY_MS = 60_000
export const HIDDEN_EVERY_MS = 15 * 60_000
const EARLY_MS = 2_000  // a timer that fires a little early still counts as on time

/** Whether a check is due: last is when the last one ran, hidden is document.hidden. */
export function checkDue(now: number, last: number, hidden: boolean): boolean {
  return now - last >= (hidden ? HIDDEN_EVERY_MS : SHOWN_EVERY_MS) - EARLY_MS
}

/** check, run when due. tick: for a timer every SHOWN_EVERY_MS; shown: for visibilitychange. The clock starts now,
 * so the first check is a minute away. */
export function quietChecks(check: () => void, now: () => number, hidden: () => boolean) {
  let last = now()
  const run = () => { last = now(); check() }
  return {
    tick: () => { if (checkDue(now(), last, hidden())) run() },
    shown: () => { if (!hidden() && checkDue(now(), last, false)) run() },
  }
}
