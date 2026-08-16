export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireOrgMember } from '@/lib/auth/guards'
import { getCatalogOverview } from '@/actions/catalog-overview'
import { getIndustryPack, catalogLabel } from '@/lib/industry-packs'
import { KpiBand } from '@/components/ui/kpi-band'
import { StatTile } from '@/components/ui/stat-tile'
import { StatusPill } from '@/components/ui/status-pill'
import { EmptyState } from '@/components/ui/empty-state'
import { RelatedRecordCard, type RelatedRow } from '@/components/ui/related-record-card'
import { Button } from '@/components/ui/button'

export default async function CatalogPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const { org, orgId } = await requireOrgMember(orgSlug)
  const o = await getCatalogOverview(orgId)
  const packagesLabel = catalogLabel(getIndustryPack(org.industry_pack_id))

  const expired = o.expiring.filter((d) => d.daysLeft < 0)
  const links = [
    { href: `/${orgSlug}/packages`, label: packagesLabel },
    { href: `/${orgSlug}/vendors`, label: 'Vendors' },
    { href: `/${orgSlug}/forms`, label: 'Forms' },
    { href: `/${orgSlug}/compliance`, label: 'Compliance' },
  ]

  const empty = o.vendorCount === 0 && o.formCount === 0 && o.complianceCount === 0 && o.packageCount === 0

  const documentsNote =
    o.expiring.length === 0
      ? 'All current — nothing expiring in the next 60 days'
      : expired.length > 0
        ? `${expired.length} already expired`
        : 'Expiring within 60 days'

  // Each row must be a real link — an expiring COI you cannot click through to
  // is inert. There is no per-document detail route, so every row points at
  // the compliance list, same as CalendarAttentionRail's rows point at their
  // source record.
  const expiringRows: RelatedRow[] = o.expiring.map((d) => ({
    id: d.id,
    title: d.name,
    href: `/${orgSlug}/compliance`,
    badge: (
      <StatusPill tone={d.daysLeft < 0 ? 'alert' : 'pending'}>
        {d.daysLeft < 0
          ? `expired ${-d.daysLeft} day${d.daysLeft === -1 ? '' : 's'} ago`
          : `${d.daysLeft} day${d.daysLeft === 1 ? '' : 's'} left`}
      </StatusPill>
    ),
  }))

  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="flex items-baseline justify-between gap-3 border-b border-border px-5 py-3">
        <h1 className="text-base font-semibold">Catalog</h1>
        <p className="text-xs text-muted-foreground">
          {o.packageCount} {packagesLabel.toLowerCase()} · {o.vendorCount} {o.vendorCount === 1 ? 'vendor' : 'vendors'} ·{' '}
          {o.formCount} {o.formCount === 1 ? 'form' : 'forms'}
        </p>
      </div>

      {empty ? (
        <>
          <div className="px-5 py-4">
            <EmptyState
              title="Nothing in your catalog yet"
              description={`What you sell and who helps you deliver it — packages, vendors, forms, and the documents that have to stay current. Start with ${packagesLabel.toLowerCase()}.`}
              action={
                <Button variant="outline" size="sm" render={<Link href={`/${orgSlug}/packages`} />}>
                  Add {packagesLabel.toLowerCase()}
                </Button>
              }
            />
          </div>
          {/* A brand-new org lands here first; prose with no way onward is the
              one state where this page must still navigate. */}
          <div className="flex flex-wrap gap-x-6 gap-y-2 px-5 pb-4 text-sm">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="text-[var(--link)] hover:underline">{l.label}</Link>
            ))}
          </div>
        </>
      ) : (
        <>
          <KpiBand inset>
            <StatTile label={packagesLabel} value={String(o.packageCount)} />
            <StatTile label="Vendors" value={String(o.vendorCount)} />
            <StatTile label="Forms" value={String(o.formCount)} />
            <StatTile
              label="Documents"
              value={String(o.expiring.length)}
              tone={expired.length > 0 ? 'alert' : 'default'}
              note={documentsNote}
            />
          </KpiBand>

          {o.expiring.length > 0 && (
            <div className="px-5 py-4">
              {/* previewLimit is set to the full row count: every expiring/expired
                  document must render here, none silently truncated behind the
                  card's default 3-row preview. emptyTitle is required by
                  RelatedRecordCard's props but unreachable in this branch
                  (rows.length can never be 0 when o.expiring.length > 0). */}
              <RelatedRecordCard
                title="Expiring documents"
                count={o.expiring.length}
                rows={expiringRows}
                previewLimit={o.expiring.length}
                emptyTitle="No documents expiring"
                emptyCtaLabel="View compliance"
              />
            </div>
          )}

          <div className="flex flex-wrap gap-x-6 gap-y-2 px-5 py-4 text-sm">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="text-[var(--link)] hover:underline">{l.label}</Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
