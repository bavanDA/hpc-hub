import type { DetailGroup, Job } from '../../types/jobs'

const SHOWN_ON_TOP = new Set(['State', 'Run time'])

/** The groups as the details window lists them: the job's id first (alone while the details load), the SU cost
 * with the resources, and without what the top of the window already says. */
export function detailGroups(groups: DetailGroup[], j: Job): DetailGroup[] {
  const found = groups.map((g) => ({
    ...g, title: g.title === 'Status' ? '' : g.title, rows: [...g.rows.filter((r) => !SHOWN_ON_TOP.has(r.label)),
      ...(g.title === 'Resources' && j.su ? [{ label: 'Hours (SU)', value: j.su }] : [])],
  }))
  const id = { label: 'Job ID', value: j.job_id }
  return found.length ? [{ ...found[0], rows: [id, ...found[0].rows] }, ...found.slice(1)] : [{ title: '', rows: [id] }]
}
