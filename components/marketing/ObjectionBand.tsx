export function ObjectionBand({ items }: { items: readonly { q: string; a: string }[] }) {
  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      {items.map((it) => (
        <div key={it.q} className="rounded-lg bg-card p-4 ring-1 ring-foreground/10">
          <dt className="font-medium text-foreground">{it.q}</dt>
          <dd className="mt-1 text-sm text-muted-foreground">{it.a}</dd>
        </div>
      ))}
    </dl>
  )
}
