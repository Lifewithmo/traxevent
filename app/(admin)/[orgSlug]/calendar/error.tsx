'use client' // Error boundaries must be Client Components

import { useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Button, buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'

/**
 * Error boundary for the calendar cockpit.
 *
 * Scope note: error.tsx wraps loading.tsx, page.tsx and nested layouts, but NOT
 * the layout.tsx in its own segment — so a throw inside the canvas/spine lands
 * here with the left rail still live beside it, and the operator keeps their
 * navigation. (A throw in the calendar layout itself escapes to the boundary
 * above, ultimately app/global-error.tsx.)
 *
 * We deliberately do NOT render `error.message`. Next already replaces server
 * errors with a generic string in production, but client-thrown errors keep
 * their real text, which is stack-shaped noise to an operator and a leak risk.
 * The digest is a hash, not content, so it is safe to surface — and it is the
 * one thing that makes a support ticket actionable against the server logs.
 */
export default function CalendarError({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  reset: () => void
  // Added in Next 16.2 and preferred over reset(): it re-FETCHES and re-renders
  // the segment, where reset() only re-renders. Typed optional so this boundary
  // still degrades to reset() rather than throwing if it is ever absent.
  unstable_retry?: () => void
}) {
  useEffect(() => {
    console.error('[calendar] route error', error)
  }, [error])

  const params = useParams<{ orgSlug: string }>()
  const orgSlug = Array.isArray(params?.orgSlug) ? params.orgSlug[0] : params?.orgSlug
  const retry = unstable_retry ?? reset

  return (
    <div className="flex min-w-0 flex-1 items-center justify-center p-6">
      <EmptyState
        className="max-w-sm"
        icon={<span aria-hidden>!</span>}
        title="This view didn't load"
        description="The calendar couldn't be read just now. Your bookings are safe — nothing was changed. Try again, or go back to this week."
        action={
          <div className="flex flex-col items-center gap-2">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button type="button" size="sm" onClick={() => retry()}>
                Try again
              </Button>
              {orgSlug ? (
                <Link
                  href={`/${orgSlug}/calendar`}
                  // No query string: a clean route back to the current week is
                  // the escape hatch when the params themselves are the problem.
                  className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
                >
                  Back to this week
                </Link>
              ) : null}
            </div>
            {error.digest ? (
              <p className="font-mono text-[11px] text-muted-foreground">
                Reference: {error.digest}
              </p>
            ) : null}
          </div>
        }
      />
    </div>
  )
}
