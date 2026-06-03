'use server'

import { adminDb } from '@/lib/firebase-admin'
import type { Camp, CampRegistrationType } from '@/lib/types'
import { buildCampSlug } from '@/lib/slug'
import { DEFAULT_EVENT_TYPE_ID } from '@/lib/event-types'

export async function createCamp(
  orgId: string,
  input: {
    name: string
    year: number
    registration_type: CampRegistrationType
    event_type_id?: string
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
  >>
): Promise<void> {
  const ref = adminDb
    .collection('orgs').doc(orgId)
    .collection('camps').doc(campId)

  const snap = await ref.get()
  if (!snap.exists) throw new Error('Camp not found')

  await ref.update({
    ...updates,
    updated_at: new Date().toISOString(),
  })
}
