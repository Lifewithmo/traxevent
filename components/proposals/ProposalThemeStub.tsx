// ============================================================================
// TEMPORARY TRACK-C STUB — DELETE AT INTEGRATION
//
// Stand-in for Track B's components/proposals/ProposalTheme.tsx (spec §2):
// one provider mapping OrgBranding → CSS custom properties on a wrapper so
// builder canvas, public page, and print all style against the same
// variables. Track B's real provider adds the WCAG contrast clamp; this stub
// only maps colors and defaults. The integration session swaps every import
// of ProposalThemeStub for ProposalTheme and deletes this file.
// ============================================================================
import type { CSSProperties, ReactNode } from 'react'
import type { OrgBranding } from '@/lib/proposal-builder-stubs'

// Neutral theme = default variable values (absent branding renders these).
const DEFAULTS = {
  accent: '#111827',        // gray-900
  accentText: '#ffffff',
  secondary: '#6b7280',     // gray-500
}

export function ProposalThemeStub({
  branding,
  children,
  className,
}: {
  branding?: OrgBranding
  children: ReactNode
  className?: string
}) {
  const style = {
    '--proposal-accent': branding?.accent_color ?? DEFAULTS.accent,
    '--proposal-accent-text': DEFAULTS.accentText,
    '--proposal-secondary': branding?.secondary_color ?? DEFAULTS.secondary,
  } as CSSProperties
  return (
    <div style={style} className={className}>
      {children}
    </div>
  )
}
