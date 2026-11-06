import { useSyncExternalStore } from 'react'

import { getState, subscribe, type TabState } from './tabStore'

export function useTabs(): TabState {
  return useSyncExternalStore(subscribe, getState)
}
