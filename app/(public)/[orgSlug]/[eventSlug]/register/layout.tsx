import { assertOrgModule } from '@/lib/auth/module-guard'

// Shared server entry for the public self-registration flow (register, confirmation,
// create-account). Guards all subroutes on the attendee-roster module so
// booked-job-pack orgs 404 instead of exposing a registration form for a module
// they don't have. orgSlug is a route param here, so this runs server-side ahead
// of any client subroute (e.g. create-account/page.tsx).
export default async function RegisterLayout({
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
