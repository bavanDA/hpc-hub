import type { FileClass } from '../../types/backup'

export const CLASS: Record<FileClass, string> = {
  results: 'Results', code: 'Code', writing: 'Writing and notes', inputs: 'Inputs and settings', logs: 'Logs',
  regen: 'Can be made again', checkpoint: 'Can be made again', unsure: 'Not sure',
}

/** Kinds of files that can be made again: the first to leave out when project is short of space. */
export const REMAKE: FileClass[] = ['regen', 'checkpoint']
