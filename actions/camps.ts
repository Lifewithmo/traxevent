'use server'

import { randomBytes } from 'crypto'
import { adminDb } from '@/lib/firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import type { Camp, CampRegistrationType } from '@/lib/types'
import { buildCampSlug } from '@/lib/slug'
import { DEFAULT_EVENT_TYPE_ID } from '@/lib/event-types'
import type { Terminology } from '@/lib/event-types'

export async function createCamp(
  orgId: string,
  input: {
    name: string
    year: number
    registration_type: CampRegistrationType
    event_type_id?: string
    event_type_terminology?: Terminology
    camp_start: string
    camp_end: string
  }
): Promise<Camp> {
  const campRef = adminDb
    .collection('orgs').doc(orgId)
    .collection('camps').doc()

  const camp: Camp = {
    id: campRef.id,
    name: input.name,
    slug: buildCampSlug(input.name, input.year),
    year: input.year,
    status: 'draft',
    registration_type: input.registration_type,
    event_type_id: input.event_type_id ?? DEFAULT_EVENT_TYPE_ID,
    ...(input.event_type_terminology ? { event_type_terminology: input.event_type_terminology } : {}),
    features: {
      accommodations: true,
      teams: true,
      budget: true,
      itinerary: true,
      communicate: true,
    },
    camp_start: input.camp_start,
    camp_end: input.camp_end,
    created_at: new Date().toISOString(),
  }

  await campRef.set(camp)
  return camp
}

export async function listCamps(orgId: string): Promise<Camp[]> {
  const snap = await adminDb
    .collection('orgs').doc(orgId)
    .collection('camps')
    .orderBy('created_at', 'desc')
    .get()
  return snap.docs.map((d) => d.data() as Camp)
}

export async function getCampBySlug(orgId: string, slug: string): Promise<Camp | null> {
  const snap = await adminDb
    .collection('orgs').doc(orgId)
    .collection('camps')
    .where('slug', '==', slug)
    .limit(1)
    .get()
  return snap.empty ? null : (snap.docs[0].data() as Camp)
}

export async function updateCamp(
  orgId: string,
  campId: string,
  updates: Partial<Pick<Camp,
    | 'name'
    | 'status'
    | 'event_type_id'
    // note: registration_type and event_type_id should be updated together — they are coupled
    | 'registration_type'
    | 'camp_start'
    | 'camp_end'
    | 'registration_open'
    | 'registration_close'
    | 'capacity'
    | 'payment_amount'
    | 'from_display_name'
    | 'reply_to_email'
  >> & { event_type_terminology?: Terminology | null }
): Promise<void> {
  const ref = adminDb
    .collection('orgs').doc(orgId)
    .collection('camps').doc(campId)

  const snap = await ref.get()
  if (!snap.exists) throw new Error('Camp not found')

  // Firestore rejects `undefined` (ignoreUndefinedProperties is off). Convention:
  //   undefined  → leave the field unchanged (callers pass it for blank optionals)
  //   null       → explicitly clear the field (FieldValue.delete())
  const cleaned: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(updates)) {
    if (v === undefined) continue
    cleaned[k] = v === null ? FieldValue.delete() : v
  }

  await ref.update({
    ...cleaned,
    updated_at: new Date().toISOString(),
  })
}

export interface DuplicateEventInput {
  name: string
  year: number
  camp_start: string
  camp_end: string
}

export async function duplicateEvent(
  orgId: string,
  sourceCampId: string,
  input: DuplicateEventInput
): Promise<Camp> {
  const campsCol = adminDb.collection('orgs').doc(orgId).collection('camps')
  const sourceRef = campsCol.doc(sourceCampId)
  const sourceSnap = await sourceRef.get()
  if (!sourceSnap.exists) throw new Error('Source event not found')
  const source = sourceSnap.data() as Camp

  const baseSlug = buildCampSlug(input.name, input.year)
  let slug = baseSlug
  let suffix = 2
  while (!(await campsCol.where('slug', '==', slug).limit(1).get()).empty) {
    slug = `${baseSlug}-${suffix}`
    suffix++
  }

  const newRef = campsCol.doc()
  const newCamp: Camp = {
    id: newRef.id,
    name: input.name,
    slug,
    year: input.year,
    status: 'draft',
    registration_type: source.registration_type,
    event_type_id: source.event_type_id,
    ...(source.event_type_terminology ? { event_type_terminology: source.event_type_terminology } : {}),
    features: source.features,
    camp_start: input.camp_start,
    camp_end: input.camp_end,
    ...(source.capacity != null ? { capacity: source.capacity } : {}),
    ...(source.payment_amount != null ? { payment_amount: source.payment_amount } : {}),
    ...(source.from_display_name ? { from_display_name: source.from_display_name } : {}),
    ...(source.reply_to_email ? { reply_to_email: source.reply_to_email } : {}),
    created_at: new Date().toISOString(),
  }
  await newRef.set(newCamp)

  try {
    const [slotsSnap, formsSnap] = await Promise.all([
      sourceRef.collection('assignment_slots').get(),
      sourceRef.collection('form_assignments').get(),
    ])

    await Promise.all([
      ...slotsSnap.docs.map((d) => {
        const id = randomBytes(8).toString('hex')
        return newRef.collection('assignment_slots').doc(id).set({ ...d.data(), id, created_at: new Date().toISOString() })
      }),
      ...formsSnap.docs.map((d) => {
        const id = randomBytes(8).toString('hex')
        return newRef.collection('form_assignments').doc(id).set({ ...d.data(), id, created_at: new Date().toISOString() })
      }),
    ])
  } catch (err) {
    // Roll back the orphaned draft so the user can cleanly retry.
    await newRef.delete()
    throw err
  }

  return newCamp
}
