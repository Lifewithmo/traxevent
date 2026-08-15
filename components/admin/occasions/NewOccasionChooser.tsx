import Link from 'next/link'

const DOORS = (orgSlug: string) => [
  { href: `/${orgSlug}/new-event`, title: 'Client job', body: 'A booked job for a client — proposals, ops, closeout.' },
  { href: `/${orgSlug}/new-market-day`, title: 'Market day', body: 'A single public selling day — farmers market, pop-up.' },
  { href: `/${orgSlug}/new-series`, title: 'Series', body: 'A repeating market — every week through a season.' },
]

export function NewOccasionChooser({
  orgSlug, storefrontEnabled, dropLabel,
}: {
  orgSlug: string
  storefrontEnabled: boolean
  dropLabel: string
}) {
  const doors = [
    ...DOORS(orgSlug),
    ...(storefrontEnabled
      ? [{ href: `/${orgSlug}/drops/new`, title: dropLabel, body: 'A pre-order window — customers order ahead online.' }]
      : []),
  ]
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {doors.map((d) => (
        <Link key={d.href} href={d.href} className="rounded-xl border bg-white p-5 hover:shadow-md transition-shadow">
          <p className="font-semibold">{d.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{d.body}</p>
        </Link>
      ))}
    </div>
  )
}
