import { Eye, EyeOff } from 'lucide-react'
import { useState, type InputHTMLAttributes, type ReactNode } from 'react'

import { BOX } from './styles'

export function Field({ label, type, ...props }: { label: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  const [shown, setShown] = useState(false)
  const secret = type === 'password'
  return (
    <label className="block py-1.5">
      <span className="mb-1.5 block text-sm text-dim">{label}</span>
      <span className="relative block">
        <input spellCheck={false} autoComplete="off" {...props} type={secret && shown ? 'text' : type}
          className={`h-10 ${BOX} ${secret ? 'pr-10' : ''}`} />
        {secret && <button type="button" aria-label={shown ? 'Hide' : 'Show'} onClick={() => setShown(!shown)}
          className="absolute top-1 right-1 grid size-8 place-items-center rounded-md text-dim hover:bg-hover">
          {shown ? <EyeOff size={16} /> : <Eye size={16} />}</button>}
      </span>
    </label>
  )
}
