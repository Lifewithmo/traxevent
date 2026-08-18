export function ProofWallEmpty() {
  return (
    <div className="rounded-xl bg-[color:var(--warm-100)] p-6 text-center">
      <p className="text-lg font-semibold text-foreground">We’re new — and honest about it.</p>
      <p className="mx-auto mt-2 max-w-prose text-sm text-muted-foreground">
        BrewTrax is built hand-in-hand with working mobile-beverage operators. No fake reviews here.
        What we’ll promise instead:
      </p>
      <ul className="mx-auto mt-4 flex max-w-xl flex-col gap-2 text-sm text-foreground sm:flex-row sm:justify-center">
        <li className="rounded-lg bg-card px-3 py-2 ring-1 ring-foreground/10">Payments on Stripe</li>
        <li className="rounded-lg bg-card px-3 py-2 ring-1 ring-foreground/10">Export your data anytime</li>
        <li className="rounded-lg bg-card px-3 py-2 ring-1 ring-foreground/10">No contract, cancel anytime</li>
      </ul>
    </div>
  )
}
