# Phase 1c: Registration Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the registration form for all three event types (family, individual, child), pre-fill contact fields for returning registrants, and auto-waitlist when an event is at capacity.

**Architecture:** Three independent improvements built on top of the existing 3-step form. (1) The `RegistrationForm` reads `camp.event_type_id` to determine `registrationUnit`, then skips the members step for `individual` events and relabels it for `child` events. (2) The form checks Firebase auth state on mount and pre-fills from `RegistrantProfile` if the user is logged in. (3) `createRegistration` queries the active registration count against `camp.capacity` and sets `registration_status: 'waitlisted'` when full; the confirmation page adapts its message accordingly.

**Tech Stack:** Next.js 16 App Router, TypeScript, Vitest + React Testing Library, Firebase Admin SDK (Firestore), Firebase Auth (client)

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `components/registration/RegistrationForm.tsx` | Modify | Named-step system; skip members for individual; pre-fill from profile; pass waitlisted status to redirect |
| `components/registration/steps/FamilyMembersStep.tsx` | Modify | Accept `memberLabel` prop for terminology-driven header |
| `actions/registrations.ts` | Modify | Check capacity → set `waitlisted` status; return `{ familyId, accessToken, waitlisted }` |
| `app/(public)/[orgSlug]/[campSlug]/register/confirmation/page.tsx` | Modify | Show waitlisted message when `?status=waitlisted` |
| `__tests__/components/registration/RegistrationForm.test.tsx` | Modify | Add individual flow test; add pre-fill test |
| `__tests__/actions/registrations.test.ts` | Create | Waitlist logic tests |

---

## Task 1: Event-type-driven registration flow

**Files:**
- Modify: `components/registration/RegistrationForm.tsx`
- Modify: `components/registration/steps/FamilyMembersStep.tsx`
- Modify: `__tests__/components/registration/RegistrationForm.test.tsx`

The current form hardcodes 3 steps. After this task the form reads `camp.event_type_id` to determine the flow:
- `family` / `child` → Contact → Members → Review → (Payment)
- `individual` → Contact → Review → (Payment)

The members step title adapts to the event type's `memberPlural` terminology ("Family Members", "Children", "Attendees").

- [ ] **Step 1: Write failing tests**

Add two tests to `__tests__/components/registration/RegistrationForm.test.tsx`:

```typescript
// Add these imports at the top (after existing imports):
// import userEvent from '@testing-library/user-event'   ← already present

// Add a mockCamp for individual events:
const mockIndividualCamp = {
  id: 'camp-2',
  name: 'Grace Retreat 2026',
  slug: 'grace-retreat-2026',
  year: 2026,
  status: 'active' as const,
  registration_type: 'individual' as const,
  event_type_id: 'retreat',
  features: { accommodations: true, teams: true, budget: true, itinerary: true, communicate: true },
  camp_start: '2026-09-01',
  camp_end: '2026-09-03',
  created_at: '2026-01-01',
}

// Add at end of describe block:
it('shows Step 1 of 2 for individual event types (no members step)', () => {
  render(<RegistrationForm camp={mockIndividualCamp} org={mockOrg} />)
  expect(screen.getByText(/Step 1 of 2/i)).toBeInTheDocument()
})

it('shows correct member label for summer-camp (Family Members)', () => {
  render(<RegistrationForm camp={mockCamp} org={mockOrg} />)
  // step 1 (family members) has the label text
  // navigate to step 1 by examining what FamilyMembersStep will render
  // The header of FamilyMembersStep uses the memberLabel prop
  // We just check the STEPS display includes "Families" in the step label
  // For summer-camp the step count is 3, the members step is step 2
  expect(screen.getByText(/Step 1 of 3/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run tests to see what currently fails**

```bash
npx vitest run __tests__/components/registration/RegistrationForm.test.tsx
```

The "Step 1 of 2" test should fail because individual events currently show "Step 1 of 3".

- [ ] **Step 3: Update `components/registration/steps/FamilyMembersStep.tsx`**

Add a `memberLabel?: string` prop and use it for the heading:

```tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { MemberRow } from '@/components/registration/MemberRow'
import type { FamilyMember } from '@/lib/types'

type MemberInput = Omit<FamilyMember, 'id' | 'family_id'>

function emptyMember(): MemberInput {
  return {
    first_name: '', last_name: '', birth_year: 0, gender: '', grade: '',
    allergies: '', dietary_restrictions: '', tshirt_size: '', medical_notes: '',
  }
}

interface FamilyMembersStepProps {
  initial: MemberInput[]
  onNext: (members: MemberInput[]) => void
  onBack: () => void
  memberLabel?: string  // e.g. "Campers", "Children", "Attendees" — defaults to "Family Members"
}

export function FamilyMembersStep({ initial, onNext, onBack, memberLabel = 'Family Members' }: FamilyMembersStepProps) {
  const [members, setMembers] = useState<MemberInput[]>(
    initial.length > 0 ? initial : [emptyMember()]
  )

  function handleChange(index: number, updated: MemberInput) {
    setMembers((prev) => prev.map((m, i) => (i === index ? updated : m)))
  }

  function handleRemove(index: number) {
    setMembers((prev) => prev.filter((_, i) => i !== index))
  }

  function handleAdd() {
    setMembers((prev) => [...prev, emptyMember()])
  }

  function handleNext() {
    const valid = members.filter((m) => m.first_name.trim() && m.last_name.trim())
    if (valid.length === 0) return
    onNext(valid)
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-[#4C1D95]">{memberLabel}</h2>
      <p className="text-sm text-gray-500">Add everyone who will be attending.</p>

      <div className="space-y-3">
        {members.map((member, i) => (
          <MemberRow
            key={i}
            index={i}
            member={member}
            onChange={handleChange}
            onRemove={handleRemove}
          />
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full border-[#7C3AED] text-[#7C3AED]"
        onClick={handleAdd}
      >
        + Add another person
      </Button>

      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={onBack}>
          Back
        </Button>
        <Button
          className="flex-1 bg-[#7C3AED] hover:bg-[#6D28D9]"
          onClick={handleNext}
          disabled={members.every((m) => !m.first_name.trim())}
        >
          Next: Review
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Replace `components/registration/RegistrationForm.tsx`**

```tsx
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
          <p className="text-xs font-semibold text-[#7C3AED] uppercase tracking-wide mb-1">
            {org.name}
          </p>
          <h1 className="text-2xl font-bold text-[#4C1D95]">{camp.name}</h1>
          <p className="text-sm text-gray-500 mt-1">
            Step {stepIndex + 1} of {steps.length}
          </p>
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
```

**Note on `result.waitlisted`:** `createRegistration` currently returns `{ familyId, accessToken }`. Task 3 adds `waitlisted: boolean` to this. For Task 1, add `waitlisted: boolean` to the return type now so TypeScript doesn't error. Update `actions/registrations.ts` to return `{ familyId, accessToken, waitlisted: false }` temporarily (Task 3 will make this dynamic).

- [ ] **Step 5: Update `actions/registrations.ts` return type (temporary)**

Change the return statement of `createRegistration`:

```typescript
// Before:
return { familyId, accessToken }

// After:
return { familyId, accessToken, waitlisted: false }
```

And update the return type annotation:

```typescript
export async function createRegistration(
  input: CreateRegistrationInput
): Promise<{ familyId: string; accessToken: string; waitlisted: boolean }> {
```

- [ ] **Step 6: Run tests**

```bash
npx vitest run __tests__/components/registration/RegistrationForm.test.tsx
```

Expected: all pass including the 2 new tests. The existing "shows Step 2 of 3 after completing Step 1" test should still pass because `summer-camp` uses `family` registration unit.

- [ ] **Step 7: Run full test suite and TypeScript check**

```bash
npx vitest run && npx tsc --noEmit
```

Expected: all pass, tsc clean.

- [ ] **Step 8: Commit**

```bash
git add \
  components/registration/RegistrationForm.tsx \
  components/registration/steps/FamilyMembersStep.tsx \
  actions/registrations.ts \
  "__tests__/components/registration/RegistrationForm.test.tsx"
git commit -m "feat: event-type-driven form flow — skip members step for individual events, terminology-driven step label"
```

---

## Task 2: Profile pre-fill on return visits

**Files:**
- Modify: `components/registration/RegistrationForm.tsx`
- Modify: `__tests__/components/registration/RegistrationForm.test.tsx`

When a user is logged in via Firebase Auth and has a `RegistrantProfile`, their contact info and saved family members are pre-populated when they start a new registration.

`RegistrantProfile` fields that map to `ContactData`:
- `display_name` → split on first space → `first_name` (everything before first space) + `last_name` (rest)
- `email` → `email`
- `phone` → `phone`
- `address` → `address`
- `emergency_contact` → `emergency_contact`
- `saved_members` → `members` (for family/child events)

`RegistrantProfile` is at `registrant_profiles/{uid}` and is accessed via `getRegistrantProfile(uid)` from `actions/registrant-auth.ts`.

- [ ] **Step 1: Write failing pre-fill test**

Add to `__tests__/components/registration/RegistrationForm.test.tsx`:

```typescript
// Add at top of file (after existing vi.mock calls):
vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/actions/registrant-auth', () => ({
  getRegistrantProfile: vi.fn(),
}))

// Add these imports at top:
// import { useAuth } from '@/hooks/useAuth'
// import { getRegistrantProfile } from '@/actions/registrant-auth'
// (vitest will resolve these from vi.mock)

// Add inside the describe block:
it('pre-fills contact fields from RegistrantProfile when user is logged in', async () => {
  const { useAuth } = await import('@/hooks/useAuth')
  const { getRegistrantProfile } = await import('@/actions/registrant-auth')

  vi.mocked(useAuth).mockReturnValue({
    user: { uid: 'user-123' } as never,
    loading: false,
    orgId: null,
    orgSlug: null,
    role: null,
  })

  vi.mocked(getRegistrantProfile).mockResolvedValue({
    uid: 'user-123',
    display_name: 'Jane Smith',
    email: 'jane@example.com',
    phone: '555-1234',
    address: { street: '123 Main St', city: 'Springfield', state: 'IL', zip: '62701' },
    emergency_contact: { name: 'Bob Smith', phone: '555-9999', relationship: 'Spouse' },
    saved_members: [],
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  })

  render(<RegistrationForm camp={mockCamp} org={mockOrg} />)

  // Wait for the useEffect to fire and pre-fill
  await screen.findByDisplayValue('Jane')
  expect(screen.getByDisplayValue('Smith')).toBeInTheDocument()
  expect(screen.getByDisplayValue('jane@example.com')).toBeInTheDocument()
})
```

Also add a `beforeEach` to the describe block that resets the `useAuth` mock to a logged-out state so existing tests are not affected:

```typescript
// In describe block, before existing tests:
beforeEach(() => {
  // Default to logged out so existing tests are unaffected
  // This requires importing and mocking useAuth
})
```

However, the mock of `useAuth` needs to be set up at the top of the file. Update the existing `vi.mock` section to include `useAuth` with a default logged-out return value:

```typescript
vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn().mockReturnValue({
    user: null,
    loading: false,
    orgId: null,
    orgSlug: null,
    role: null,
  }),
}))

vi.mock('@/actions/registrant-auth', () => ({
  getRegistrantProfile: vi.fn().mockResolvedValue(null),
}))
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run __tests__/components/registration/RegistrationForm.test.tsx
```

Expected: FAIL — pre-fill test fails because `RegistrationForm` doesn't use `useAuth` yet.

- [ ] **Step 3: Update `components/registration/RegistrationForm.tsx` — add pre-fill**

Add the following to `RegistrationForm` (imports and useEffect):

```tsx
// Add to imports at top:
import { useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { getRegistrantProfile } from '@/actions/registrant-auth'

// Add inside the component, after existing state declarations:
const { user } = useAuth()
const [registrantUid, setRegistrantUid] = useState<string | undefined>()

useEffect(() => {
  if (!user?.uid) return
  setRegistrantUid(user.uid)
  getRegistrantProfile(user.uid).then((profile) => {
    if (!profile) return
    // Pre-fill contact — split display_name on first space
    const spaceIdx = profile.display_name.indexOf(' ')
    const firstName = spaceIdx > 0 ? profile.display_name.slice(0, spaceIdx) : profile.display_name
    const lastName = spaceIdx > 0 ? profile.display_name.slice(spaceIdx + 1) : ''
    setContact({
      first_name: firstName,
      last_name: lastName,
      email: profile.email,
      phone: profile.phone,
      address: profile.address,
      emergency_contact: profile.emergency_contact,
    })
    // Pre-fill family members from saved profile members (for family/child events)
    if (registrationUnit !== 'individual' && profile.saved_members.length > 0) {
      setMembers(profile.saved_members.map((sm) => ({
        first_name: sm.first_name,
        last_name: sm.last_name,
        birth_year: sm.birth_year,
        gender: sm.gender,
        grade: '',
        allergies: '',
        dietary_restrictions: '',
        tshirt_size: '',
        medical_notes: '',
      })))
    }
  })
}, [user?.uid]) // eslint-disable-line react-hooks/exhaustive-deps
```

Also pass `registrantUid` to `createRegistration` in `handleReviewSubmit`:

```typescript
const result = await createRegistration({
  // ... existing fields ...
  skipConfirmationEmail: hasFee,
  registrantUid,  // ← add this line
})
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run __tests__/components/registration/RegistrationForm.test.tsx
```

Expected: all 5 tests pass (3 existing + 2 from Task 1 + 1 new pre-fill test).

- [ ] **Step 5: Run full suite and tsc**

```bash
npx vitest run && npx tsc --noEmit
```

Expected: all pass, tsc clean.

- [ ] **Step 6: Commit**

```bash
git add components/registration/RegistrationForm.tsx \
  "__tests__/components/registration/RegistrationForm.test.tsx"
git commit -m "feat: pre-fill registration form from RegistrantProfile on return visits"
```

---

## Task 3: Waitlist support

**Files:**
- Modify: `actions/registrations.ts`
- Modify: `app/(public)/[orgSlug]/[campSlug]/register/confirmation/page.tsx`
- Create: `__tests__/actions/registrations.test.ts`

When `camp.capacity` is set and the number of `pending + confirmed` registrations equals or exceeds it, new registrations are created with `registration_status: 'waitlisted'`. The confirmation page shows a different message for waitlisted registrants.

- [ ] **Step 1: Write failing waitlist tests**

Create `__tests__/actions/registrations.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Hoisted spies
const familySetSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const memberSetSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const attachAccessTokenSpy = vi.hoisted(() =>
  vi.fn().mockResolvedValue('tok_abc')
)
const sendEmailSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

// Track families collection snapshot per test
const getFamiliesSpy = vi.hoisted(() => vi.fn())
const getCampSpy = vi.hoisted(() => vi.fn())

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn().mockImplementation((col: string) => {
      if (col === 'orgs') {
        return {
          doc: vi.fn().mockReturnValue({
            collection: vi.fn().mockImplementation((sub: string) => {
              if (sub === 'camps') {
                return {
                  doc: vi.fn().mockReturnValue({
                    get: getCampSpy,
                    collection: vi.fn().mockImplementation((sub2: string) => {
                      if (sub2 === 'families') {
                        return {
                          doc: vi.fn().mockReturnValue({
                            set: familySetSpy,
                            collection: vi.fn().mockReturnValue({
                              doc: vi.fn().mockReturnValue({ set: memberSetSpy }),
                            }),
                          }),
                          get: getFamiliesSpy,
                        }
                      }
                      return {}
                    }),
                  }),
                }
              }
              return {}
            }),
          }),
        }
      }
      return {}
    }),
  },
}))

vi.mock('@/actions/access-tokens', () => ({
  attachAccessToken: attachAccessTokenSpy,
}))

vi.mock('@/lib/email', () => ({
  sendRegistrationConfirmation: sendEmailSpy,
}))

import { createRegistration } from '@/actions/registrations'
import type { CreateRegistrationInput } from '@/actions/registrations'

const baseInput: CreateRegistrationInput = {
  orgId: 'org-1',
  campId: 'camp-1',
  orgSlug: 'acme',
  campSlug: 'summer-2026',
  campName: 'Summer Camp 2026',
  orgName: 'Acme Org',
  family: {
    first_name: 'Jane',
    last_name: 'Smith',
    email: 'jane@example.com',
    phone: '555-1234',
    address: { street: '', city: '', state: '', zip: '' },
    emergency_contact: { name: '', phone: '', relationship: '' },
  },
  members: [],
}

describe('createRegistration — waitlist', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    familySetSpy.mockResolvedValue(undefined)
    memberSetSpy.mockResolvedValue(undefined)
    attachAccessTokenSpy.mockResolvedValue('tok_abc')
    sendEmailSpy.mockResolvedValue(undefined)
  })

  it('sets registration_status pending when no capacity configured', async () => {
    getCampSpy.mockResolvedValue({
      exists: true,
      data: () => ({ id: 'camp-1', capacity: undefined }),
    })
    getFamiliesSpy.mockResolvedValue({ docs: [] })

    const result = await createRegistration(baseInput)

    const storedFamily = familySetSpy.mock.calls[0][0]
    expect(storedFamily.registration_status).toBe('pending')
    expect(result.waitlisted).toBe(false)
  })

  it('sets registration_status pending when under capacity', async () => {
    getCampSpy.mockResolvedValue({
      exists: true,
      data: () => ({ id: 'camp-1', capacity: 10 }),
    })
    // 5 active registrations, capacity is 10
    getFamiliesSpy.mockResolvedValue({
      docs: Array(5).fill(null).map(() => ({
        data: () => ({ registration_status: 'confirmed' }),
      })),
    })

    const result = await createRegistration(baseInput)

    const storedFamily = familySetSpy.mock.calls[0][0]
    expect(storedFamily.registration_status).toBe('pending')
    expect(result.waitlisted).toBe(false)
  })

  it('sets registration_status waitlisted when at capacity', async () => {
    getCampSpy.mockResolvedValue({
      exists: true,
      data: () => ({ id: 'camp-1', capacity: 5 }),
    })
    // 5 active registrations = at capacity
    getFamiliesSpy.mockResolvedValue({
      docs: Array(5).fill(null).map(() => ({
        data: () => ({ registration_status: 'confirmed' }),
      })),
    })

    const result = await createRegistration(baseInput)

    const storedFamily = familySetSpy.mock.calls[0][0]
    expect(storedFamily.registration_status).toBe('waitlisted')
    expect(result.waitlisted).toBe(true)
  })

  it('counts only pending and confirmed toward capacity (not cancelled or waitlisted)', async () => {
    getCampSpy.mockResolvedValue({
      exists: true,
      data: () => ({ id: 'camp-1', capacity: 3 }),
    })
    getFamiliesSpy.mockResolvedValue({
      docs: [
        { data: () => ({ registration_status: 'confirmed' }) },
        { data: () => ({ registration_status: 'pending' }) },
        { data: () => ({ registration_status: 'cancelled' }) },  // doesn't count
        { data: () => ({ registration_status: 'waitlisted' }) }, // doesn't count
      ],
    })

    const result = await createRegistration(baseInput)

    const storedFamily = familySetSpy.mock.calls[0][0]
    // 2 active out of capacity 3 → pending (not waitlisted)
    expect(storedFamily.registration_status).toBe('pending')
    expect(result.waitlisted).toBe(false)
  })

  it('skips confirmation email when skipConfirmationEmail is true', async () => {
    getCampSpy.mockResolvedValue({
      exists: true,
      data: () => ({ id: 'camp-1', capacity: undefined }),
    })
    getFamiliesSpy.mockResolvedValue({ docs: [] })

    await createRegistration({ ...baseInput, skipConfirmationEmail: true })

    expect(sendEmailSpy).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run __tests__/actions/registrations.test.ts
```

Expected: FAIL — `createRegistration` doesn't check capacity yet and always returns `waitlisted: false`.

- [ ] **Step 3: Update `actions/registrations.ts` — capacity check**

Replace the full implementation of `createRegistration` with:

```typescript
'use server'

import { adminDb } from '@/lib/firebase-admin'
import { attachAccessToken } from '@/actions/access-tokens'
import { sendRegistrationConfirmation } from '@/lib/email'
import type { Camp, Family, FamilyMember } from '@/lib/types'
import { buildFamilyId } from '@/lib/tokens'

export interface CreateRegistrationInput {
  orgId: string
  campId: string
  orgSlug: string
  campSlug: string
  campName: string
  orgName: string
  family: Omit<Family,
    | 'id' | 'org_id' | 'camp_id' | 'org_slug' | 'camp_slug'
    | 'camp_name' | 'org_name' | 'registration_status' | 'payment_status'
    | 'registrant_uid' | 'pco_household_id' | 'access_token'
    | 'access_token_expires_at' | 'created_at' | 'updated_at'
  >
  members: Omit<FamilyMember, 'id' | 'family_id'>[]
  registrantUid?: string
  skipConfirmationEmail?: boolean  // set true for paid registrations; email sent after payment webhook
}

export async function createRegistration(
  input: CreateRegistrationInput
): Promise<{ familyId: string; accessToken: string; waitlisted: boolean }> {
  const familyId = buildFamilyId()
  const now = new Date().toISOString()

  // Determine registration status — check capacity if set on the camp
  let registrationStatus: Family['registration_status'] = 'pending'

  const campRef = adminDb
    .collection('orgs').doc(input.orgId)
    .collection('camps').doc(input.campId)

  const campSnap = await campRef.get()
  const camp = campSnap.exists ? (campSnap.data() as Camp) : null

  if (camp?.capacity) {
    const familiesSnap = await campRef.collection('families').get()
    const activeCount = familiesSnap.docs.reduce((count, doc) => {
      const status = (doc.data() as Family).registration_status
      return status === 'pending' || status === 'confirmed' ? count + 1 : count
    }, 0)
    if (activeCount >= camp.capacity) {
      registrationStatus = 'waitlisted'
    }
  }

  const waitlisted = registrationStatus === 'waitlisted'

  const family: Family = {
    id: familyId,
    org_id: input.orgId,
    camp_id: input.campId,
    org_slug: input.orgSlug,
    camp_slug: input.campSlug,
    camp_name: input.campName,
    org_name: input.orgName,
    ...input.family,
    registration_status: registrationStatus,
    payment_status: 'unpaid',
    registrant_uid: input.registrantUid ?? null,
    pco_household_id: null,
    access_token: null,
    access_token_expires_at: null,
    created_at: now,
    updated_at: now,
  }

  const familyRef = campRef.collection('families').doc(familyId)
  await familyRef.set(family)

  // Write each family member
  for (const member of input.members) {
    const memberId = buildFamilyId()
    await familyRef
      .collection('family_members').doc(memberId)
      .set({ id: memberId, family_id: familyId, ...member })
  }

  // Attach signed URL token
  const accessToken = await attachAccessToken(input.orgId, input.campId, familyId)

  // Send confirmation email (skipped for paid registrations; sent after payment webhook confirms payment)
  if (!input.skipConfirmationEmail) {
    await sendRegistrationConfirmation({
      to: input.family.email,
      firstName: input.family.first_name,
      campName: input.campName,
      orgName: input.orgName,
      orgSlug: input.orgSlug,
      campSlug: input.campSlug,
      familyId,
      accessToken,
    })
  }

  return { familyId, accessToken, waitlisted }
}

// ... keep all other existing exports unchanged (getRegistrationByToken, etc.) ...
```

Keep all the existing `getRegistrationByToken`, `getRegistrationByUid`, `getAllRegistrationsByUid`, `getFamilyMembers`, `updateRegistration`, `linkRegistrantAccount` functions unchanged after `createRegistration`.

- [ ] **Step 4: Update confirmation page for waitlisted registrants**

Replace `app/(public)/[orgSlug]/[campSlug]/register/confirmation/page.tsx`:

```tsx
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default async function ConfirmationPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; campSlug: string }>
  searchParams: Promise<{ email?: string; status?: string }>
}) {
  const { orgSlug, campSlug } = await params
  const { email, status } = await searchParams
  const isWaitlisted = status === 'waitlisted'

  return (
    <div className="min-h-screen bg-[#FAF5FF] flex items-center justify-center px-4">
      <div className="max-w-md text-center">
        {isWaitlisted ? (
          <>
            <div className="text-5xl mb-4">&#9203;</div>
            <h1 className="text-2xl font-bold text-[#4C1D95] mb-3">You&apos;re on the waitlist!</h1>
            <p className="text-gray-600 mb-2">
              This event is currently full. You&apos;ve been added to the waitlist and will be notified at{' '}
              <strong>{email ?? 'your email address'}</strong> if a spot opens up.
            </p>
            <p className="text-sm text-gray-500 mb-6">
              Keep an eye on your inbox — you&apos;ll hear from the organizers if your registration is confirmed.
            </p>
          </>
        ) : (
          <>
            <div className="text-5xl mb-4">&#10003;</div>
            <h1 className="text-2xl font-bold text-[#4C1D95] mb-3">You&apos;re registered!</h1>
            <p className="text-gray-600 mb-2">
              A confirmation email with a link to your registration has been sent to{' '}
              <strong>{email ?? 'your email address'}</strong>.
            </p>
            <p className="text-sm text-gray-500 mb-6">
              Use that link to view your registration, check your room assignment, and update your info.
            </p>
          </>
        )}
        <Link href={`/${orgSlug}/${campSlug}/register/create-account`}>
          <Button className="bg-[#7C3AED] hover:bg-[#6D28D9]">
            Create a free account to manage all your registrations
          </Button>
        </Link>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run waitlist tests**

```bash
npx vitest run __tests__/actions/registrations.test.ts
```

Expected: PASS — 5 tests

- [ ] **Step 6: Run full test suite and TypeScript check**

```bash
npx vitest run && npx tsc --noEmit
```

Expected: all pass, tsc clean.

- [ ] **Step 7: Commit**

```bash
git add \
  actions/registrations.ts \
  "app/(public)/[orgSlug]/[campSlug]/register/confirmation/page.tsx" \
  "__tests__/actions/registrations.test.ts"
git commit -m "feat: waitlist support — auto-enroll when event capacity reached, confirmation page adapts message"
```

---

## Self-Review Checklist

After all tasks, run:

```bash
npx vitest run
npx tsc --noEmit
```

Both must be clean before marking this plan complete.

**Spec coverage check:**
- [x] Individual registration type (skip members step) — Task 1
- [x] Child registration type (terminology-driven label in members step) — Task 1
- [x] Pre-fill from platform profile on return visits — Task 2
- [x] Waitlist support (auto-enroll when capacity reached) — Task 3
- [x] Waitlist status persisted on Family doc — Task 3
- [x] Confirmation page differentiates registered vs. waitlisted — Task 3
- [x] `registrantUid` linked to registration on pre-fill — Task 2

**Type consistency check:**
- `createRegistration` returns `{ familyId, accessToken, waitlisted: boolean }` — defined in Task 1 step 5, implemented in Task 3
- `FamilyMembersStep` prop `memberLabel?: string` — defined and used in Task 1
- `getRegistrantProfile(uid)` — already exported from `actions/registrant-auth.ts`, imported in Task 2
- `useAuth()` returns `{ user, loading, orgId, orgSlug, role }` — already in `hooks/useAuth.ts`
