import { beforeEach, describe, expect, it, vi } from 'vitest'

type Handlers = { data: (b: Uint8Array) => void; exit: (code: number) => void }
const h = vi.hoisted(() => ({
  listeners: {} as Record<string, (d: unknown) => void>, opened: [] as Handlers[], typed: [] as string[][],
  connected: false, listing: null as unknown, argv: ['ssh', 'attach'],
}))

vi.mock('../../rpc', () => ({
  on: (name: string, fn: (d: unknown) => void) => { h.listeners[name] = fn; return () => {} },
  call: vi.fn(async (method: string) => {
    if (method === 'terminals.command') return { argv: h.argv, name: 'tmux-1', node: 'n1' }
    if (h.listing === null) throw new Error('Connect first')
    return h.listing
  }),
}))
vi.mock('../app/platform', () => ({ inTauri: true }))
vi.mock('../../theme', () => ({ onThemeChange: () => {} }))
vi.mock('./xterm', () => ({ theme: () => ({}) }))
vi.mock('../clusters/store', () => ({ clusterLabel: () => 'Wulver', isConnected: () => h.connected }))
vi.mock('./scanLinks', () => ({ scanLinks: () => {} }))
vi.mock('./screenText', () => ({ screenText: () => '' }))
vi.mock('./demoShell', () => ({ demoShell: () => {} }))
vi.mock('./pty', () => ({
  ptyOpen: vi.fn(async (_a: string[], _c: number, _r: number, x: Handlers) => { h.opened.push(x); return h.opened.length }),
  ptyClose: vi.fn(async () => {}), ptyWrite: vi.fn(async () => {}), ptyResize: vi.fn(async () => {}),
}))
vi.mock('./makeTab', () => ({
  makeTab: (key: string, f: object) => {
    const hooks: ((d: string) => void)[] = []
    return { key, ...f, argv: null, pty: null, ended: false, error: '', banners: [], lost: '', waiting: false, input: [],
      seen: new Set(), fit: { fit: () => {} }, el: { isConnected: true },
      typeInto: (d: string) => hooks.forEach((fn) => fn(d)),
      term: {
        cols: 80, rows: 24, write: () => {}, buffer: { active: {} }, dispose: () => {},
        onData: (fn: (d: string) => void) => { hooks.push(fn); return { dispose: () => hooks.splice(hooks.indexOf(fn), 1) } },
        onResize: () => ({ dispose: () => {} }),
      } }
  },
}))

import { getState } from './tabStore'
import { openSession } from './tabs'
import type { TmuxSession } from '../../types/terminals'

const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }
const session = { name: 'tmux-1', kind: 'tmux', node: 'n1', title: 'Claude', color: '' } as TmuxSession
const alive = { sessions: [{ name: 'tmux-1', node: 'n1' }] }

async function opened() {
  h.listing = alive
  openSession('wulver', session)
  await flush()
  return getState().tabs[getState().tabs.length - 1] as ReturnType<typeof getState>['tabs'][number] & {
    typeInto: (d: string) => void }
}

describe('a tab that loses its cluster', () => {
  beforeEach(() => {
    h.opened.length = 0
    h.connected = false
    getState().tabs.length = 0
    vi.spyOn(Date, 'now').mockReturnValue(0)
  })

  it('offers to reconnect that cluster, then attaches again by itself', async () => {
    const tab = await opened()
    vi.mocked(Date.now).mockReturnValue(60_000)
    h.listing = null
    h.opened[0].exit(255)
    await flush()
    const note = tab.banners[tab.banners.length - 1]
    expect(note.button).toBe('Reconnect to Wulver')
    expect(note.cluster).toBe('wulver')
    expect(tab.waiting).toBe(true)

    h.listing = alive
    h.listeners.session({ id: 'wulver', connected: true })
    await flush()
    expect(h.opened).toHaveLength(2)
    expect(tab.ended).toBe(false)
    expect(tab.banners).toHaveLength(0)
  })

  it('types each key once after attaching again', async () => {
    const { ptyWrite } = await import('./pty')
    vi.mocked(ptyWrite).mockClear()
    const tab = await opened()
    vi.mocked(Date.now).mockReturnValue(60_000)
    h.opened[0].exit(255)
    await flush()
    expect(h.opened).toHaveLength(2)
    tab.typeInto('a')
    expect(vi.mocked(ptyWrite)).toHaveBeenCalledTimes(1)
  })

  it('says when the session ended while away', async () => {
    const tab = await opened()
    vi.mocked(Date.now).mockReturnValue(60_000)
    h.listing = null
    h.opened[0].exit(255)
    await flush()
    h.listing = { sessions: [] }
    h.listeners.session({ id: 'wulver', connected: true })
    await flush()
    expect(h.opened).toHaveLength(1)
    expect(tab.banners[tab.banners.length - 1].text).toContain('has ended')
  })

  it('does not reattach someone who left on purpose', async () => {
    const tab = await opened()
    vi.mocked(Date.now).mockReturnValue(60_000)
    h.opened[0].exit(0)
    await flush()
    expect(h.opened).toHaveLength(1)
    expect(tab.banners[tab.banners.length - 1].button).toBe('Attach again')
  })
})
