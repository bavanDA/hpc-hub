// Demo answers for the app menu, Preferences, links, and upload and download.
import type { Preferences, Profiles } from '../components/app/types'

const prefs: Preferences = { browser_profile: 'Uni', experimental: false, select_to_copy: true }

const profiles: Profiles = {
  profiles: [
    { folder: 'Default', name: 'Home', email: 'jdoe@example.com' },
    { folder: 'Profile 2', name: 'Uni', email: 'jdoe@university.example.edu' },
  ],
  default: 'Uni',
}

export const answers: Record<string, unknown> = {
  'browser.profiles': () => ({ ...profiles, default: prefs.browser_profile }),
  'browser.open': false,
  'preferences.get': () => ({ ...prefs }),
  'app.status': { blocked: false, message: '' },
  'preferences.set': (p: Partial<Preferences>) => Object.assign(prefs, p) && { ...prefs },
  'files.upload': { id: 'demo-up' },
  'files.download': (p: { remote_path: string; local_dir: string }) =>
    ({ id: 'demo-down', path: `${p.local_dir}/${p.remote_path.split('/').pop()}` }),
}
