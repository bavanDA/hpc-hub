import { describe, expect, it } from 'vitest'

import { ghDetails, ghGuide } from './github'

// octocat-example and example/paper are made up
describe('a sign-in GitHub turned down', () => {
  it('is a github-auth error with what gh is like', () => {
    expect(ghDetails('github-auth', { gh: 'no-access', account: 'octocat-example', repo: 'example/paper' }))
      .toEqual({ gh: 'no-access', account: 'octocat-example', repo: 'example/paper' })
    expect(ghDetails('github-auth', null)).toEqual({ gh: 'signed-out', account: '', repo: '' })
    expect(ghDetails('github-auth', { gh: 'odd', account: 3 })).toEqual({ gh: 'signed-out', account: '', repo: '' })
  })

  it('is nothing for other errors', () => {
    expect(ghDetails(undefined, { gh: 'missing' })).toBeNull()
    expect(ghDetails('not-installed', {})).toBeNull()
    expect(ghDetails('', undefined)).toBeNull()
  })

  it('offers to install gh when it is not there', () => {
    const g = ghGuide({ gh: 'missing', account: '', repo: 'example/paper' })
    expect(g.button).toBe('Install gh and sign in')
    expect(g.steps.join(' ')).toContain('example/paper')
    expect(g.steps.join(' ')).toContain('no root')
    expect(g.steps.at(-1)).toContain('Try again')
  })

  it('signs in with gh when gh is not signed in', () => {
    const g = ghGuide({ gh: 'signed-out', account: '', repo: 'example/paper' })
    expect(g.button).toBe('Sign in with GitHub (gh)')
    expect(g.steps.join(' ')).toContain('not signed in')
    expect(g.steps.join(' ')).toContain('github.com/login/device')
  })

  it('names the account that has no access, and who can fix it', () => {
    const g = ghGuide({ gh: 'no-access', account: 'octocat-example', repo: 'example/paper' })
    expect(g.title).toBe('octocat-example has no access to example/paper')
    expect(g.button).toBe('Sign in with GitHub (gh)')
    expect(g.steps.join(' ')).toContain('Ask the owner of example/paper to add octocat-example')
  })

  it('explains gh auth setup-git as optional, every time', () => {
    for (const gh of ['missing', 'signed-out', 'no-access'] as const) {
      const g = ghGuide({ gh, account: 'octocat-example', repo: '' })
      expect(g.setupGit).toContain('Optional: run gh auth setup-git')
      expect(g.steps.join(' ')).not.toContain('undefined')
    }
  })
})
