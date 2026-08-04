import { assertOrgModule } from '@/lib/auth/module-guard'

// Shared server entry for the registrant portal's per-event routes (schedule, edit,
// my-registration, forms/[assignmentId]). The parent app/(registrant)/layout.tsx is a
// 'use client' auth guard, so this nested layout — a plain server component — is the
// place to gate on the attendee-roster module: orgSlug is a route param here and this
// runs server-side ahead of any client subroute (e.g. edit/page.tsx).
export default async function RegistrantEventLayout({
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
