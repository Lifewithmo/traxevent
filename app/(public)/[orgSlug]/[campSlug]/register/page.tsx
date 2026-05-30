import { getOrgBySlug } from '@/actions/orgs'
import { getCampBySlug } from '@/actions/camps'
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

  const camp = await getCampBySlug(org.id, campSlug)
  if (!camp || camp.status === 'archived') notFound()

  return <RegistrationForm camp={camp} org={org} />
}
