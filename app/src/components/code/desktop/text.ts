const LOG = /\.(out|err|log)$/i

export const isLog = (path: string) => LOG.test(path)

export const lineCount = (text: string) => text.split('\n').length

/** a, b and c */
export const andList = (names: string[]) =>
  names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`

export const linesLabel = (from: number, to: number) => `${from}${to > from ? ` to ${to}` : ''}`

export const parentDir = (path: string) => path.replace(/\/[^/]*$/, '') || '/'

export const terminalCount = (n: number) => (n ? `${n} terminal${n > 1 ? 's' : ''}` : 'Terminal')
