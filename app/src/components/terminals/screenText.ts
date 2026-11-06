type Line = { isWrapped: boolean; translateToString(trimRight?: boolean): string }
type Buffer = { length: number; getLine(y: number): Line | undefined }

/** The last few hundred lines, with wrapped lines joined back. */
export function screenText(buf: Buffer, last = 300): string {
  const lines: string[] = []
  for (let y = Math.max(0, buf.length - last); y < buf.length; y++) {
    const line = buf.getLine(y)
    if (!line) continue
    const text = line.translateToString(true)
    if (line.isWrapped && lines.length) lines[lines.length - 1] += text
    else lines.push(text)
  }
  return lines.join('\n')
}
