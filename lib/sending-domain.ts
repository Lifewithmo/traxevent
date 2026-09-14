import { adminDb } from '@/lib/firebase-admin'
import type { Org } from '@/lib/types'

// Server-only sending-domain read. Split out of actions/domains.ts (inc-3 B5
// security ride-along): the old exported `getVerifiedSendingDomain` was a
// guard-free 'use server' export — an unauthenticated POST endpoint that read
// any org's sending domain (the listItinerary class; see lib/itinerary-data.ts
// for the precedent and its removal note).

/**
 * Guard-free domain read (bare org-doc `.get()`). Every caller is server code
 * that has ALREADY gated: org-member/admin asserts in actions, the Stripe
 * signature check in the payments webhook, unguessable public tokens on the
 * public proposal/registration flows, or the cron route's CRON_SECRET. Never
 * re-export this from a 'use server' module.
 */
export async function getVerifiedSendingDomainCore(orgId: string): Promise<string | undefined> {
  const snap = await adminDb.collection('orgs').doc(orgId).get()
  const org = snap.exists ? (snap.data() as Org) : undefined
  if (org?.sending_domain_status === 'verified' && org.sending_domain) {
    return org.sending_domain
  }
  return undefined
}
