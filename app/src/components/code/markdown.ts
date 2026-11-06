type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'code'; lang: string; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'quote'; text: string }
  | { kind: 'para'; text: string }

/** Simple Markdown as blocks: headings, fenced code, lists, quotes and paragraphs. */
export function parseMarkdown(md: string): Block[] {
  const lines = md.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const fence = line.match(/^\s*(```|~~~)\s*([\w+-]*)/)
    if (fence) {
      const body: string[] = []
      i++
      while (i < lines.length && !lines[i].trimStart().startsWith(fence[1])) body.push(lines[i++])
      i++  // the closing fence (or the end)
      blocks.push({ kind: 'code', lang: fence[2], text: body.join('\n') })
      continue
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2].trim() })
      i++
      continue
    }
    const item = (l: string) => l.match(/^\s*(?:[-*+]|(\d+)[.)])\s+(.*)$/)
    if (item(line)) {
      const ordered = Boolean(item(line)![1])
      const items: string[] = []
      while (i < lines.length && item(lines[i]) && Boolean(item(lines[i])![1]) === ordered) {
        items.push(item(lines[i])![2])
        i++
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !item(lines[i])) items[items.length - 1] += ` ${lines[i++].trim()}`
      }
      blocks.push({ kind: 'list', ordered, items })
      continue
    }
    if (/^\s*>/.test(line)) {
      const body: string[] = []
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ''))
      blocks.push({ kind: 'quote', text: body.join(' ') })
      continue
    }
    if (!line.trim()) {
      i++
      continue
    }
    const body: string[] = []
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|\s*(```|~~~)|\s*>|\s*([-*+]|\d+[.)])\s)/.test(lines[i])) {
      body.push(lines[i++].trim())
    }
    blocks.push({ kind: 'para', text: body.join(' ') })
  }
  return blocks
}
