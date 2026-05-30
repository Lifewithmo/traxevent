'use client'

import { useState, useEffect } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { getRegistrationByToken, getFamilyMembers, updateRegistration } from '@/actions/registrations'
import { getOrgBySlug } from '@/actions/orgs'
import { getCampBySlug } from '@/actions/camps'
import { ContactStep } from '@/components/registration/steps/ContactStep'
import { FamilyMembersStep } from '@/components/registration/steps/FamilyMembersStep'
import type { Family, FamilyMember, Camp, Org } from '@/lib/types'

type ContactData = Pick<Family, 'first_name' | 'last_name' | 'email' | 'phone' | 'address' | 'emergency_contact'>
type MemberInput = Omit<FamilyMember, 'id' | 'family_id'>

export default function EditRegistrationPage() {
  const params = useParams<{ orgSlug: string; campSlug: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get('token') ?? ''

  const [family, setFamily] = useState<Family | null>(null)
  const [camp, setCamp] = useState<Camp | null>(null)
  const [org, setOrg] = useState<Org | null>(null)
  const [members, setMembers] = useState<MemberInput[]>([])
  const [step, setStep] = useState<'contact' | 'members'>('contact')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const o = await getOrgBySlug(params.orgSlug)
      if (!o) { setError('Organization not found'); setLoading(false); return }
      const c = await getCampBySlug(o.id, params.campSlug)
      if (!c) { setError('Camp not found'); setLoading(false); return }
      const f = await getRegistrationByToken(o.id, c.id, token)
      if (!f) { setError('Registration not found or link expired'); setLoading(false); return }
      const ms = await getFamilyMembers(o.id, c.id, f.id)
      setOrg(o); setCamp(c); setFamily(f)
      setMembers(ms.map(({ id: _id, family_id: _fid, ...m }) => m))
      setLoading(false)
    }
    if (token) load()
    else { setError('No access token provided'); setLoading(false) }
  }, [params.orgSlug, params.campSlug, token])

  async function handleContactSave(data: ContactData) {
    if (!org || !camp || !family) return
    await updateRegistration(org.id, camp.id, family.id, data)
    setStep('members')
  }

  if (loading) return <div className="py-12 text-center text-gray-400">Loading…</div>
  if (error) return <div className="py-12 text-center text-red-500">{error}</div>
  if (!family || !org || !camp) return null

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-[#4C1D95]">Edit registration</h1>
        <p className="text-sm text-gray-500">{camp.name}</p>
      </div>
      <div className="bg-white rounded-xl border border-[#DDD6FE] p-6">
        {step === 'contact' && (
          <ContactStep
            initial={family}
            onNext={handleContactSave}
          />
        )}
        {step === 'members' && (
          <FamilyMembersStep
            initial={members}
            onNext={() => router.push(`/${org.slug}/${camp.slug}/my-registration?token=${token}`)}
            onBack={() => setStep('contact')}
          />
        )}
      </div>
    </div>
  )
}
