import type { CSSProperties, ReactNode } from 'react'
import type { OrgBranding } from '@/lib/types'
import { accentForTextOnWhite, readableTextOn } from '@/lib/branding'

// Neutral theme = the document's current grey/near-black look, so absent
// branding is pixel-stable with today's output.
export const DEFAULT_ACCENT = '#111827'
export const DEFAULT_SECONDARY = '#4b5563'

/**
 * OrgBranding → CSS custom properties (spec §2 theming mechanism).
 *   --proposal-accent         raw accent, for filled surfaces (buttons, hero)
 *   --proposal-accent-text    text color ON accent surfaces (WCAG-derived)
 *   --proposal-accent-ink     accent as text/links on white, AA-clamped
 *   --proposal-secondary      raw secondary, for filled surfaces
 *   --proposal-secondary-ink  secondary as text on white, AA-clamped
 * Shared proposal components style against these variables only; builder
 * canvas, public page, and print all render inside <ProposalTheme>.
 */
export function proposalThemeVars(branding?: OrgBranding): Record<string, string> {
  const accent = branding?.accent_color ?? DEFAULT_ACCENT
  const secondary = branding?.secondary_color ?? DEFAULT_SECONDARY
  return {
    '--proposal-accent': accent,
    '--proposal-accent-text': readableTextOn(accent),
    '--proposal-accent-ink': accentForTextOnWhite(accent),
    '--proposal-secondary': secondary,
    '--proposal-secondary-ink': accentForTextOnWhite(secondary),
  }
}

export function ProposalTheme({
  branding,
  className,
  children,
}: {
  branding?: OrgBranding
  className?: string
  children: ReactNode
}) {
  return (
    <div className={className} style={proposalThemeVars(branding) as CSSProperties}>
      {children}
    </div>
  )
}
