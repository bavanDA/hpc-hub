import { call } from '../../rpc'

export type Voice = { id: string; label: string }
type Voices = { voices: Voice[]; default: string }

let list: Promise<Voices> | null = null

export const voices = () => (list ??= call<Voices>('readaloud.voices').catch((e) => { list = null; throw e }))
