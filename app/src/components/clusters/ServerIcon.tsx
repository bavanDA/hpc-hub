// GNOME's network-server icon, which the GTK cards show; lucide has no close match.
export function ServerIcon({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4}
      className="shrink-0" aria-hidden>
      <rect x="1.7" y="1.7" width="12.6" height="7.6" rx="2.6" />
      <circle cx="5" cy="5.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="7.8" cy="5.5" r="0.9" fill="currentColor" stroke="none" />
      <path d="M8 9.3v2.4M1.2 13.6h4.9M9.9 13.6h4.9" strokeLinecap="round" />
      <circle cx="8" cy="13.6" r="1.6" />
    </svg>
  )
}
