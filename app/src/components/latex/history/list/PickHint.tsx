export function PickHint({ end, onCancel }: { end: 'from' | 'to'; onCancel: () => void }) {
  return <div className="mx-2.5 mb-1.5 rounded-lg bg-accent-soft px-3 py-1.5 text-sm">Pick the
    {end === 'from' ? ' From' : ' To'} version in the list. <button className="underline"
      onClick={onCancel}>Cancel</button></div>
}
