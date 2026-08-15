'use server'

import { headers } from 'next/headers'
import { createHash } from 'crypto'
import { adminDb } from '@/lib/firebase-admin'
import { getOrgByHandle } from '@/lib/public-profile-server'
import { getDropCore } from '@/lib/storefront/drops'
import { getOrderByTokenCore, listOrdersForDropCore } from '@/lib/storefront/orders'
import { availableStock, dropPhase, soldByProduct } from '@/lib/storefront/drop-logic'
import { checkRateLimit } from '@/lib/rate-limit'
import { customersRef, findOrCreateCustomerCore } from '@/lib/crm/customers'
import { generateAccessToken } from '@/lib/tokens'
import type { Customer, DropPhase, DropPickup, OrderLine, OrderStatus } from '@/lib/types'

// NOTE: 'use server' module — every export must be an async function; types
// used by callers live here as interfaces only (never re-exported types).

const MSG_RATE_LIMITED = 'Too many requests — please try again later.'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface PublicDropItem {
  product_id: string
  name: string
  price: number
  description?: string
  photo_url?: string
  sold_out: boolean
}

export interface PublicDrop {
  id: string
  title: string
  note?: string
  phase: DropPhase
  opens_at: string
  closes_at: string
  timezone: string
  pickup: DropPickup
  items: PublicDropItem[]
  tips_enabled: boolean
  tax_rate?: number
  org: { display_name: string; handle: string; accent_color?: string }
}

// PUBLIC (handle + dropId = the shareable marketing URL). Only scheduled /
// closed drops are visible; stock COUNTS never leave the server — only a
// sold_out boolean per item (spec §4).
export async function getPublicDrop(handle: string, dropId: string): Promise<PublicDrop | null> {
  const org = await getOrgByHandle(handle)
  if (!org?.public_profile?.handle) return null
  const drop = await getDropCore(org.id, dropId)
  if (!drop || drop.status === 'draft' || drop.status === 'archived') return null

  const nowIso = new Date().toISOString()
  const orders = await listOrdersForDropCore(org.id, drop.id)
  const sold = soldByProduct(orders, nowIso)
  const items: PublicDropItem[] = drop.items.map((i) => {
    const avail = availableStock(i, sold)
    return {
      product_id: i.product_id,
      name: i.name,
      price: i.price,
      ...(i.description ? { description: i.description } : {}),
      ...(i.photo_url ? { photo_url: i.photo_url } : {}),
      sold_out: avail !== null && avail <= 0,
    }
  })
  const out: PublicDrop = {
    id: drop.id,
    title: drop.title,
    ...(drop.note ? { note: drop.note } : {}),
    phase: dropPhase(drop, nowIso),
    opens_at: drop.opens_at,
    closes_at: drop.closes_at,
    timezone: drop.timezone,
    pickup: {
      location_name: drop.pickup.location_name,
      ...(drop.pickup.address ? { address: drop.pickup.address } : {}),
      windows: drop.pickup.windows.map((w) => ({
        id: w.id, day: w.day, start: w.start, end: w.end,
        ...(w.slot_minutes !== undefined ? { slot_minutes: w.slot_minutes } : {}),
      })),
    },
    items,
    tips_enabled: org.tips_enabled ?? false,
    ...(drop.tax_rate !== undefined ? { tax_rate: drop.tax_rate } : {}),
    org: {
      display_name: org.branding?.display_name || org.name,
      handle: org.public_profile.handle,
      ...(org.branding?.accent_color ? { accent_color: org.branding.accent_color } : {}),
    },
  }
  return out
}

export interface PublicOrder {
  number?: number
  status: OrderStatus
  drop_title: string
  pickup: { location_name: string; day: string; start: string; end: string; slot?: string }
  lines: OrderLine[]
  subtotal: number
  tax: number
  tip?: number
  total: number
  buyer_name: string
}

// PUBLIC (token = authorization). Omits buyer email/phone, token, org_id,
// customer_id, payment/refund internals.
export async function getPublicOrder(token: string): Promise<PublicOrder | null> {
  const order = await getOrderByTokenCore(token)
  if (!order) return null
  const drop = await getDropCore(order.org_id, order.drop_id)
  const window = drop?.pickup.windows.find((w) => w.id === order.pickup_window_id)
  return {
    ...(order.number !== undefined ? { number: order.number } : {}),
    status: order.status,
    drop_title: drop?.title ?? 'Drop',
    pickup: {
      location_name: drop?.pickup.location_name ?? '',
      day: window?.day ?? '',
      start: window?.start ?? '',
      end: window?.end ?? '',
      ...(order.pickup_slot ? { slot: order.pickup_slot } : {}),
    },
    lines: order.lines.map((l) => ({ product_id: l.product_id, name: l.name, price: l.price, qty: l.qty })),
    subtotal: order.subtotal,
    tax: order.tax,
    ...(order.tip !== undefined ? { tip: order.tip } : {}),
    total: order.total,
    buyer_name: order.buyer.name,
  }
}

// PUBLIC subscribe (spec §3.4): honeypot + time gate return an
// indistinguishable fake success with zero writes; rate-limited per-IP and
// per-org; subscriber lands in the CRM via the same dedup core as intake.
export async function subscribeToDrops(
  handle: string,
  input: { name?: string; email: string; website?: string },
  elapsedMs: number,
): Promise<{ ok: true }> {
  const org = await getOrgByHandle(handle)
  if (!org) throw new Error('This page is no longer available.')

  if (input.website?.trim() || !(elapsedMs >= 3000)) return { ok: true }

  const h = await headers()
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0].trim()
  const ipHash = createHash('sha256').update(ip || 'unknown').digest('hex')
  const [byIp, byOrg] = await Promise.all([
    checkRateLimit(`subscribe:ip:${ipHash}`, { limit: 10, windowMs: 60 * 60 * 1000 }),
    checkRateLimit(`subscribe:org:${org.id}`, { limit: 100, windowMs: 60 * 60 * 1000 }),
  ])
  if (!byIp.allowed || !byOrg.allowed) throw new Error(MSG_RATE_LIMITED)

  const email = (input.email ?? '').trim()
  if (!email || email.length > 200 || !EMAIL_RE.test(email)) throw new Error('Please enter a valid email address.')
  const name = (input.name ?? '').trim().slice(0, 200) || email.split('@')[0]

  const { customer } = await findOrCreateCustomerCore(org.id, { name, email })
  const existing = (customer as Customer).marketing
  await customersRef(org.id).doc(customer.id).update({
    marketing: {
      subscribed: true,
      subscribed_at: new Date().toISOString(),
      source: 'profile',
      unsubscribe_token: existing?.unsubscribe_token ?? generateAccessToken(),
    },
    updated_at: new Date().toISOString(),
  })
  return { ok: true }
}

// PUBLIC one-click unsubscribe. Uniform ok:false for unknown tokens.
export async function unsubscribeByToken(token: string): Promise<{ ok: boolean }> {
  if (!token || token.length > 100) return { ok: false }
  const snap = await adminDb
    .collectionGroup('customers')
    .where('marketing.unsubscribe_token', '==', token)
    .limit(1)
    .get()
  if (snap.empty) return { ok: false }
  await snap.docs[0].ref.update({ 'marketing.subscribed': false, updated_at: new Date().toISOString() })
  return { ok: true }
}
