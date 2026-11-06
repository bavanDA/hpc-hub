import type { ReactNode } from 'react'

import { GLOSSARY, type TermName } from './glossary'

/** A word with its explanation on hover. children: the word as shown (defaults to the glossary key). */
export function Term({ name, children }: { name: TermName; children?: ReactNode }) {
  return (
    <span title={GLOSSARY[name]} className="cursor-help underline decoration-dotted decoration-1 underline-offset-2">
      {children ?? name}</span>
  )
}
