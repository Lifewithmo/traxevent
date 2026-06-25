import { getOrgBySlug } from '@/actions/orgs'
import { getCampBySlug } from '@/actions/camps'
import { getRegistrationByToken, getFamilyMembers } from '@/actions/registrations'
import { listEventFormAssignments, getSignedForms } from '@/actions/forms'
import { notFound } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default async function MyRegistrationPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; campSlug: string }>
  searchParams: Promise<{ token?: string }>
}) {
  const { orgSlug, campSlug } = await params
  const { token } = await searchParams

  const org = await getOrgBySlug(orgSlug)
  if (!org) notFound()

  const camp = await getCampBySlug(org.id, campSlug)
  if (!camp) notFound()

  let family = null

  if (token) {
    family = await getRegistrationByToken(org.id, camp.id, token)
  }

  if (!family) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Registration not found or link has expired.</p>
        <Link href="/login" className="mt-4 inline-block text-[#7C3AED] hover:underline text-sm">
          Sign in to your account
        </Link>
      </div>
    )
  }

  const members = await getFamilyMembers(org.id, camp.id, family.id, token)

  const [formAssignments, signedForms] = await Promise.all([
    listEventFormAssignments(org.id, camp.id),
    getSignedForms(org.id, camp.id, family.id),
  ])
  const signedAssignmentIds = new Set(signedForms.map((s) => s.assignment_id))
  const registrantForms = formAssignments.filter((a) => a.audience === 'registrant')

  const statusColor: Record<string, string> = {
    confirmed: 'bg-green-100 text-green-800',
    pending: 'bg-yellow-100 text-yellow-800',
    waitlisted: 'bg-blue-100 text-blue-800',
    cancelled: 'bg-red-100 text-red-800',
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-[#7C3AED] font-semibold">{org.name}</p>
        <h1 className="text-2xl font-bold text-[#4C1D95]">{camp.name}</h1>
        <p className="text-sm text-gray-500">{camp.camp_start} → {camp.camp_end}</p>
      </div>

      <div className="bg-white rounded-xl border border-[#DDD6FE] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-700">Registration status</h2>
          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${statusColor[family.registration_status]}`}>
            {family.registration_status}
          </span>
        </div>
        <div className="text-sm text-gray-600 space-y-1">
          <p>{family.first_name} {family.last_name}</p>
          <p>{family.email} · {family.phone}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-[#DDD6FE] p-5">
        <h2 className="font-semibold text-gray-700 mb-3">
          {members.length} {members.length === 1 ? 'person' : 'people'} attending
        </h2>
        <ul className="space-y-2">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-2 text-sm text-gray-600">
              <span className="w-2 h-2 rounded-full bg-[#7C3AED] flex-shrink-0" />
              {m.first_name} {m.last_name}
              {m.tshirt_size ? <Badge variant="outline" className="ml-auto text-xs">{m.tshirt_size}</Badge> : null}
            </li>
          ))}
        </ul>
      </div>

      {registrantForms.length > 0 && (
        <div className="bg-white rounded-xl border border-[#DDD6FE] p-5">
          <h2 className="font-semibold text-gray-700 mb-3">Required forms</h2>
          <ul className="space-y-2">
            {registrantForms.map((form) => {
              const signed = signedAssignmentIds.has(form.id)
              return (
                <li key={form.id} className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">{form.template_name}</span>
                  {signed ? (
                    <span className="text-xs text-green-700 font-medium">✓ Signed</span>
                  ) : (
                    <Link
                      href={`/${orgSlug}/${campSlug}/forms/${form.id}${token ? `?token=${token}` : ''}`}
                      className="text-xs text-[#7C3AED] font-medium hover:underline"
                    >
                      Sign now →
                    </Link>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {camp.itinerary_published && (
        <Link
          href={`/${orgSlug}/${campSlug}/schedule${token ? `?token=${token}` : ''}`}
        >
          <Button variant="outline" className="w-full border-[#7C3AED] text-[#7C3AED]">
            View event schedule
          </Button>
        </Link>
      )}

      <Link
        href={`/${orgSlug}/${campSlug}/edit${token ? `?token=${token}` : ''}`}
      >
        <Button variant="outline" className="w-full border-[#7C3AED] text-[#7C3AED]">
          Edit registration
        </Button>
      </Link>
    </div>
  )
}
