'use client'

import Link from 'next/link'
import { NavIcon, type NavIconName } from '@/components/layout/NavIcons'

interface SidebarSectionProps {
  href: string
  label: string
  icon: NavIconName
  active: boolean
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}

/**
 * A split-click parent row: the label navigates to the section's landing page,
 * the chevron toggles its children. Two sibling controls, never nested —
 * the same pattern as Notion's sidebar and the GitHub file tree.
 */
export function SidebarSection({ href, label, icon, active, open, onToggle, children }: SidebarSectionProps) {
  return (
    <div>
      <div
        className={[
          'flex items-center rounded-md pr-1 border-l-2',
          active
            ? 'bg-[color:var(--sidebar-accent)] text-[color:var(--sidebar-accent-foreground)] border-[color:var(--sidebar-primary)]'
            : 'text-[color:var(--sidebar-muted)] hover:bg-[color:var(--sidebar-accent)] hover:text-[color:var(--sidebar-accent-foreground)] border-transparent',
        ].join(' ')}
      >
        <Link href={href} className="flex flex-1 items-center gap-[10px] px-3 py-2 text-sm font-medium min-w-0">
          <NavIcon name={icon} />
          <span className="truncate">{label}</span>
        </Link>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={open ? `Collapse ${label}` : `Expand ${label}`}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded"
        >
          <span aria-hidden className={`text-[10px] transition-transform duration-150 ${open ? '' : '-rotate-90'}`}>
            &#9662;
          </span>
        </button>
      </div>
      {open && <div className="mt-0.5 space-y-0.5">{children}</div>}
    </div>
  )
}
