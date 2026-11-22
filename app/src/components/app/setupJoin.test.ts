import { describe, expect, it } from 'vitest'

import appSource from '../../App.tsx?raw'
import prefsSource from './Preferences.tsx?raw'
import { needsSignIn, setupFor, setupUrl, withoutSetup } from './setup'

// 2026-11-21 reports from Windows: Yale turned on in Settings never asked for a NetID or password, and Connect
// failed with "Add your Yale Bouchet username in the cluster's settings first"
describe('a cluster turned on in Settings asks you to sign in', () => {
  const HOME = 'http://tauri.localhost/?page=clusters'

  it('a cluster with no saved username needs the sign-in step', () => {
    expect(needsSignIn({ ssh: { username: '' } })).toBe(true)
    expect(needsSignIn({})).toBe(true)
    expect(needsSignIn(null)).toBe(true)  // the login couldn't be read: ask rather than fail on Connect
    expect(needsSignIn({ ssh: { username: 'jdoe' } })).toBe(false)  // turned on again later: nothing to ask
  })

  it('the address opens that cluster\'s step, and goes back without it', () => {
    const url = setupUrl(HOME, 'yale')
    expect(setupFor(new URL(url).search, ['wulver', 'yale'])).toBe('yale')
    expect(withoutSetup(url)).toBe(HOME)
  })

  it('only for a cluster you use; nothing asked otherwise', () => {
    expect(setupFor('?setup=yale', ['wulver'])).toBe('')  // turned off again meanwhile
    expect(setupFor('?setup=', ['wulver'])).toBe('')
    expect(setupFor('?page=clusters', ['wulver', 'yale'])).toBe('')
  })

  it('Settings sends a cluster just turned on, with no login, to its sign-in step', () => {
    expect(prefsSource).toMatch(/if \(on && needsSignIn\(login\)\) location\.replace\(setupUrl\(location\.href, c\.id\)\)/)
  })

  it('the window shows first-time setup\'s sign-in step for it, then the app', () => {
    expect(appSource).toContain('setupFor(location.search, setup.chosen)')
    expect(appSource).toContain('<Onboarding ids={[joining]} onDone={() => location.replace(withoutSetup(location.href))} />')
  })
})
