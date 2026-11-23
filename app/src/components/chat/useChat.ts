// One Claude tab's chat while it is shown: the conversation read on from where the last read stopped, and what
// waits on you, every couple of seconds. Kept per tab, so switching to the terminal and back loses nothing.
import { useCallback, useEffect, useState } from 'react'

import { call } from '../../rpc'
import type { Tab } from '../terminals/tabs'
import { COMMANDS, type Mode, type ReadAnswer, type Screen } from './model'
import { empty, merge, type State } from './state'

const EVERY_MS = 1500
const NEW_FILE_MS = 60_000  // after /clear, how long a newer file in the folder is taken as this chat's

const states = new Map<string, State>()

export const chatState = (key: string) => {
  let s = states.get(key)
  if (!s) { s = empty(); states.set(key, s) }
  return s
}

export function useChat(tab: Tab, shown: boolean) {
  const [state, setState] = useState<State>(() => chatState(tab.key))
  const put = useCallback((next: State) => { states.set(tab.key, next); setState(next) }, [tab.key])
  const where = { cluster: tab.cluster, session: tab.session, node: tab.node }

  useEffect(() => {
    if (!shown || tab.ended) return
    let stop = false
    let timer: ReturnType<typeof setTimeout>
    const tick = async () => {
      const s = chatState(tab.key)
      const since = s.since && Date.now() - s.since < NEW_FILE_MS ? s.since / 1000 : 0
      try {
        const [r, screen] = await Promise.all([
          call<ReadAnswer>('chat.read', { cluster: tab.cluster, session: tab.session, file: s.file,
            offset: s.offset, since }),
          call<Screen>('chat.screen', { cluster: tab.cluster, session: tab.session, node: tab.node }),
        ])
        if (stop) return
        put({ ...merge(chatState(tab.key), r), screen })
      } catch (e) {
        if (!stop) put({ ...chatState(tab.key), error: e instanceof Error ? e.message : String(e) })
      }
      if (!stop) timer = setTimeout(tick, document.hidden ? EVERY_MS * 4 : EVERY_MS)
    }
    void tick()
    return () => { stop = true; clearTimeout(timer) }
  }, [shown, tab.key, tab.cluster, tab.session, tab.node, tab.ended, put])

  /** Typed into Claude as one paste, then Enter, as if you typed it in the terminal; what was in Claude's input box
   * is cleared first (chat.send), so your message never runs into it. */
  const send = async (text: string) => {
    await call('chat.send', { ...where, text })
    if (COMMANDS.find((c) => c.newChat && text.trim().startsWith(c.name))) {
      put({ ...chatState(tab.key), since: Date.now() })
    }
  }
  const key = (k: string) => call('chat.key', { ...where, key: k })
  /** Esc only while Claude works: a second Esc on an idle Claude opens its rewind menu. */
  const stop = () => call('chat.stop', where)
  const mode = async (m: Mode) => {
    const screen = await call<Screen>('chat.mode', { ...where, mode: m })
    put({ ...chatState(tab.key), screen })
  }
  return { state, send, key, stop, mode }
}
