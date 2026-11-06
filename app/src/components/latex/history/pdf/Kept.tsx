export function Kept({ clusterName, seconds, cached, what }: { clusterName: string; seconds: number; cached: boolean; what: string }) {
  return (
    <span className="absolute right-3 bottom-3 rounded-full border border-line bg-raised px-3 py-1.5 text-sm text-dim
      shadow-md">{cached ? `${what} kept from before` : `${what} built on ${clusterName} in ${seconds} s, kept for next time`}</span>
  )
}
