'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ContactStep } from './steps/ContactStep'
import { FamilyMembersStep } from './steps/FamilyMembersStep'
import { ReviewStep } from './steps/ReviewStep'
import { PaymentStep } from './steps/PaymentStep'
import { createRegistration } from '@/actions/registrations'
import type { Camp, Family, FamilyMember, Org } from '@/lib/types'

type ContactData = Pick<Family, 'first_name' | 'last_name' | 'email' | 'phone' | 'address' | 'emergency_contact'>
type MemberInput = Omit<FamilyMember, 'id' | 'family_id'>

interface RegistrationFormProps {
  camp: Camp
  org: Org
}

export function RegistrationForm({ camp, org }: RegistrationFormProps) {
  const router = useRouter()
  const hasFee = (camp.payment_amount ?? 0) > 0

  const STEPS = hasFee
    ? (['Contact Information', 'Family Members', 'Review', 'Payment'] as const)
    : (['Contact Information', 'Family Members', 'Review'] as const)

  const [step, setStep] = useState(0)
  const [contact, setContact] = useState<Partial<ContactData>>({})
  const [members, setMembers] = useState<MemberInput[]>([])
  const [familyId, setFamilyId] = useState<string>('')

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
      setStep(3)
    } else {
      router.push(
        `/${org.slug}/${camp.slug}/register/confirmation?email=${encodeURIComponent((contact as ContactData).email)}`
      )
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
          <p className="text-xs font-semibold text-[#7C3AED] uppercase tracking-wide mb-1">
            {org.name}
          </p>
          <h1 className="text-2xl font-bold text-[#4C1D95]">{camp.name}</h1>
          <p className="text-sm text-gray-500 mt-1">
            Step {step + 1} of {STEPS.length}
          </p>
          <div className="mt-3 h-1.5 bg-[#DDD6FE] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#7C3AED] rounded-full transition-all"
              style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
            />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-[#DDD6FE] p-6">
          {step === 0 && (
            <ContactStep
              initial={contact}
              onNext={(data) => { setContact(data); setStep(1) }}
            />
          )}
          {step === 1 && (
            <FamilyMembersStep
              initial={members}
              onNext={(m) => { setMembers(m); setStep(2) }}
              onBack={() => setStep(0)}
            />
          )}
          {step === 2 && (
            <ReviewStep
              contact={contact as ContactData}
              members={members}
              campName={camp.name}
              onSubmit={handleReviewSubmit}
              onBack={() => setStep(1)}
            />
          )}
          {step === 3 && hasFee && (
            <PaymentStep
              orgSlug={org.slug}
              campSlug={camp.slug}
              familyId={familyId}
              paymentAmount={camp.payment_amount!}
              onSuccess={handlePaymentSuccess}
              onBack={() => setStep(2)}
            />
          )}
        </div>
      </div>
    </div>
  )
}
