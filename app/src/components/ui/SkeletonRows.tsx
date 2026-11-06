import { Skeleton } from './Skeleton'

export function SkeletonRows({ rows = 5, height = 40 }: { rows?: number; height?: number }) {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} style={{ height }} className="flex items-center gap-3 border-b border-line px-4">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-3.5 flex-1" />
          <Skeleton className="h-3.5 w-16" />
        </div>
      ))}
    </div>
  )
}
