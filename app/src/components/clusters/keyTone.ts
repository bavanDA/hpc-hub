import { AlertCircle, CheckCircle2, Clock } from 'lucide-react'

export const TONE = { ok: ['', CheckCircle2], wait: ['text-dim', Clock], error: ['font-semibold text-bad', AlertCircle] } as const
