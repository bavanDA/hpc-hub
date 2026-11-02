// Demo data for the first start and Settings' cluster list. ?welcome=1 shows the welcome screen.
const choices = [
  { id: 'wulver', name: 'Wulver (NJIT)', short: 'Wulver', org: 'NJIT', host: 'wulver.njit.edu', vpn: true, second_factor: 'duo' },
  { id: 'yale', name: 'Yale Bouchet', short: 'Yale', org: 'Yale', host: 'bouchet.ycrc.yale.edu', vpn: true, second_factor: 'duo' },
  { id: 'sdsc', name: 'SDSC Expanse', short: 'SDSC', org: 'SDSC', host: 'login.expanse.sdsc.edu', vpn: false, second_factor: 'code' },
]

export const answers: Record<string, unknown> = {
  'setup.status': () => ({ first_run: new URLSearchParams(location.search).has('welcome'),
    chosen: ['wulver', 'yale', 'sdsc'], choices }),
  'setup.choose': ({ ids }: { ids: string[] }) => ({ first_run: false, chosen: ids, choices }),
}
