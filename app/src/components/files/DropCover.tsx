import { Upload } from 'lucide-react'

/** Over the folder while files from this computer are dragged onto it. */
export function DropCover({ where }: { where: string }) {
  return (
    <div className="pointer-events-none absolute inset-2 grid place-items-center rounded-xl border-2 border-dashed
      border-accent bg-window/85">
      <div className="flex flex-col items-center gap-2 p-6 text-center">
        <Upload size={28} className="text-accent" />
        <p className="text-lg font-semibold">Drop to upload</p>
        <p className="font-mono text-sm break-all text-dim">{where}</p>
      </div>
    </div>
  )
}
