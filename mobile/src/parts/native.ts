// What only Android can do: pick files, save into Downloads, open or share a file, keep connected in the background.
// The Kotlin side (FilesPlugin.kt, KeepAliveService.kt) comes in a later step; until then each call says so.

/** A file you picked, copied into the app's cache so the backend can read it. */
export type PickedFile = { name: string; path: string; size: number; mime: string }

const notYet = (what: string) => new Error(`${what} is not on the phone yet`)

/** Android's file picker: the chosen files, copied into the cache (upload them, then they're deleted). */
export async function pickFiles(_options: { multiple?: boolean; mime?: string[] } = {}): Promise<PickedFile[]> {
  throw notYet('Picking files')
}

/** Moves a file from the cache into Downloads/HPC Hub and answers where it ended up. */
export async function saveToDownloads(_cachePath: string, _name: string): Promise<string> {
  throw notYet('Saving to Downloads')
}

/** Opens a downloaded file in the app Android picks (a PDF viewer, a gallery). */
export async function openWith(_path: string, _mime?: string): Promise<void> {
  throw notYet('Opening files')
}

/** Android's share sheet, with a file or plain text. */
export async function share(_what: { path?: string; text?: string; title?: string }): Promise<void> {
  throw notYet('Sharing')
}

/** Keeps the app's connections alive in the background, with a "Connected to Wulver" notification. */
export async function keepAlive(_on: boolean, _text?: string): Promise<void> {
  throw notYet('Staying connected in the background')
}
