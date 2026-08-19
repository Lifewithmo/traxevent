//
// COLOUR RULE: this renders inside <ProposalTheme> on permanently-white paper.
// Use explicit var(--warm-N) literals and the --proposal-* variables ONLY.
// Never use semantic tokens (text-foreground, bg-card, text-muted-foreground):
// they carry .dark overrides, the warm ramp does not, and mixing them breaks
// dark mode AND light-mode WYSIWYG parity with what the customer receives.
import type { OrgBranding } from '@/lib/types'

/**
 * The scrim is FIXED ARITHMETIC, not a tunable design choice.
 *
 * Cover images are operator-uploaded and unbounded. Solving the WCAG contrast
 * formula for the alpha that holds against the worst possible image (pure
 * white) gives alpha >= 0.535 for 4.5:1 with white text. The previous bg-black/40
 * composited to #999999 over a bright cover — 2.85:1, failing AA and even the
 * 3:1 large-text floor. Do not lower this, and do not replace it with image
 * sampling: there is no server-side image decoder in the dependency tree.
 */
export const SCRIM_CLASS = 'bg-black/60'

export function CoverSection({
  title,
  branding,
  clientName,
  eventDate,
}: {
  title: string
  branding?: OrgBranding
  clientName?: string
  eventDate?: string
}) {
  const heading = title.trim() || 'Proposal'
  const hasImage = Boolean(branding?.cover_image_url)

  return (
    <header
      className="relative w-full bg-cover bg-center"
      data-testid="proposal-cover"
      style={
        hasImage
          ? { backgroundImage: `url(${branding!.cover_image_url})` }
          : { backgroundColor: 'var(--proposal-accent, #111827)' }
      }
    >
      <div className={hasImage ? SCRIM_CLASS : ''}>
        <div className="mx-auto w-full max-w-3xl px-6 py-20 sm:py-24">
          {branding?.logo_url && (
            /* Plain <img> matches ProposalDocument: next.config.ts has no
               images.remotePatterns, and next/image would couple this to the
               storage bucket domain. */
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={branding.logo_url}
              alt={`${branding.display_name ?? 'Company'} logo`}
              className="mb-6 h-12 w-auto"
            />
          )}
          <h1 className="text-balance text-4xl font-bold leading-tight text-white sm:text-5xl">
            {heading}
          </h1>
          {(clientName || eventDate) && (
            <p className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-base text-white">
              {clientName && <span>{clientName}</span>}
              {clientName && eventDate && <span aria-hidden="true">·</span>}
              {eventDate && <span>{eventDate}</span>}
            </p>
          )}
        </div>
      </div>
    </header>
  )
}
