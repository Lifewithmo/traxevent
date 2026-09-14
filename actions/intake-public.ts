'use server'

import { headers } from 'next/headers'
import { createHash } from 'crypto'
import { adminDb } from '@/lib/firebase-admin'
import { checkRateLimit } from '@/lib/rate-limit'
import { findOrCreateCustomerCore } from '@/lib/crm/customers'
import { createLeadCore } from '@/lib/crm/leads'
import { validateLeadFields, firstLeadFieldError } from '@/lib/crm/validate'
import { logActivity } from '@/lib/activity'
import { sendIntakeNotification } from '@/lib/email'
import type { Org } from '@/lib/types'

// NOTE: this is a 'use server' module — every export must be an async function.

const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_ORIGIN ?? 'https://traxevent.com'

const MSG_UNAVAILABLE = 'This form is no longer available.'
const MSG_RATE_LIMITED = 'Too many requests — please try again later.'

export interface IntakeSubmission {
  name: string
  email: string
  phone?: string
  event_type?: string
  event_date?: string
  guest_count?: number
  message?: string
  website?: string // honeypot — humans never see or fill this field
}

async function findOrgByIntakeToken(
  token: string
): Promise<{ orgId: string; org: Org } | null> {
  if (!token || token.length > 100) return null
  const snap = await adminDb
    .collection('orgs')
    .where('intake_token', '==', token)
    .limit(1)
    .get()
  if (snap.empty) return null
  return { orgId: snap.docs[0].id, org: snap.docs[0].data() as Org }
}

// PUBLIC (intake_token = authorization). Returns only what the form page renders.
export async function getIntakeFormInfo(token: string): Promise<{ org_name: string } | null> {
  const found = await findOrgByIntakeToken(token)
  if (!found) return null
  return { org_name: found.org.branding?.display_name?.trim() || found.org.name }
}

// PUBLIC (intake_token = authorization). Layered abuse protection, then
// customer dedup + lead create via the guard-free cores.
export async function submitIntake(
  token: string,
  input: IntakeSubmission,
  elapsedMs: number
): Promise<{ ok: true }> {
  const found = await findOrgByIntakeToken(token)
  if (!found) throw new Error(MSG_UNAVAILABLE)
  const { orgId, org } = found

  // Bot layers: indistinguishable fake success, zero writes. `!(x >= 3000)`
  // also catches NaN/undefined from a tampered client.
  if (input.website?.trim() || !(elapsedMs >= 3000)) return { ok: true }

  const h = await headers()
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0].trim()
  const ipHash = createHash('sha256').update(ip || 'unknown').digest('hex')
  const [byIp, byOrg] = await Promise.all([
    checkRateLimit(`intake:ip:${ipHash}`, { limit: 5, windowMs: 60 * 60 * 1000 }),
    checkRateLimit(`intake:org:${orgId}`, { limit: 30, windowMs: 60 * 60 * 1000 }),
  ])
  if (!byIp.allowed || !byOrg.allowed) throw new Error(MSG_RATE_LIMITED)

  const name = (input.name ?? '').trim()
  const email = (input.email ?? '').trim()
  const phone = (input.phone ?? '').trim()
  const eventType = (input.event_type ?? '').trim()
  const eventDate = (input.event_date ?? '').trim()
  const message = (input.message ?? '').trim()
  const guestCount = input.guest_count

  // Shared rule set (lib/crm/validate) — the same checks and byte-for-byte
  // the same messages this action always threw, now also enforced on the
  // operator path (actions/leads.ts) so no door accepts less than this one.
  const fieldError = firstLeadFieldError(
    validateLeadFields(
      { name, email, phone, event_type: eventType, event_date: eventDate, guest_count: guestCount, notes: message },
      { requireName: true, requireEmail: true }
    )
  )
  if (fieldError) throw new Error(fieldError)

  // Event types inc 1 (spec §5c): the reference is resolved SERVER-SIDE from
  // the submitted string against the org's ACTIVE profiles — the public client
  // is never trusted with an id. Trim+lowercase, last match wins (mirroring
  // lib/capacity/requirement.ts); archived and id-less entries never match, and
  // "Something else" free text simply resolves to nothing.
  const typeKey = eventType.toLowerCase()
  let matchedProfileId: string | undefined
  if (typeKey) {
    for (const p of org.event_type_profiles ?? []) {
      if (!p.archived && p.id && p.name.trim().toLowerCase() === typeKey) matchedProfileId = p.id
    }
  }

  const { customer } = await findOrCreateCustomerCore(orgId, {
    name,
    email,
    ...(phone ? { phone } : {}),
  })
  const lead = await createLeadCore(orgId, {
    name,
    stage: 'inquiry',
    customer_id: customer.id,
    source: 'intake',
    email,
    ...(phone ? { phone } : {}),
    ...(eventType ? { event_type: eventType } : {}),
    ...(matchedProfileId ? { event_type_id: matchedProfileId } : {}),
    ...(eventDate ? { event_date: eventDate } : {}),
    ...(guestCount != null ? { guest_count: guestCount } : {}),
    ...(message ? { notes: message } : {}),
  })

  // Best-effort from here down — the business write has committed.
  await logActivity(orgId, {
    parent_type: 'opportunity',
    parent_id: lead.id,
    kind: 'form',
    summary: 'New inquiry from intake form',
  })

  try {
    const ownerSnap = await adminDb
      .collection('orgs')
      .doc(orgId)
      .collection('members')
      .where('role', '==', 'owner')
      .limit(1)
      .get()
    const ownerEmail = ownerSnap.empty
      ? undefined
      : (ownerSnap.docs[0].data() as { email?: string }).email
    if (ownerEmail) {
      await sendIntakeNotification({
        to: ownerEmail,
        orgName: org.name,
        leadName: name,
        email,
        ...(phone ? { phone } : {}),
        ...(eventType ? { eventType } : {}),
        ...(eventDate ? { eventDate } : {}),
        ...(guestCount != null ? { guestCount } : {}),
        ...(message ? { message } : {}),
        opportunityUrl: `${APP_ORIGIN}/${org.slug}/leads/${lead.id}`,
      })
    }
  } catch (err) {
    console.error('sendIntakeNotification failed', err)
  }

  return { ok: true }
}
