// In a plain browser there is no PTY: a pretend shell, so the page looks alive for design work.
import type { Tab } from './tabs'

const ANSWERS: Record<string, string> = {
  ls: 'data  results  thesis  train.py',
  pwd: '/home/jdoe',
  whoami: 'jdoe',
  squeue: '  JOBID PARTITION     NAME  USER ST   TIME NODES NODELIST\r\n 123456   general  jupyter  jdoe  R  42:10     1 n0042',
}

export function demoShell(tab: Tab, scan: (text: string) => void) {
  const { term } = tab
  const host = tab.node || 'login1'
  const prompt = () => term.write(`\x1b[1;32mjdoe@${host}\x1b[0m:\x1b[1;34m~\x1b[0m$ `)
  term.writeln(`\x1b[2mDemo terminal: no cluster in the browser. This is ${tab.title}.\x1b[0m`)
  if (tab.session.includes('vscode') || tab.title.startsWith('VS Code')) {
    const text = 'Open this link in your browser https://vscode.dev/tunnel/abc123/home/jdoe'
    term.writeln(text)
    scan(text)
  }
  prompt()
  let line = ''
  term.onData((d) => {
    for (const ch of d) {
      if (ch === '\r') {
        const cmd = line.trim()
        term.write('\r\n')
        if (cmd) term.writeln(cmd === 'hostname' ? host : ANSWERS[cmd] ?? `${cmd.split(' ')[0]}: not in the demo`)
        line = ''
        prompt()
      } else if (ch === '\x7f') {
        if (line) term.write('\b \b')
        line = line.slice(0, -1)
      } else if (ch === '\x03') {
        term.write('^C\r\n')
        line = ''
        prompt()
      } else if (ch >= ' ') {
        line += ch
        term.write(ch)
      }
    }
  })
}
