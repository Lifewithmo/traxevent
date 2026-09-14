import { assertOrgModule } from '@/lib/auth/module-guard'

// D3 closeout: the org-wide Registrants page was deep-linkable on any pack —
// requireEventPage/requireOrgMember check permission, not module. Mirrors the
// public register/registrant-portal guards so a coffee-cart org 404s here
// instead of exposing family/roster machinery it doesn't have.
export default async function RegistrantsLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  await assertOrgModule(orgSlug, 'registrants')
  return <>{children}</>
}
