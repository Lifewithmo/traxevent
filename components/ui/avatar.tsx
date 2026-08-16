import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const avatarVariants = cva(
  "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-[var(--warm-0)] select-none",
  {
    variants: {
      size: { sm: "size-7 text-[11px]", md: "size-9 text-sm", lg: "size-12 text-base" },
    },
    defaultVariants: { size: "md" },
  }
)

// Warm, on-brand monogram grounds (copper / moss / honey / terracotta / warm).
const BGS = ["#8a4e20", "#5d7a45", "#7d5a18", "#8c3524", "#6d5d4f", "#905525"] as const

function initialsOf(name: string): string {
  return name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()
}
function bgFor(seed: string): string {
  let s = 0
  for (let i = 0; i < seed.length; i++) s = (s + seed.charCodeAt(i)) % BGS.length
  return BGS[s]
}

function Avatar({
  name, src, size, className,
}: { name: string; src?: string; className?: string } & VariantProps<typeof avatarVariants>) {
  return (
    <span data-slot="avatar" role="img" className={cn(avatarVariants({ size }), className)} style={{ backgroundColor: bgFor(name) }} aria-label={name}>
      {src ? <img src={src} alt="" className="size-full object-cover" /> : initialsOf(name)}
    </span>
  )
}

export { Avatar, avatarVariants, initialsOf }
