import { getOrgBySlug } from '@/actions/orgs'
import { getEventBySlug } from '@/actions/events'
import { RegistrationForm } from '@/components/registration/RegistrationForm'
import { notFound } from 'next/navigation'

export default async function RegisterPage({
  params,
}: {
  params: Promise<{ orgSlug: string; campSlug: string }>
}) {
  const { orgSlug, campSlug } = await params

  const org = await getOrgBySlug(orgSlug)
  if (!org) notFound()

  const event = await getEventBySlug(org.id, campSlug)
  if (!event || event.status === 'archived') notFound()

  return <RegistrationForm event={event} org={org} />
}
