import type { AskContext, AskKind } from '../../types/code'

const SHORT: Record<AskKind, string> = {
  explain: 'Explain what this code does.',
  fix: 'Fix this error.',
  test: 'Write a test for this code.',
  free: '',
}

/** The message a running agent gets: where the code is, then the question, then the error when there is one. */
export function messageFor(ctx: AskContext, kind: AskKind, question: string, errorText = ''): string {
  const where = ctx.from_line
    ? `In ${ctx.path} lines ${ctx.from_line} to ${ctx.to_line ?? ctx.from_line}:`
    : `In ${ctx.path}:`
  const ask = [SHORT[kind], question.trim()].filter(Boolean).join(' ')
  const error = errorText.trim() ? `\n\nThe error:\n${errorText.trim()}` : ''
  return `${where} ${ask}${error}`
}
