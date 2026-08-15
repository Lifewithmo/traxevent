'use server'

import { assertOrgMember, assertOrgAdmin } from '@/lib/auth/assert'
import {
  listDropsCore, getDropCore, createDropCore, updateDraftDropCore,
  closeDropCore, archiveDropCore, adjustStockCore,
  dropsRef, publishDropCore,
  type CreateDropInput,
} from '@/lib/storefront/drops'
import { adminDb } from '@/lib/firebase-admin'
import { customersRef } from '@/lib/crm/customers'
import { buildDropAnnouncementEmail, assertDelivered } from '@/lib/email'
import { getResend } from '@/lib/resend'
import { getVerifiedSendingDomain } from '@/actions/domains'
import type { Customer, Drop, Org } from '@/lib/types'

const APP_ORIGIN = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://traxevent.com'

export async function listDrops(orgId: string): Promise<Drop[]> {
  await assertOrgMember(orgId)
  return listDropsCore(orgId)
}

export async function getDrop(orgId: string, dropId: string): Promise<Drop | null> {
  await assertOrgMember(orgId)
  return getDropCore(orgId, dropId)
}

export async function createDrop(orgId: string, input: CreateDropInput): Promise<Drop> {
  await assertOrgAdmin(orgId)
  return createDropCore(orgId, input)
}

export async function updateDraftDrop(orgId: string, dropId: string, input: CreateDropInput): Promise<Drop> {
  await assertOrgAdmin(orgId)
  return updateDraftDropCore(orgId, dropId, input)
}

export async function closeDrop(orgId: string, dropId: string): Promise<void> {
  await assertOrgAdmin(orgId)
  return closeDropCore(orgId, dropId)
}

export async function archiveDrop(orgId: string, dropId: string): Promise<void> {
  await assertOrgAdmin(orgId)
  return archiveDropCore(orgId, dropId)
}

export async function adjustDropStock(orgId: string, dropId: string, productId: string, stock: number | null): Promise<void> {
  await assertOrgAdmin(orgId)
  return adjustStockCore(orgId, dropId, productId, stock)
}

/**
 * Publish = the moment the announcement goes out (spec §6: no scheduled-send
 * infrastructure in v1 — the operator controls timing by choosing when to
 * publish). Gates live here, not in the core: the public URL needs the org's
 * handle, and checkout needs Stripe.
 */
export async function publishDrop(orgId: string, dropId: string): Promise<Drop> {
  await assertOrgAdmin(orgId)
  const orgSnap = await adminDb.collection('orgs').doc(orgId).get()
  const org = orgSnap.exists ? (orgSnap.data() as Org) : null
  if (!org?.stripe_account_id) throw new Error('Connect Stripe before publishing a drop (Settings → Billing)')
  const handle = org.public_profile?.enabled === true ? org.public_profile.handle : undefined
  if (!handle) throw new Error('Enable your public profile before publishing a drop (Settings → Public profile)')

  const drop = await publishDropCore(orgId, dropId)

  if (drop.channels.includes('email') && !drop.announced_at) {
    try {
      const snap = await customersRef(orgId).where('marketing.subscribed', '==', true).get()
      const subscribers = snap.docs
        .map((d) => d.data() as Customer)
        .filter((c) => c.email && c.marketing?.unsubscribe_token)
      if (subscribers.length > 0) {
        let fromDomain: string | undefined
        try {
          fromDomain = await getVerifiedSendingDomain(orgId)
        } catch {
          // fall back to the platform default sender
        }
        const displayName = org.branding?.display_name || org.name
        const opensLabel = new Intl.DateTimeFormat('en-US', {
          weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
          timeZone: drop.timezone,
        }).format(new Date(drop.opens_at))
        const payloads = subscribers.map((c) =>
          buildDropAnnouncementEmail({
            to: c.email!,
            orgDisplayName: displayName,
            dropTitle: drop.title,
            opensLabel,
            dropUrl: `${APP_ORIGIN}/p/${handle}/drops/${drop.id}`,
            unsubscribeUrl: `${APP_ORIGIN}/unsubscribe/${c.marketing!.unsubscribe_token}`,
            ...(fromDomain ? { fromDomain } : {}),
          }),
        )
        const resend = getResend()
        for (let i = 0; i < payloads.length; i += 100) {
          // resend.batch.send RESOLVES `{ data: null, error }` on failure — it
          // does not reject. assertDelivered (lib/email.ts) throws so a dead
          // batch is caught below and announced_at is never stamped.
          assertDelivered(await resend.batch.send(payloads.slice(i, i + 100)))
        }
      }
      await dropsRef(orgId).doc(dropId).update({ announced_at: new Date().toISOString() })
    } catch (err) {
      console.error('drop announcement failed', err)
      // best-effort: the publish itself stands
    }
  }
  return drop
}
