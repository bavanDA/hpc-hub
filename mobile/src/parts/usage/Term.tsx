// An HPC word on the phone: dotted underline, and a tap on its row shows what it means (no hover on a phone).
import { useState, type ReactNode } from 'react'

import { GLOSSARY, type TermName } from '@shared/components/Term'
import { BottomSheet, Row } from '../../ui'

export function TermRow({ name, label, value, sub }:
  { name: TermName; label: ReactNode; value?: ReactNode; sub?: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Row label={<span className="underline decoration-dotted decoration-1 underline-offset-4">{label}</span>}
        sub={sub} value={value} onPress={() => setOpen(true)} />
      {open && <BottomSheet onClose={() => setOpen(false)}>
        <h2 className="text-lg font-semibold">{label}</h2>
        <p className="pt-1 pb-2 text-dim">{GLOSSARY[name]}</p>
      </BottomSheet>}
    </>
  )
}
