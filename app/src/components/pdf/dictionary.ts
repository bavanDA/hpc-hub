import { call } from '../../rpc'
import { playOnce } from './audio'

export type Sense = { definition: string; example: string; synonyms: string[] }
export type Entry = { word: string; phonetic?: string; respelling?: string; source?: string
  meanings?: { pos: string; senses: Sense[] }[]; error: string; offline: boolean }

export const lookUp = (word: string) => call<Entry>('readaloud.lookup', { word })

/** The dictionary's recording of the word, or the reader voice saying it. */
export async function hear(word: string, voice: string) {
  const got = await call<{ data: string; mime?: string }>('readaloud.say', { word, voice })
  await playOnce(got.data, got.mime)
}
