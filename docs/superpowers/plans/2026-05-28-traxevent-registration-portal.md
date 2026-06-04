# TraxEvent Registration Form & Registrant Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the public registration form and full registrant self-service portal — including cross-org registrations dashboard — so families can register for any camp, receive a confirmation email with a signed-URL link to their registration, and optionally create an account to manage registrations across multiple orgs.

**Architecture:** Registration data lives at `orgs/{orgId}/camps/{campId}/families/{id}` (isolated per camp). Registrants access their data via two paths: a signed URL token stored on the family record (no account required, 90-day expiry) or Firebase Auth (no custom claims — registrant accounts are separate from org admin accounts). A Firestore `collectionGroup` query scoped to `registrant_uid == request.auth.uid` powers the cross-org registrations dashboard. Confirmation emails are sent via Resend. PCO pre-fill is explicitly out of scope here — it is Phase 3.

**Tech Stack:** Next.js 15 App Router · TypeScript · Firebase Auth (no claims for registrants) · Firestore · Resend (email) · Vitest + React Testing Library · shadcn/ui · Tailwind CSS

**Prerequisite:** Phase 1 Foundation plan must be complete (repo exists, Firebase configured, Firestore rules deployed, org/camp management working).

---

## File Map

```
app/
  (public)/[orgSlug]/[campSlug]/
    register/
      page.tsx                          # Multi-step registration form (public, no auth)
  (registrant)/
    layout.tsx                          # Auth guard: requires account OR valid token param
    my-registrations/
      page.tsx                          # Cross-org dashboard (requires account)
    [orgSlug]/[campSlug]/
      my-registration/
        page.tsx                        # Single-camp registration view (account or token)
      edit/
        page.tsx                        # Edit family + members (account or token)
    account/
      page.tsx                          # Registrant profile: name, contact, emergency
      family/
        page.tsx                        # Saved family members

actions/
  registrations.ts                      # createRegistration, getRegistration, updateRegistration, getRegistrationsByUid
  registrant-auth.ts                    # createRegistrantProfile, getRegistrantProfile, updateRegistrantProfile
  access-tokens.ts                      # generateAccessToken, validateAccessToken

components/
  registration/
    RegistrationForm.tsx                # Multi-step form container + step state
    steps/
      ContactStep.tsx                   # Primary contact fields
      FamilyMembersStep.tsx             # Add/edit/remove family members
      ReviewStep.tsx                    # Review + payment placeholder
    MemberRow.tsx                       # Single editable family member row
  registrant/
    RegistrationCard.tsx                # Card in my-registrations dashboard

lib/
  email.ts                              # sendRegistrationConfirmation()
  resend.ts                             # Resend client init

__tests__/
  actions/registrations.test.ts
  actions/access-tokens.test.ts
  actions/registrant-auth.test.ts
  components/registration/RegistrationForm.test.tsx
```

---

### Task 1: Add registrant types + update Firestore rules

**Files:**
- Modify: `lib/types.ts`
- Modify: `firestore.rules`

- [ ] **Step 1: Add registrant types to `lib/types.ts`**

Append to the existing `lib/types.ts`:

```typescript
export interface RegistrantProfile {
  uid: string
  display_name: string
  email: string
  phone: string
  address: {
    street: string
    city: string
    state: string
    zip: string
  }
  emergency_contact: {
    name: string
    phone: string
    relationship: string
  }
  saved_members: SavedFamilyMember[]
  created_at: string
  updated_at: string
}

export interface SavedFamilyMember {
  id: string
  first_name: string
  last_name: string
  birth_year: number
  gender: string
}

export interface Family {
  id: string
  org_id: string
  camp_id: string
  org_slug: string
  camp_slug: string
  camp_name: string
  org_name: string
  first_name: string
  last_name: string
  email: string
  phone: string
  address: { street: string; city: string; state: string; zip: string }
  emergency_contact: { name: string; phone: string; relationship: string }
  registration_status: 'pending' | 'confirmed' | 'waitlisted' | 'cancelled'
  payment_status: 'unpaid' | 'paid' | 'partial' | 'waived'
  registrant_uid: string | null
  pco_household_id: string | null
  access_token: string | null
  access_token_expires_at: string | null
  created_at: string
  updated_at: string
}

export interface FamilyMember {
  id: string
  family_id: string
  first_name: string
  last_name: string
  birth_year: number
  gender: string
  grade: string
  allergies: string
  dietary_restrictions: string
  tshirt_size: string
  medical_notes: string
}
```

- [ ] **Step 2: Add registrant rules to `firestore.rules`**

Add these two blocks inside the top-level `match /databases/{database}/documents` block, after the existing `/orgs/{orgId}` match:

```
// Registrant profiles — each registrant reads/writes their own doc only
match /registrant_profiles/{uid} {
  allow read, write: if request.auth != null && request.auth.uid == uid;
}

// Cross-org collectionGroup query — registrant reads their own family records
// across all orgs and camps. Scoped strictly to their uid.
match /{path=**}/families/{id} {
  allow read: if request.auth != null
    && resource.data.registrant_uid == request.auth.uid;
  allow update: if request.auth != null
    && resource.data.registrant_uid == request.auth.uid;
}
```

- [ ] **Step 3: Deploy updated rules**

```bash
firebase deploy --only firestore:rules
```
Expected: `Deploy complete!`

- [ ] **Step 4: Commit**

```bash
git add lib/types.ts firestore.rules
git commit -m "feat: registrant types and Firestore collectionGroup security rules"
```

---

### Task 2: Access token server actions

**Files:**
- Create: `actions/access-tokens.ts`
- Create: `__tests__/actions/access-tokens.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// __tests__/actions/access-tokens.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn().mockReturnThis(),
    doc: vi.fn().mockReturnThis(),
    update: vi.fn().mockResolvedValue(undefined),
    get: vi.fn(),
  },
}))

import { generateAccessToken, isTokenExpired } from '@/actions/access-tokens'

describe('generateAccessToken', () => {
  it('returns a 48-char hex string', () => {
    const token = generateAccessToken()
    expect(token).toMatch(/^[a-f0-9]{48}$/)
  })

  it('returns a unique value each call', () => {
    expect(generateAccessToken()).not.toBe(generateAccessToken())
  })
})

describe('isTokenExpired', () => {
  it('returns false for a future expiry date', () => {
    const future = new Date(Date.now() + 1000 * 60 * 60).toISOString()
    expect(isTokenExpired(future)).toBe(false)
  })

  it('returns true for a past expiry date', () => {
    const past = new Date(Date.now() - 1000).toISOString()
    expect(isTokenExpired(past)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test __tests__/actions/access-tokens.test.ts
```
Expected: FAIL — `generateAccessToken is not a function`

- [ ] **Step 3: Implement `actions/access-tokens.ts`**

```typescript
'use server'

import { randomBytes } from 'crypto'
import { adminDb } from '@/lib/firebase-admin'

export function generateAccessToken(): string {
  return randomBytes(24).toString('hex')
}

export function isTokenExpired(expiresAt: string): boolean {
  return new Date(expiresAt) < new Date()
}

// Attaches a signed access token to a family record. Called after createRegistration.
export async function attachAccessToken(
  orgId: string,
  campId: string,
  familyId: string
): Promise<string> {
  const token = generateAccessToken()
  const expiresAt = new Date(
    Date.now() + 90 * 24 * 60 * 60 * 1000 // 90 days
  ).toISOString()

  await adminDb
    .collection('orgs').doc(orgId)
    .collection('camps').doc(campId)
    .collection('families').doc(familyId)
    .update({ access_token: token, access_token_expires_at: expiresAt })

  return token
}

// Validates a token against a family record. Returns the family id if valid, null if not.
export async function validateAccessToken(
  orgId: string,
  campId: string,
  token: string
): Promise<string | null> {
  const snap = await adminDb
    .collection('orgs').doc(orgId)
    .collection('camps').doc(campId)
    .collection('families')
    .where('access_token', '==', token)
    .limit(1)
    .get()

  if (snap.empty) return null

  const data = snap.docs[0].data()
  if (isTokenExpired(data.access_token_expires_at)) return null

  return snap.docs[0].id
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test __tests__/actions/access-tokens.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add actions/access-tokens.ts __tests__/actions/access-tokens.test.ts
git commit -m "feat: access token generation and validation for signed-URL registration access"
```

---

### Task 3: Registration server actions

**Files:**
- Create: `actions/registrations.ts`
- Create: `__tests__/actions/registrations.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// __tests__/actions/registrations.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn().mockReturnThis(),
    doc: vi.fn().mockReturnThis(),
    set: vi.fn().mockResolvedValue(undefined),
    get: vi.fn(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    collectionGroup: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    id: 'family-id-123',
  },
}))

vi.mock('@/actions/access-tokens', () => ({
  attachAccessToken: vi.fn().mockResolvedValue('tok-abc123'),
}))

vi.mock('@/lib/email', () => ({
  sendRegistrationConfirmation: vi.fn().mockResolvedValue(undefined),
}))

import { buildFamilyId } from '@/actions/registrations'

describe('buildFamilyId', () => {
  it('returns a non-empty string', () => {
    const id = buildFamilyId()
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test __tests__/actions/registrations.test.ts
```
Expected: FAIL — `buildFamilyId is not a function`

- [ ] **Step 3: Implement `actions/registrations.ts`**

```typescript
'use server'

import { adminDb } from '@/lib/firebase-admin'
import { attachAccessToken } from '@/actions/access-tokens'
import { sendRegistrationConfirmation } from '@/lib/email'
import type { Family, FamilyMember } from '@/lib/types'
import { randomBytes } from 'crypto'

export function buildFamilyId(): string {
  return randomBytes(8).toString('hex')
}

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
}

export async function createRegistration(
  input: CreateRegistrationInput
): Promise<{ familyId: string; accessToken: string }> {
  const familyId = buildFamilyId()
  const now = new Date().toISOString()

  const family: Family = {
    id: familyId,
    org_id: input.orgId,
    camp_id: input.campId,
    org_slug: input.orgSlug,
    camp_slug: input.campSlug,
    camp_name: input.campName,
    org_name: input.orgName,
    ...input.family,
    registration_status: 'pending',
    payment_status: 'unpaid',
    registrant_uid: input.registrantUid ?? null,
    pco_household_id: null,
    access_token: null,
    access_token_expires_at: null,
    created_at: now,
    updated_at: now,
  }

  const familyRef = adminDb
    .collection('orgs').doc(input.orgId)
    .collection('camps').doc(input.campId)
    .collection('families').doc(familyId)

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

  // Send confirmation email
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

  return { familyId, accessToken }
}

export async function getRegistrationByToken(
  orgId: string,
  campId: string,
  token: string
): Promise<Family | null> {
  const snap = await adminDb
    .collection('orgs').doc(orgId)
    .collection('camps').doc(campId)
    .collection('families')
    .where('access_token', '==', token)
    .limit(1)
    .get()

  if (snap.empty) return null
  return snap.docs[0].data() as Family
}

export async function getRegistrationByUid(
  orgId: string,
  campId: string,
  uid: string
): Promise<Family | null> {
  const snap = await adminDb
    .collection('orgs').doc(orgId)
    .collection('camps').doc(campId)
    .collection('families')
    .where('registrant_uid', '==', uid)
    .limit(1)
    .get()

  if (snap.empty) return null
  return snap.docs[0].data() as Family
}

export async function getAllRegistrationsByUid(uid: string): Promise<Family[]> {
  const snap = await adminDb
    .collectionGroup('families')
    .where('registrant_uid', '==', uid)
    .orderBy('created_at', 'desc')
    .get()

  return snap.docs.map((d) => d.data() as Family)
}

export async function getFamilyMembers(
  orgId: string,
  campId: string,
  familyId: string
): Promise<FamilyMember[]> {
  const snap = await adminDb
    .collection('orgs').doc(orgId)
    .collection('camps').doc(campId)
    .collection('families').doc(familyId)
    .collection('family_members')
    .get()

  return snap.docs.map((d) => d.data() as FamilyMember)
}

export async function updateRegistration(
  orgId: string,
  campId: string,
  familyId: string,
  updates: Partial<Pick<Family,
    'first_name' | 'last_name' | 'email' | 'phone' |
    'address' | 'emergency_contact'
  >>
): Promise<void> {
  await adminDb
    .collection('orgs').doc(orgId)
    .collection('camps').doc(campId)
    .collection('families').doc(familyId)
    .update({ ...updates, updated_at: new Date().toISOString() })
}

export async function linkRegistrantAccount(
  orgId: string,
  campId: string,
  familyId: string,
  uid: string
): Promise<void> {
  await adminDb
    .collection('orgs').doc(orgId)
    .collection('camps').doc(campId)
    .collection('families').doc(familyId)
    .update({ registrant_uid: uid, updated_at: new Date().toISOString() })
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test __tests__/actions/registrations.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add actions/registrations.ts __tests__/actions/registrations.test.ts
git commit -m "feat: registration server actions (create, get, update, cross-org query)"
```

---

### Task 4: Registrant profile server actions

**Files:**
- Create: `actions/registrant-auth.ts`
- Create: `__tests__/actions/registrant-auth.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// __tests__/actions/registrant-auth.test.ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn().mockReturnThis(),
    doc: vi.fn().mockReturnThis(),
    set: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue({ exists: false }),
  },
}))

import { buildEmptyProfile } from '@/actions/registrant-auth'

describe('buildEmptyProfile', () => {
  it('returns a profile with the given uid and email', () => {
    const profile = buildEmptyProfile('uid-123', 'test@example.com', 'Jane Doe')
    expect(profile.uid).toBe('uid-123')
    expect(profile.email).toBe('test@example.com')
    expect(profile.display_name).toBe('Jane Doe')
    expect(profile.saved_members).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test __tests__/actions/registrant-auth.test.ts
```
Expected: FAIL — `buildEmptyProfile is not a function`

- [ ] **Step 3: Implement `actions/registrant-auth.ts`**

```typescript
'use server'

import { adminDb } from '@/lib/firebase-admin'
import type { RegistrantProfile, SavedFamilyMember } from '@/lib/types'
import { randomBytes } from 'crypto'

export function buildEmptyProfile(
  uid: string,
  email: string,
  displayName: string
): RegistrantProfile {
  const now = new Date().toISOString()
  return {
    uid,
    display_name: displayName,
    email,
    phone: '',
    address: { street: '', city: '', state: '', zip: '' },
    emergency_contact: { name: '', phone: '', relationship: '' },
    saved_members: [],
    created_at: now,
    updated_at: now,
  }
}

export async function createRegistrantProfile(
  uid: string,
  email: string,
  displayName: string
): Promise<RegistrantProfile> {
  const profile = buildEmptyProfile(uid, email, displayName)
  await adminDb.collection('registrant_profiles').doc(uid).set(profile)
  return profile
}

export async function getRegistrantProfile(
  uid: string
): Promise<RegistrantProfile | null> {
  const snap = await adminDb.collection('registrant_profiles').doc(uid).get()
  return snap.exists ? (snap.data() as RegistrantProfile) : null
}

export async function updateRegistrantProfile(
  uid: string,
  updates: Partial<Omit<RegistrantProfile, 'uid' | 'created_at' | 'updated_at'>>
): Promise<void> {
  await adminDb
    .collection('registrant_profiles').doc(uid)
    .update({ ...updates, updated_at: new Date().toISOString() })
}

export async function upsertSavedMember(
  uid: string,
  member: Omit<SavedFamilyMember, 'id'>
): Promise<SavedFamilyMember> {
  const profile = await getRegistrantProfile(uid)
  if (!profile) throw new Error('Profile not found')

  const newMember: SavedFamilyMember = {
    id: randomBytes(8).toString('hex'),
    ...member,
  }

  const saved_members = [...profile.saved_members, newMember]
  await adminDb
    .collection('registrant_profiles').doc(uid)
    .update({ saved_members, updated_at: new Date().toISOString() })

  return newMember
}

export async function deleteSavedMember(uid: string, memberId: string): Promise<void> {
  const profile = await getRegistrantProfile(uid)
  if (!profile) throw new Error('Profile not found')

  const saved_members = profile.saved_members.filter((m) => m.id !== memberId)
  await adminDb
    .collection('registrant_profiles').doc(uid)
    .update({ saved_members, updated_at: new Date().toISOString() })
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test __tests__/actions/registrant-auth.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add actions/registrant-auth.ts __tests__/actions/registrant-auth.test.ts
git commit -m "feat: registrant profile server actions"
```

---

### Task 5: Confirmation email via Resend

**Files:**
- Create: `lib/resend.ts`
- Create: `lib/email.ts`

- [ ] **Step 1: Install Resend**

```bash
npm install resend
```

- [ ] **Step 2: Add `RESEND_API_KEY` to `.env.local` and `.env.example`**

In `.env.example`, add:
```
# Resend (transactional email)
RESEND_API_KEY=
RESEND_FROM_EMAIL=noreply@traxevent.com
```

Add your actual key to `.env.local`.

- [ ] **Step 3: Create `lib/resend.ts`**

```typescript
import { Resend } from 'resend'

if (!process.env.RESEND_API_KEY) {
  throw new Error('RESEND_API_KEY is not set')
}

export const resend = new Resend(process.env.RESEND_API_KEY)
export const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'noreply@traxevent.com'
```

- [ ] **Step 4: Create `lib/email.ts`**

```typescript
import { resend, FROM_EMAIL } from '@/lib/resend'

interface RegistrationConfirmationParams {
  to: string
  firstName: string
  campName: string
  orgName: string
  orgSlug: string
  campSlug: string
  familyId: string
  accessToken: string
}

export async function sendRegistrationConfirmation(
  params: RegistrationConfirmationParams
): Promise<void> {
  const portalUrl = `https://${params.orgSlug}.traxevent.com/${params.campSlug}/my-registration?token=${params.accessToken}`
  const accountUrl = `https://${params.orgSlug}.traxevent.com/register/create-account?token=${params.accessToken}&familyId=${params.familyId}`

  await resend.emails.send({
    from: FROM_EMAIL,
    to: params.to,
    subject: `Registration confirmed — ${params.campName}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h1 style="color:#7C3AED;margin-bottom:8px">You're registered!</h1>
        <p style="color:#4C1D95;font-size:16px;margin-bottom:24px">
          Hi ${params.firstName}, your registration for <strong>${params.campName}</strong>
          at ${params.orgName} has been received.
        </p>

        <a href="${portalUrl}"
           style="display:inline-block;background:#7C3AED;color:#fff;padding:12px 24px;
                  border-radius:6px;text-decoration:none;font-weight:600;margin-bottom:24px">
          View my registration
        </a>

        <p style="color:#64748B;font-size:14px;margin-bottom:8px">
          This link works without an account and is valid for 90 days.
        </p>

        <hr style="border:none;border-top:1px solid #DDD6FE;margin:24px 0" />

        <p style="color:#64748B;font-size:13px">
          Want to log in anytime to manage your registrations?
          <a href="${accountUrl}" style="color:#7C3AED">Create a free account</a>
          — it takes 30 seconds and lets you see all your camp registrations in one place.
        </p>
      </div>
    `,
  })
}
```

- [ ] **Step 5: Add env vars to Vercel**

```bash
vercel env add RESEND_API_KEY production preview development
vercel env add RESEND_FROM_EMAIL production preview development
```

- [ ] **Step 6: Commit**

```bash
git add lib/resend.ts lib/email.ts .env.example package.json package-lock.json
git commit -m "feat: Resend email client and registration confirmation email"
```

---

### Task 6: Multi-step registration form

**Files:**
- Create: `components/registration/RegistrationForm.tsx`
- Create: `components/registration/steps/ContactStep.tsx`
- Create: `components/registration/steps/FamilyMembersStep.tsx`
- Create: `components/registration/steps/ReviewStep.tsx`
- Create: `components/registration/MemberRow.tsx`
- Create: `app/(public)/[orgSlug]/[campSlug]/register/page.tsx`
- Create: `__tests__/components/registration/RegistrationForm.test.tsx`

- [ ] **Step 1: Write failing component test**

```typescript
// __tests__/components/registration/RegistrationForm.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { RegistrationForm } from '@/components/registration/RegistrationForm'

vi.mock('@/actions/registrations', () => ({
  createRegistration: vi.fn(),
}))

const mockCamp = {
  id: 'camp-1',
  name: 'Family Camp 2026',
  slug: 'family-camp-2026',
  year: 2026,
  status: 'active' as const,
  registration_type: 'family' as const,
  features: { accommodations: true, teams: true, budget: true, itinerary: true, communicate: true },
  camp_start: '2026-07-10',
  camp_end: '2026-07-13',
  created_at: '2026-01-01',
}

const mockOrg = {
  id: 'org-1',
  name: 'First Hills Fellowship',
  slug: 'firsthills',
  billing_status: 'active' as const,
  created_at: '2026-01-01',
}

describe('RegistrationForm', () => {
  it('renders the first step heading', () => {
    render(<RegistrationForm camp={mockCamp} org={mockOrg} />)
    expect(screen.getByText(/Step 1 of 3/i)).toBeInTheDocument()
    expect(screen.getByText(/Contact Information/i)).toBeInTheDocument()
  })

  it('shows Step 2 after completing Step 1', async () => {
    render(<RegistrationForm camp={mockCamp} org={mockOrg} />)
    await userEvent.type(screen.getByLabelText(/First name/i), 'Jane')
    await userEvent.type(screen.getByLabelText(/Last name/i), 'Smith')
    await userEvent.type(screen.getByLabelText(/Email/i), 'jane@example.com')
    await userEvent.type(screen.getByLabelText(/Phone/i), '555-1234')
    await userEvent.click(screen.getByRole('button', { name: /Next/i }))
    expect(screen.getByText(/Step 2 of 3/i)).toBeInTheDocument()
    expect(screen.getByText(/Family Members/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test __tests__/components/registration/RegistrationForm.test.tsx
```
Expected: FAIL — `RegistrationForm` not found

- [ ] **Step 3: Create `components/registration/steps/ContactStep.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import type { Family } from '@/lib/types'

type ContactData = Pick<Family,
  'first_name' | 'last_name' | 'email' | 'phone' | 'address' | 'emergency_contact'
>

interface ContactStepProps {
  initial: Partial<ContactData>
  onNext: (data: ContactData) => void
}

export function ContactStep({ initial, onNext }: ContactStepProps) {
  const [firstName, setFirstName] = useState(initial.first_name ?? '')
  const [lastName, setLastName] = useState(initial.last_name ?? '')
  const [email, setEmail] = useState(initial.email ?? '')
  const [phone, setPhone] = useState(initial.phone ?? '')
  const [street, setStreet] = useState(initial.address?.street ?? '')
  const [city, setCity] = useState(initial.address?.city ?? '')
  const [state, setState] = useState(initial.address?.state ?? '')
  const [zip, setZip] = useState(initial.address?.zip ?? '')
  const [ecName, setEcName] = useState(initial.emergency_contact?.name ?? '')
  const [ecPhone, setEcPhone] = useState(initial.emergency_contact?.phone ?? '')
  const [ecRel, setEcRel] = useState(initial.emergency_contact?.relationship ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})

  function validate(): boolean {
    const e: Record<string, string> = {}
    if (!firstName.trim()) e.first_name = 'Required'
    if (!lastName.trim()) e.last_name = 'Required'
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Valid email required'
    if (!phone.trim()) e.phone = 'Required'
    if (!ecName.trim()) e.ec_name = 'Required'
    if (!ecPhone.trim()) e.ec_phone = 'Required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function handleNext() {
    if (!validate()) return
    onNext({
      first_name: firstName,
      last_name: lastName,
      email,
      phone,
      address: { street, city, state, zip },
      emergency_contact: { name: ecName, phone: ecPhone, relationship: ecRel },
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[#4C1D95] mb-4">Contact Information</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="first_name">First name</Label>
            <Input
              id="first_name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              onBlur={() => !firstName.trim() && setErrors((p) => ({ ...p, first_name: 'Required' }))}
            />
            {errors.first_name && <p className="text-xs text-red-600">{errors.first_name}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="last_name">Last name</Label>
            <Input
              id="last_name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              onBlur={() => !lastName.trim() && setErrors((p) => ({ ...p, last_name: 'Required' }))}
            />
            {errors.last_name && <p className="text-xs text-red-600">{errors.last_name}</p>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => {
                if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
                  setErrors((p) => ({ ...p, email: 'Valid email required' }))
              }}
            />
            {errors.email && <p className="text-xs text-red-600">{errors.email}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onBlur={() => !phone.trim() && setErrors((p) => ({ ...p, phone: 'Required' }))}
            />
            {errors.phone && <p className="text-xs text-red-600">{errors.phone}</p>}
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-600 mb-3 uppercase tracking-wide">Address</h3>
        <div className="space-y-3">
          <Input placeholder="Street address" value={street} onChange={(e) => setStreet(e.target.value)} />
          <div className="grid grid-cols-3 gap-3">
            <Input placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} />
            <Input placeholder="State" value={state} onChange={(e) => setState(e.target.value)} maxLength={2} />
            <Input placeholder="ZIP" value={zip} onChange={(e) => setZip(e.target.value)} maxLength={10} />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-600 mb-3 uppercase tracking-wide">Emergency Contact</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="ec_name">Name</Label>
            <Input
              id="ec_name"
              value={ecName}
              onChange={(e) => setEcName(e.target.value)}
              onBlur={() => !ecName.trim() && setErrors((p) => ({ ...p, ec_name: 'Required' }))}
            />
            {errors.ec_name && <p className="text-xs text-red-600">{errors.ec_name}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="ec_phone">Phone</Label>
            <Input
              id="ec_phone"
              type="tel"
              value={ecPhone}
              onChange={(e) => setEcPhone(e.target.value)}
              onBlur={() => !ecPhone.trim() && setErrors((p) => ({ ...p, ec_phone: 'Required' }))}
            />
            {errors.ec_phone && <p className="text-xs text-red-600">{errors.ec_phone}</p>}
          </div>
        </div>
        <div className="mt-3">
          <Label htmlFor="ec_rel">Relationship</Label>
          <Input
            id="ec_rel"
            className="mt-1"
            placeholder="e.g. Spouse, Parent"
            value={ecRel}
            onChange={(e) => setEcRel(e.target.value)}
          />
        </div>
      </div>

      <Button className="w-full bg-[#7C3AED] hover:bg-[#6D28D9]" onClick={handleNext}>
        Next: Family Members
      </Button>
    </div>
  )
}
```

- [ ] **Step 4: Create `components/registration/MemberRow.tsx`**

```typescript
'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import type { FamilyMember } from '@/lib/types'

type MemberInput = Omit<FamilyMember, 'id' | 'family_id'>

interface MemberRowProps {
  index: number
  member: MemberInput
  onChange: (index: number, updated: MemberInput) => void
  onRemove: (index: number) => void
}

export function MemberRow({ index, member, onChange, onRemove }: MemberRowProps) {
  function update(field: keyof MemberInput, value: string) {
    onChange(index, { ...member, [field]: value })
  }

  return (
    <div className="border rounded-lg p-4 bg-[#FAF5FF] space-y-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-semibold text-[#4C1D95]">Person {index + 1}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onRemove(index)}
          className="text-gray-400 hover:text-red-600 h-auto py-1"
        >
          Remove
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor={`m-fn-${index}`}>First name</Label>
          <Input id={`m-fn-${index}`} value={member.first_name} onChange={(e) => update('first_name', e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`m-ln-${index}`}>Last name</Label>
          <Input id={`m-ln-${index}`} value={member.last_name} onChange={(e) => update('last_name', e.target.value)} required />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label htmlFor={`m-by-${index}`}>Birth year</Label>
          <Input id={`m-by-${index}`} type="number" value={member.birth_year || ''} onChange={(e) => update('birth_year', e.target.value)} min={1920} max={2026} />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`m-g-${index}`}>Gender</Label>
          <Input id={`m-g-${index}`} value={member.gender} onChange={(e) => update('gender', e.target.value)} placeholder="Optional" />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`m-gr-${index}`}>Grade</Label>
          <Input id={`m-gr-${index}`} value={member.grade} onChange={(e) => update('grade', e.target.value)} placeholder="Optional" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor={`m-ts-${index}`}>T-shirt size</Label>
          <select
            id={`m-ts-${index}`}
            className="w-full border rounded-md px-3 py-2 text-sm bg-white"
            value={member.tshirt_size}
            onChange={(e) => update('tshirt_size', e.target.value)}
          >
            <option value="">-- Select --</option>
            {['YS','YM','YL','AS','AM','AL','AXL','A2XL'].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`m-diet-${index}`}>Dietary restrictions</Label>
          <Input id={`m-diet-${index}`} value={member.dietary_restrictions} onChange={(e) => update('dietary_restrictions', e.target.value)} placeholder="None" />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`m-allergy-${index}`}>Allergies</Label>
        <Input id={`m-allergy-${index}`} value={member.allergies} onChange={(e) => update('allergies', e.target.value)} placeholder="None" />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`m-med-${index}`}>Medical notes</Label>
        <Input id={`m-med-${index}`} value={member.medical_notes} onChange={(e) => update('medical_notes', e.target.value)} placeholder="None" />
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Create `components/registration/steps/FamilyMembersStep.tsx`**

```typescript
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
}

export function FamilyMembersStep({ initial, onNext, onBack }: FamilyMembersStepProps) {
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
      <h2 className="text-lg font-semibold text-[#4C1D95]">Family Members</h2>
      <p className="text-sm text-gray-500">Add everyone who will be attending camp.</p>

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

- [ ] **Step 6: Create `components/registration/steps/ReviewStep.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { Family, FamilyMember } from '@/lib/types'

type ContactData = Pick<Family, 'first_name' | 'last_name' | 'email' | 'phone' | 'address' | 'emergency_contact'>
type MemberInput = Omit<FamilyMember, 'id' | 'family_id'>

interface ReviewStepProps {
  contact: ContactData
  members: MemberInput[]
  campName: string
  onSubmit: () => Promise<void>
  onBack: () => void
}

export function ReviewStep({ contact, members, campName, onSubmit, onBack }: ReviewStepProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    setError(null)
    setLoading(true)
    try {
      await onSubmit()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-[#4C1D95]">Review your registration</h2>

      <div className="bg-[#FAF5FF] rounded-lg p-4 space-y-1 text-sm">
        <p className="font-semibold text-gray-700">{campName}</p>
        <p className="text-gray-600">{contact.first_name} {contact.last_name}</p>
        <p className="text-gray-500">{contact.email} · {contact.phone}</p>
        {contact.address.city && (
          <p className="text-gray-500">{contact.address.city}, {contact.address.state} {contact.address.zip}</p>
        )}
      </div>

      <div>
        <p className="text-sm font-semibold text-gray-600 mb-2">
          {members.length} {members.length === 1 ? 'person' : 'people'} attending
        </p>
        <ul className="text-sm text-gray-600 space-y-1">
          {members.map((m, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#7C3AED] flex-shrink-0" />
              {m.first_name} {m.last_name}
              {m.birth_year ? ` (b. ${m.birth_year})` : ''}
            </li>
          ))}
        </ul>
      </div>

      <div className="bg-[#ECEEF9] rounded-md p-3 text-xs text-gray-500">
        Payment is handled by the camp organizer. You will receive instructions after your registration is confirmed.
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={onBack} disabled={loading}>
          Back
        </Button>
        <Button
          className="flex-1 bg-[#7C3AED] hover:bg-[#6D28D9]"
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading ? 'Submitting…' : 'Submit registration'}
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Create `components/registration/RegistrationForm.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ContactStep } from './steps/ContactStep'
import { FamilyMembersStep } from './steps/FamilyMembersStep'
import { ReviewStep } from './steps/ReviewStep'
import { createRegistration } from '@/actions/registrations'
import type { Camp, Family, FamilyMember, Org } from '@/lib/types'

type ContactData = Pick<Family, 'first_name' | 'last_name' | 'email' | 'phone' | 'address' | 'emergency_contact'>
type MemberInput = Omit<FamilyMember, 'id' | 'family_id'>

const STEPS = ['Contact Information', 'Family Members', 'Review'] as const

interface RegistrationFormProps {
  camp: Camp
  org: Org
}

export function RegistrationForm({ camp, org }: RegistrationFormProps) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [contact, setContact] = useState<Partial<ContactData>>({})
  const [members, setMembers] = useState<MemberInput[]>([])

  async function handleSubmit() {
    await createRegistration({
      orgId: org.id,
      campId: camp.id,
      orgSlug: org.slug,
      campSlug: camp.slug,
      campName: camp.name,
      orgName: org.name,
      family: contact as ContactData,
      members,
    })
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
            Step {step + 1} of {STEPS.length}: {STEPS[step]}
          </p>
          {/* Progress bar */}
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
              onSubmit={handleSubmit}
              onBack={() => setStep(1)}
            />
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 8: Create `app/(public)/[orgSlug]/[campSlug]/register/page.tsx`**

```typescript
import { getOrgBySlug } from '@/actions/orgs'
import { getCampBySlug } from '@/actions/camps'
import { RegistrationForm } from '@/components/registration/RegistrationForm'
import { notFound } from 'next/navigation'

export default async function RegisterPage({
  params,
}: {
  params: { orgSlug: string; campSlug: string }
}) {
  const [org, camp] = await Promise.all([
    getOrgBySlug(params.orgSlug),
    // getCampBySlug requires orgId — get org first
    getOrgBySlug(params.orgSlug).then((o) =>
      o ? getCampBySlug(o.id, params.campSlug) : null
    ),
  ])

  if (!org || !camp) notFound()
  if (camp.status === 'archived') notFound()

  return <RegistrationForm camp={camp} org={org} />
}
```

Note: the double `getOrgBySlug` call above runs in parallel but fetches org twice. Simplify by sequencing:

```typescript
export default async function RegisterPage({
  params,
}: {
  params: { orgSlug: string; campSlug: string }
}) {
  const org = await getOrgBySlug(params.orgSlug)
  if (!org) notFound()

  const camp = await getCampBySlug(org.id, params.campSlug)
  if (!camp || camp.status === 'archived') notFound()

  return <RegistrationForm camp={camp} org={org} />
}
```

- [ ] **Step 9: Create confirmation page `app/(public)/[orgSlug]/[campSlug]/register/confirmation/page.tsx`**

```typescript
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function ConfirmationPage({
  params,
  searchParams,
}: {
  params: { orgSlug: string; campSlug: string }
  searchParams: { email?: string }
}) {
  return (
    <div className="min-h-screen bg-[#FAF5FF] flex items-center justify-center px-4">
      <div className="max-w-md text-center">
        <div className="text-5xl mb-4">✓</div>
        <h1 className="text-2xl font-bold text-[#4C1D95] mb-3">You&apos;re registered!</h1>
        <p className="text-gray-600 mb-2">
          A confirmation email with a link to your registration has been sent to{' '}
          <strong>{searchParams.email ?? 'your email address'}</strong>.
        </p>
        <p className="text-sm text-gray-500 mb-6">
          Use that link to view your registration, check your room assignment, and update your info.
        </p>
        <Link href={`/${params.orgSlug}/${params.campSlug}/register/create-account`}>
          <Button className="bg-[#7C3AED] hover:bg-[#6D28D9]">
            Create a free account to manage all your registrations
          </Button>
        </Link>
      </div>
    </div>
  )
}
```

- [ ] **Step 10: Run tests**

```bash
npm test __tests__/components/registration/RegistrationForm.test.tsx
```
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add components/registration/ \
  "app/(public)/[orgSlug]/[campSlug]/register/"
git commit -m "feat: multi-step registration form with contact, members, and review steps"
```

---

### Task 7: Registrant login + account creation

**Files:**
- Create: `app/(public)/[orgSlug]/[campSlug]/register/create-account/page.tsx`
- Modify: `app/(auth)/login/page.tsx`

- [ ] **Step 1: Create `app/(public)/[orgSlug]/[campSlug]/register/create-account/page.tsx`**

This page is linked from the confirmation email and the confirmation page. It creates a Firebase Auth account and links it to the family record via the access token.

```typescript
'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { createRegistrantProfile } from '@/actions/registrant-auth'
import { linkRegistrantAccount } from '@/actions/registrations'
import { validateAccessToken } from '@/actions/access-tokens'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function CreateAccountPage({
  params,
}: {
  params: { orgSlug: string; campSlug: string }
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const familyId = searchParams.get('familyId') ?? ''

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password)
      await updateProfile(cred.user, { displayName: name })
      await createRegistrantProfile(cred.user.uid, email, name)

      // If we have a token + familyId, link this account to the registration
      if (token && familyId) {
        // Verify token is still valid before linking
        // We need orgId+campId — look them up via org/camp slugs
        // For now link directly; the server action re-validates
        // (full impl: pass orgId+campId from page params via server component)
        // TODO in Phase 3: thread orgId+campId through the URL
      }

      router.push('/my-registrations')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Account creation failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#FAF5FF] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <Card className="border-[#DDD6FE]">
          <CardHeader>
            <CardTitle className="text-[#4C1D95]">Create your free account</CardTitle>
            <p className="text-sm text-gray-500">
              See all your camp registrations in one place.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="name">Full name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button type="submit" className="w-full bg-[#7C3AED] hover:bg-[#6D28D9]" disabled={loading}>
                {loading ? 'Creating account…' : 'Create account'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update login redirect in `app/(auth)/login/page.tsx`**

Change the redirect after login so users with no org claim go to `/my-registrations` (registrant) instead of `/onboarding` (org admin setup):

Find this block in the existing login page:
```typescript
const orgSlug = result.claims.orgSlug as string | undefined
router.push(orgSlug ? `/${orgSlug}` : '/onboarding')
```

Replace with:
```typescript
const orgSlug = result.claims.orgSlug as string | undefined
router.push(orgSlug ? `/${orgSlug}` : '/my-registrations')
```

Add a note below the sign-in button (append to the existing card footer):
```typescript
<p className="mt-3 text-xs text-center text-gray-400">
  Setting up an org?{' '}
  <Link href="/onboarding" className="text-[#7C3AED] hover:underline">
    Create your organization
  </Link>
</p>
```

- [ ] **Step 3: Commit**

```bash
git add "app/(public)/[orgSlug]/[campSlug]/register/create-account/" \
  "app/(auth)/login/page.tsx"
git commit -m "feat: registrant account creation page and updated login redirect"
```

---

### Task 8: Registrant layout + token-aware auth guard

**Files:**
- Create: `app/(registrant)/layout.tsx`

- [ ] **Step 1: Create `app/(registrant)/layout.tsx`**

The registrant section allows access via either Firebase Auth OR a valid `?token=` URL param. The token is validated server-side per page — the layout only enforces that at least one of the two is present.

```typescript
'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import Link from 'next/link'

export default function RegistrantLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading } = useAuth()
  const token = searchParams.get('token')

  useEffect(() => {
    // If no auth AND no token, redirect to login
    if (!loading && !user && !token) {
      router.push(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`)
    }
  }, [loading, user, token, router])

  if (loading) return null

  return (
    <div className="min-h-screen bg-[#FAF5FF]">
      <header className="bg-white border-b border-[#DDD6FE] px-4 py-3 flex items-center justify-between">
        <Link href="/my-registrations" className="font-bold text-[#7C3AED] text-lg">
          TraxEvent
        </Link>
        {user && (
          <Link href="/account" className="text-sm text-gray-500 hover:text-[#7C3AED]">
            My account
          </Link>
        )}
      </header>
      <main className="max-w-2xl mx-auto px-4 py-8">{children}</main>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(registrant)/layout.tsx"
git commit -m "feat: registrant layout with token-aware auth guard"
```

---

### Task 9: My-registration page (single camp)

**Files:**
- Create: `app/(registrant)/[orgSlug]/[campSlug]/my-registration/page.tsx`

- [ ] **Step 1: Create the page**

```typescript
import { getOrgBySlug } from '@/actions/orgs'
import { getCampBySlug } from '@/actions/camps'
import { getRegistrationByToken, getRegistrationByUid, getFamilyMembers } from '@/actions/registrations'
import { notFound, redirect } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { adminAuth } from '@/lib/firebase-admin'

export default async function MyRegistrationPage({
  params,
  searchParams,
}: {
  params: { orgSlug: string; campSlug: string }
  searchParams: { token?: string }
}) {
  const org = await getOrgBySlug(params.orgSlug)
  if (!org) notFound()

  const camp = await getCampBySlug(org.id, params.campSlug)
  if (!camp) notFound()

  let family = null

  // Try signed-URL token first
  if (searchParams.token) {
    family = await getRegistrationByToken(org.id, camp.id, searchParams.token)
  }

  // Fall back to authenticated user
  if (!family) {
    // Server-side: get uid from session cookie
    // (In Next.js App Router, Firebase session cookies require a custom implementation
    // or middleware. For MVP, the client-side auth guard in layout.tsx handles redirect.
    // This page renders null for unauthenticated users — the layout redirects them.)
    // Full session cookie auth is Phase 3.
    family = null
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

  const members = await getFamilyMembers(org.id, camp.id, family.id)

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

      <Link
        href={`/${params.orgSlug}/${params.campSlug}/edit${searchParams.token ? `?token=${searchParams.token}` : ''}`}
      >
        <Button variant="outline" className="w-full border-[#7C3AED] text-[#7C3AED]">
          Edit registration
        </Button>
      </Link>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(registrant)/[orgSlug]/[campSlug]/my-registration/"
git commit -m "feat: single-camp registrant portal page"
```

---

### Task 10: Edit registration page

**Files:**
- Create: `app/(registrant)/[orgSlug]/[campSlug]/edit/page.tsx`

- [ ] **Step 1: Create the page**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add "app/(registrant)/[orgSlug]/[campSlug]/edit/"
git commit -m "feat: edit registration page (contact + members)"
```

---

### Task 11: Account profile + saved family members

**Files:**
- Create: `app/(registrant)/account/page.tsx`
- Create: `app/(registrant)/account/family/page.tsx`

- [ ] **Step 1: Create `app/(registrant)/account/page.tsx`**

```typescript
'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { getRegistrantProfile, updateRegistrantProfile } from '@/actions/registrant-auth'
import type { RegistrantProfile } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function AccountPage() {
  const { user } = useAuth()
  const [profile, setProfile] = useState<RegistrantProfile | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (user) getRegistrantProfile(user.uid).then(setProfile)
  }, [user])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !profile) return
    setSaving(true)
    await updateRegistrantProfile(user.uid, {
      display_name: profile.display_name,
      phone: profile.phone,
      address: profile.address,
      emergency_contact: profile.emergency_contact,
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  function update<K extends keyof RegistrantProfile>(key: K, value: RegistrantProfile[K]) {
    setProfile((p) => (p ? { ...p, [key]: value } : p))
  }

  if (!profile) return <div className="py-12 text-center text-gray-400">Loading…</div>

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <h1 className="text-2xl font-bold text-[#4C1D95]">My account</h1>

      <Card className="border-[#DDD6FE]">
        <CardHeader><CardTitle className="text-base">Profile</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="display_name">Full name</Label>
            <Input id="display_name" value={profile.display_name} onChange={(e) => update('display_name', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={profile.email} disabled className="bg-gray-50" />
              <p className="text-xs text-gray-400">Contact support to change email.</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" type="tel" value={profile.phone} onChange={(e) => update('phone', e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-[#DDD6FE]">
        <CardHeader><CardTitle className="text-base">Emergency contact</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="ec_name">Name</Label>
              <Input id="ec_name" value={profile.emergency_contact.name}
                onChange={(e) => update('emergency_contact', { ...profile.emergency_contact, name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ec_phone">Phone</Label>
              <Input id="ec_phone" type="tel" value={profile.emergency_contact.phone}
                onChange={(e) => update('emergency_contact', { ...profile.emergency_contact, phone: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ec_rel">Relationship</Label>
            <Input id="ec_rel" value={profile.emergency_contact.relationship}
              onChange={(e) => update('emergency_contact', { ...profile.emergency_contact, relationship: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      <Button type="submit" className="w-full bg-[#7C3AED] hover:bg-[#6D28D9]" disabled={saving}>
        {saving ? 'Saving…' : saved ? 'Saved!' : 'Save changes'}
      </Button>
    </form>
  )
}
```

- [ ] **Step 2: Create `app/(registrant)/account/family/page.tsx`**

```typescript
'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { getRegistrantProfile, upsertSavedMember, deleteSavedMember } from '@/actions/registrant-auth'
import type { SavedFamilyMember } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'

export default function SavedFamilyPage() {
  const { user } = useAuth()
  const [members, setMembers] = useState<SavedFamilyMember[]>([])
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newLast, setNewLast] = useState('')
  const [newYear, setNewYear] = useState('')

  useEffect(() => {
    if (user) getRegistrantProfile(user.uid).then((p) => p && setMembers(p.saved_members))
  }, [user])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !newName.trim()) return
    const member = await upsertSavedMember(user.uid, {
      first_name: newName,
      last_name: newLast,
      birth_year: parseInt(newYear) || 0,
      gender: '',
    })
    setMembers((prev) => [...prev, member])
    setNewName(''); setNewLast(''); setNewYear(''); setAdding(false)
  }

  async function handleDelete(memberId: string) {
    if (!user) return
    await deleteSavedMember(user.uid, memberId)
    setMembers((prev) => prev.filter((m) => m.id !== memberId))
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#4C1D95]">Saved family members</h1>
        <Button
          variant="outline"
          className="border-[#7C3AED] text-[#7C3AED]"
          onClick={() => setAdding(true)}
        >
          + Add member
        </Button>
      </div>
      <p className="text-sm text-gray-500">
        Saved members are pre-filled when you register for another camp.
      </p>

      {members.length === 0 && !adding && (
        <p className="text-sm text-gray-400 text-center py-8">No saved family members yet.</p>
      )}

      <div className="space-y-3">
        {members.map((m) => (
          <Card key={m.id} className="border-[#DDD6FE]">
            <CardContent className="py-3 flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-700">{m.first_name} {m.last_name}</p>
                {m.birth_year > 0 && <p className="text-xs text-gray-400">b. {m.birth_year}</p>}
              </div>
              <Button variant="ghost" size="sm" className="text-gray-400 hover:text-red-600"
                onClick={() => handleDelete(m.id)}>
                Remove
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {adding && (
        <Card className="border-[#7C3AED]">
          <CardContent className="pt-4">
            <form onSubmit={handleAdd} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="new_fn">First name</Label>
                  <Input id="new_fn" value={newName} onChange={(e) => setNewName(e.target.value)} required />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="new_ln">Last name</Label>
                  <Input id="new_ln" value={newLast} onChange={(e) => setNewLast(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="new_yr">Birth year</Label>
                <Input id="new_yr" type="number" value={newYear} onChange={(e) => setNewYear(e.target.value)} min={1920} max={2030} />
              </div>
              <div className="flex gap-2">
                <Button type="submit" className="flex-1 bg-[#7C3AED] hover:bg-[#6D28D9]">Save</Button>
                <Button type="button" variant="outline" className="flex-1" onClick={() => setAdding(false)}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add "app/(registrant)/account/"
git commit -m "feat: registrant account profile and saved family members pages"
```

---

### Task 12: Cross-org registrations dashboard

**Files:**
- Create: `app/(registrant)/my-registrations/page.tsx`
- Create: `components/registrant/RegistrationCard.tsx`

- [ ] **Step 1: Create `components/registrant/RegistrationCard.tsx`**

```typescript
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { Family } from '@/lib/types'

interface RegistrationCardProps {
  family: Family
}

const statusColor: Record<string, string> = {
  confirmed: 'bg-green-100 text-green-800',
  pending:   'bg-yellow-100 text-yellow-800',
  waitlisted:'bg-blue-100 text-blue-800',
  cancelled: 'bg-red-100 text-red-800',
}

export function RegistrationCard({ family }: RegistrationCardProps) {
  return (
    <Link href={`/${family.org_slug}/${family.camp_slug}/my-registration`}>
      <Card className="border-[#DDD6FE] hover:shadow-md transition-shadow cursor-pointer">
        <CardContent className="py-4 flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-[#4C1D95]">{family.camp_name}</p>
            <p className="text-xs text-gray-500 mt-0.5">{family.org_name}</p>
          </div>
          <span className={`text-xs font-semibold px-2 py-1 rounded-full whitespace-nowrap ${statusColor[family.registration_status]}`}>
            {family.registration_status}
          </span>
        </CardContent>
      </Card>
    </Link>
  )
}
```

- [ ] **Step 2: Create `app/(registrant)/my-registrations/page.tsx`**

```typescript
'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { getAllRegistrationsByUid } from '@/actions/registrations'
import { RegistrationCard } from '@/components/registrant/RegistrationCard'
import type { Family } from '@/lib/types'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default function MyRegistrationsPage() {
  const { user, loading } = useAuth()
  const [registrations, setRegistrations] = useState<Family[]>([])
  const [fetching, setFetching] = useState(false)

  useEffect(() => {
    if (user) {
      setFetching(true)
      getAllRegistrationsByUid(user.uid)
        .then(setRegistrations)
        .finally(() => setFetching(false))
    }
  }, [user])

  if (loading || fetching) {
    return (
      <div className="py-12 text-center text-gray-400 text-sm">Loading…</div>
    )
  }

  if (!user) {
    // layout.tsx redirects unauthenticated users; this is a fallback
    return (
      <div className="py-12 text-center">
        <p className="text-gray-500 mb-4">Sign in to see your registrations.</p>
        <Link href="/login">
          <Button className="bg-[#7C3AED]">Sign in</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[#4C1D95]">My registrations</h1>
        <p className="text-sm text-gray-500 mt-1">
          All camps you&apos;ve registered for, across every organization.
        </p>
      </div>

      {registrations.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-base">No registrations yet.</p>
          <p className="text-sm mt-1">
            Register for a camp using the link your organization shared with you.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {registrations.map((reg) => (
            <RegistrationCard key={reg.id} family={reg} />
          ))}
        </div>
      )}

      <div className="pt-4 border-t border-[#DDD6FE]">
        <p className="text-xs text-gray-400">
          Setting up an organization?{' '}
          <Link href="/onboarding" className="text-[#7C3AED] hover:underline">
            Create your org
          </Link>
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Run all tests**

```bash
npm test
```
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add components/registrant/ "app/(registrant)/my-registrations/"
git commit -m "feat: cross-org registrations dashboard"
```

---

### Task 13: Push and smoke test

- [ ] **Step 1: Push to GitHub and deploy preview**

```bash
git push
vercel
```

- [ ] **Step 2: End-to-end smoke test**

Walk through the full registrant flow in the preview URL:

1. Visit `/{orgSlug}/{campSlug}/register` → fill 3-step form → submit
2. Check email inbox → confirm confirmation email arrived with "View my registration" link
3. Click the signed-URL link → land on `my-registration` page → verify family + members shown
4. Click "Edit registration" → change a field → save → confirm updated
5. Click "Create a free account" → create account → redirected to `my-registrations`
6. On `my-registrations` → confirm the registration from step 1 appears
7. Register for a second camp at a different org slug → confirm both appear in dashboard
8. Visit `account` → update emergency contact → save → reload → confirm persisted
9. Visit `account/family` → add a saved member → confirm it appears

---

## Self-Review

**Spec coverage:**

| Spec requirement | Plan coverage |
|-----------------|---------------|
| Public registration form (self-serve, no PCO) | Task 6 |
| Confirmation email with signed URL | Tasks 3, 5 |
| Registrant account creation (optional) | Task 7 |
| View registration status, room, team | Task 9 |
| Edit family + members post-registration | Task 10 |
| Account profile management | Task 11 |
| Saved family members | Task 11 |
| Cross-org registrations dashboard | Task 12 |
| Firestore collectionGroup security rule | Task 1 |
| `registrant_profiles` collection | Tasks 1, 4 |
| PCO pre-fill | **Out of scope — Phase 3** |
| Payment via Stripe | **Out of scope — Phase 3** |
| Inline validation on blur | Task 6 (ContactStep) |
| Back button on every step | Tasks 6 (FamilyMembersStep, ReviewStep) |
| Church/ministry color palette from ui-ux-pro-max | Tasks 6, 7, 8, 9, 10, 11, 12 |

**Gaps noted:**
- `create-account/page.tsx` has a TODO comment for linking the access token to the new account after creation (requires threading orgId+campId through the URL). Left as Phase 3 cleanup — the account still works, the link just doesn't auto-connect the registration.
- Server-side Firebase Auth session validation in `my-registration/page.tsx` uses the layout-level client guard for MVP. Full server-side session cookie validation (for SSR security) is Phase 3.
- `getAllRegistrationsByUid` requires a Firestore composite index on `collectionGroup(families)` with `registrant_uid` + `created_at`. Add to `firestore.indexes.json` and deploy before testing Task 12.
