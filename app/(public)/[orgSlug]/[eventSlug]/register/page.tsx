import { getOrgBySlug } from '@/actions/orgs'
import { getEventBySlug } from '@/actions/events'
import { RegistrationForm } from '@/components/registration/RegistrationForm'
import { notFound } from 'next/navigation'

export default async function RegisterPage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventSlug: string }>
}) {
  const { orgSlug, eventSlug } = await params

  const org = await getOrgBySlug(orgSlug)
  if (!org) notFound()

  const event = await getEventBySlug(org.id, eventSlug)
  if (!event || event.status === 'archived') notFound()

  return <RegistrationForm event={event} org={org} />
}
