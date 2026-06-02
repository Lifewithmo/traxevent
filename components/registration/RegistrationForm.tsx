'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ContactStep } from './steps/ContactStep'
import { FamilyMembersStep } from './steps/FamilyMembersStep'
import { ReviewStep } from './steps/ReviewStep'
import { PaymentStep } from './steps/PaymentStep'
import { createRegistration } from '@/actions/registrations'
import { getEventType } from '@/lib/event-types'
import type { Camp, Family, FamilyMember, Org } from '@/lib/types'

type ContactData = Pick<Family, 'first_name' | 'last_name' | 'email' | 'phone' | 'address' | 'emergency_contact'>
type MemberInput = Omit<FamilyMember, 'id' | 'family_id'>
type StepName = 'contact' | 'members' | 'review' | 'payment'

interface RegistrationFormProps {
  camp: Camp
  org: Org
}

export function RegistrationForm({ camp, org }: RegistrationFormProps) {
  const router = useRouter()
  const { registrationUnit, terminology } = getEventType(camp.event_type_id)
  const hasFee = (camp.payment_amount ?? 0) > 0

  const steps: StepName[] = [
    'contact',
    ...(registrationUnit !== 'individual' ? ['members' as StepName] : []),
    'review',
    ...(hasFee ? ['payment' as StepName] : []),
  ]

  const [stepIndex, setStepIndex] = useState(0)
  const [contact, setContact] = useState<Partial<ContactData>>({})
  const [members, setMembers] = useState<MemberInput[]>([])
  const [familyId, setFamilyId] = useState<string>('')

  const currentStep = steps[stepIndex]

  async function handleReviewSubmit() {
    const result = await createRegistration({
      orgId: org.id,
      campId: camp.id,
      orgSlug: org.slug,
      campSlug: camp.slug,
      campName: camp.name,
      orgName: org.name,
      family: contact as ContactData,
      members,
      skipConfirmationEmail: hasFee,
    })
    if (hasFee) {
      setFamilyId(result.familyId)
      setStepIndex(steps.indexOf('payment'))
    } else {
      const query = new URLSearchParams({ email: (contact as ContactData).email })
      if (result.waitlisted) query.set('status', 'waitlisted')
      router.push(`/${org.slug}/${camp.slug}/register/confirmation?${query.toString()}`)
    }
  }

  function handlePaymentSuccess() {
    router.push(
      `/${org.slug}/${camp.slug}/register/confirmation?email=${encodeURIComponent((contact as ContactData).email)}`
    )
  }

  return (
    <div className="min-h-screen bg-[#FAF5FF] py-8 px-4">
      <div className="max-w-xl mx-auto">
        <div className="mb-6">
          <p className="text-xs font-semibold text-[#7C3AED] uppercase tracking-wide mb-1">{org.name}</p>
          <h1 className="text-2xl font-bold text-[#4C1D95]">{camp.name}</h1>
          <p className="text-sm text-gray-500 mt-1">Step {stepIndex + 1} of {steps.length}</p>
          <div className="mt-3 h-1.5 bg-[#DDD6FE] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#7C3AED] rounded-full transition-all"
              style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }}
            />
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-[#DDD6FE] p-6">
          {currentStep === 'contact' && (
            <ContactStep
              initial={contact}
              onNext={(data) => { setContact(data); setStepIndex((i) => i + 1) }}
            />
          )}
          {currentStep === 'members' && (
            <FamilyMembersStep
              initial={members}
              memberLabel={terminology.memberPlural}
              onNext={(m) => { setMembers(m); setStepIndex((i) => i + 1) }}
              onBack={() => setStepIndex((i) => i - 1)}
            />
          )}
          {currentStep === 'review' && (
            <ReviewStep
              contact={contact as ContactData}
              members={members}
              campName={camp.name}
              onSubmit={handleReviewSubmit}
              onBack={() => setStepIndex((i) => i - 1)}
            />
          )}
          {currentStep === 'payment' && hasFee && (
            <PaymentStep
              orgSlug={org.slug}
              campSlug={camp.slug}
              familyId={familyId}
              paymentAmount={camp.payment_amount!}
              onSuccess={handlePaymentSuccess}
              onBack={() => setStepIndex((i) => i - 1)}
            />
          )}
        </div>
      </div>
    </div>
  )
}
