export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireOrgMember } from '@/lib/auth/guards'
import { getCatalogOverview } from '@/actions/catalog-overview'
import { getIndustryPack, catalogLabel } from '@/lib/industry-packs'

export default async function CatalogPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const { org, orgId } = await requireOrgMember(orgSlug)
  const o = await getCatalogOverview(orgId)
  const packagesLabel = catalogLabel(getIndustryPack(org.industry_pack_id))

  const expired = o.expiring.filter((d) => d.daysLeft < 0)
  const links = [
    { href: `/${orgSlug}/packages`, label: packagesLabel },
    { href: `/${orgSlug}/vendors`, label: `Vendors · ${o.vendorCount}` },
    { href: `/${orgSlug}/forms`, label: `Forms · ${o.formCount}` },
    { href: `/${orgSlug}/compliance`, label: 'Compliance' },
  ]

  const empty = o.vendorCount === 0 && o.formCount === 0 && o.complianceCount === 0 && o.packageCount === 0

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">Catalog</h1>

      {empty ? (
        <>
          <p className="mt-2 max-w-prose text-sm text-muted-foreground">
            What you sell and who helps you deliver it — packages, vendors, forms, and the documents that have to stay
            current. Start with {packagesLabel.toLowerCase()}.
          </p>
          {/* A brand-new org lands here first; prose with no way onward is the
              one state where this page must still navigate. */}
          <div className="flex flex-wrap gap-x-6 gap-y-2 pt-4 text-sm">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="underline">{l.label}</Link>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="mt-5" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 20 }}>
            <p
              className="font-mono text-[11px] font-semibold uppercase tracking-[.04em]"
              style={{ color: 'color-mix(in oklab, var(--muted-foreground) 70%, var(--foreground))' }}
            >
              Documents
            </p>
            <p
              className={`text-[32px] font-semibold leading-none tabular-nums${
                expired.length > 0 ? ' text-destructive' : ''
              }`}
            >
              {o.expiring.length}
            </p>
            <p className={`mt-1 text-sm ${expired.length > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
              {o.expiring.length === 0
                ? 'All current — nothing expiring in the next 60 days'
                : expired.length > 0
                  ? `${expired.length} already expired`
                  : 'Expiring within 60 days'}
            </p>

            {o.expiring.length > 0 && (
              <ul className="mt-4">
                {o.expiring.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-baseline justify-between gap-4 py-2"
                    style={{ borderTop: '1px solid var(--border)' }}
                  >
                    <span className="truncate text-sm font-medium">{d.name}</span>
                    <span className={`shrink-0 text-xs ${d.daysLeft < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                      {d.daysLeft < 0
                        ? `expired ${-d.daysLeft} day${d.daysLeft === -1 ? '' : 's'} ago`
                        : `${d.daysLeft} day${d.daysLeft === 1 ? '' : 's'} left`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2 pt-4 text-sm">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="underline">{l.label}</Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
