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

// Charcoal & Sapphire monogram grounds (sapphire / forest / amber / alert /
// graphite); all clear AA for the white monogram text.
const BGS = ["#1450a3", "#103f82", "#1e6b3d", "#7a4e00", "#8a2a1e", "#3a3b3f"] as const

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
