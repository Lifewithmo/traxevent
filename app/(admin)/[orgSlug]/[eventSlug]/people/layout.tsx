import { assertOrgModule } from '@/lib/auth/module-guard'

// D3 closeout: every roster page was deep-linkable on any pack — requireEventPage
// checks permission, not module. Mirrors the public register/registrant-portal
// guards so a coffee-cart org 404s here instead of exposing family/roster
// machinery it doesn't have.
export default async function PeopleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ orgSlug: string; eventSlug: string }>
}) {
  const { orgSlug } = await params
  await assertOrgModule(orgSlug, 'attendee-roster')
  return <>{children}</>
}
