'use client' // Error boundaries must be Client Components

import './globals.css'

/**
 * The app-wide backstop: the only thing between a throw in the ROOT layout (or
 * in any segment whose own error.tsx also failed) and a white screen.
 *
 * When active this file REPLACES the root layout, so it must ship its own
 * <html>/<body> and its own styles — hence the direct globals.css import, which
 * supplies the design tokens plus the base `html { font-sans }` and
 * `body { bg-background text-foreground }` rules that app/layout.tsx normally
 * provides. next-themes does not run here, so there is no `.dark` class and the
 * page renders in the light palette; that is an accepted trade for a last-ditch
 * screen, not an oversight.
 *
 * Deliberately dependency-light: no design-system imports, no next/link, no
 * next/font. Anything this file pulls in is another module that can be the very
 * thing that is broken, and the router may be down — so the escape hatch is a
 * plain <a> that does a full document load. Metadata exports are unsupported in
 * global-error, so the title is the React <title> element.
 *
 * As with the route boundary, the raw message is never rendered; the digest is
 * a hash and is safe to show as a support reference.
 */
export default function GlobalError({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  reset: () => void
  unstable_retry?: () => void
}) {
  const retry = unstable_retry ?? reset

  return (
    <html lang="en">
      <body>
        <title>Something went wrong · TraxEvent</title>
        <main className="flex min-h-screen items-center justify-center p-6">
          <div className="flex w-full max-w-sm flex-col items-center gap-3 text-center">
            <div className="grid size-8 place-items-center rounded-lg bg-muted text-muted-foreground">
              <span aria-hidden>!</span>
            </div>
            <h1 className="text-sm font-medium text-foreground">Something went wrong</h1>
            <p className="text-xs text-muted-foreground">
              TraxEvent hit an unexpected error and couldn&apos;t finish loading this page. Your
              data is safe — nothing was changed.
            </p>
            <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => retry()}
                className="h-8 rounded-lg bg-primary px-3 text-[0.8rem] font-medium text-primary-foreground"
              >
                Try again
              </button>
              {/*
                eslint-disable-next-line @next/next/no-html-link-for-pages --
                Intentional. The rule exists to preserve client-side navigation,
                which is exactly what must NOT be relied on here: global-error is
                the last boundary, so the router is a suspect. A plain <a> forces
                a full document load and rebuilds the app from scratch.
              */}
              <a
                href="/"
                className="h-8 rounded-lg border border-border px-3 text-[0.8rem] font-medium leading-8 text-foreground"
              >
                Go home
              </a>
            </div>
            {error.digest ? (
              <p className="font-mono text-[11px] text-muted-foreground">
                Reference: {error.digest}
              </p>
            ) : null}
          </div>
        </main>
      </body>
    </html>
  )
}
