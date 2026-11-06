import { Minus, Moon, Plus, Search, Sun } from 'lucide-react'
import type { ReactNode } from 'react'

import { FocusButton } from './FocusButton'
import { Tool } from './tool'
import { ZOOMS, type Scale } from './zoom'

type Props = {
  has: boolean
  compact?: boolean
  hidden: boolean
  pages: number
  pageText: string
  onPageText: (t: string) => void
  onPage: () => void
  scale: Scale
  onZoom: (value: string) => void
  onZoomIn: () => void
  onZoomOut: () => void
  searching: boolean
  onSearch: () => void
  dark: boolean
  onDark: () => void
  extra?: ReactNode
  onFocus: () => void
}

export function PdfToolbar({ has, compact, hidden, pages, pageText, onPageText, onPage, scale, onZoom, onZoomIn,
  onZoomOut, searching, onSearch, dark, onDark, extra, onFocus }: Props) {
  const preset = ZOOMS.some(([v]) => v === scale.value)
  return (
    <div className={`flex h-10 shrink-0 items-center gap-1 border-b border-line bg-header px-1.5 text-sm pointer-coarse:h-14 pointer-coarse:overflow-x-auto ${
      hidden ? 'hidden' : ''}`}>
      <div className="flex items-center gap-1 px-1 tabular-nums text-dim">
        <input value={pageText} disabled={!has} aria-label="Page"
          onChange={(e) => onPageText(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && onPage()} onBlur={onPage}
          className="h-7 w-9 rounded-md bg-pill text-center pointer-coarse:h-11 text-text outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus" />
        <span className="whitespace-nowrap">/ {has ? pages || '…' : '…'}</span>
      </div>
      <div className="mx-auto flex items-center gap-0.5">
        <Tool label="Zoom out (Ctrl+-)" disabled={!has} onClick={onZoomOut}>
          <Minus size={16} /></Tool>
        <select value={preset ? scale.value : 'custom'} disabled={!has} aria-label="Zoom"
          onChange={(e) => onZoom(e.target.value)}
          className={`h-7 rounded-md bg-pill px-1.5 text-sm outline-none pointer-coarse:h-11 pointer-coarse:w-[116px] ${compact ? 'w-[86px]' : 'w-[98px]'}`}>
          {!preset && <option value="custom">{scale.percent}%</option>}
          {ZOOMS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>
        <Tool label="Zoom in (Ctrl++)" disabled={!has} onClick={onZoomIn}>
          <Plus size={16} /></Tool>
      </div>
      <Tool label="Search (Ctrl+F)" on={searching} disabled={!has} onClick={onSearch}><Search size={16} /></Tool>
      {!compact && <Tool label={dark ? 'Light pages' : 'Dark pages'} on={dark} onClick={onDark}>
        {dark ? <Sun size={16} /> : <Moon size={16} />}</Tool>}
      {extra}
      {!compact && <FocusButton onClick={onFocus} />}
    </div>
  )
}
