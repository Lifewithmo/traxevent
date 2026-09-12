import { cn } from "@/lib/utils"

/**
 * The shared loading placeholder. Route `loading.tsx` files compose these into a
 * shape that MATCHES the screen being loaded — never a centred spinner, which
 * tells the operator nothing about what is arriving.
 *
 * Purely decorative: skeletons carry no text, so they are hidden from assistive
 * tech and the surrounding boundary announces the load instead.
 */
function Skeleton({ className }: { className?: string }) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn(
        "rounded bg-muted animate-pulse motion-reduce:animate-none",
        className
      )}
    />
  )
}

export { Skeleton }
