'use server'

import { adminDb } from '@/lib/firebase-admin'
import type { Camp, CampRegistrationType } from '@/lib/types'

export function buildCampSlug(name: string, year: number): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
  return `${base}-${year}`
}

export async function createCamp(
  orgId: string,
  input: {
    name: string
    year: number
    registration_type: CampRegistrationType
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
