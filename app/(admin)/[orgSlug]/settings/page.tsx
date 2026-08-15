export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireOrgMember } from '@/lib/auth/guards'
import { getSettingsOverview } from '@/actions/settings-overview'

export default async function SettingsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const { org, orgId } = await requireOrgMember(orgSlug)
  const { areas, memberCount } = await getSettingsOverview(orgId, org)
  const unconfigured = areas.filter((a) => !a.configured)

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">{org.name}</h1>
      <p className="text-sm text-muted-foreground">
        {memberCount} member{memberCount === 1 ? '' : 's'}
      </p>

      <div className="mt-5" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 20 }}>
        {unconfigured.length === 0 ? (
          <p className="text-sm text-muted-foreground">Fully set up — nothing left to configure.</p>
        ) : (
          <>
            <p
              className="font-mono text-[11px] font-semibold uppercase tracking-[.04em]"
              style={{ color: 'color-mix(in oklab, var(--muted-foreground) 70%, var(--foreground))' }}
            >
              Not set up yet
            </p>
            <p className="text-[32px] font-semibold leading-none tabular-nums">{unconfigured.length}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              area{unconfigured.length === 1 ? '' : 's'} clients may notice
            </p>
            <ul className="mt-4">
              {unconfigured.map((a) => (
                <li key={a.slug} style={{ borderTop: '1px solid var(--border)' }}>
                  <Link href={`/${orgSlug}/${a.slug}`} className="block py-2 text-sm font-medium hover:bg-muted/40">
                    {a.label}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <ul className="flex flex-wrap gap-x-6 gap-y-2 pt-4 text-sm">
        {areas.map((a) => (
          <li key={a.slug}>
            <Link href={`/${orgSlug}/${a.slug}`} className="underline">{a.label}</Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
