import { adminDb } from '@/lib/firebase-admin'
import { randomBytes } from 'crypto'
import { listProductsCore } from '@/lib/storefront/products'
import type { Drop, DropChannel, DropItem, DropPickupWindow } from '@/lib/types'

export interface DropWindowInput { day: string; start: string; end: string; slot_minutes?: number }
export interface DropItemInput { product_id: string; stock?: number }
export interface CreateDropInput {
  title: string
  note?: string
  opens_at: string
  closes_at: string
  timezone: string
  pickup: { location_name: string; address?: string; windows: DropWindowInput[] }
  items: DropItemInput[]
  tax_rate?: number
  channels: DropChannel[]
}

export function dropsRef(orgId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('drops')
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}$/
const CHANNELS: DropChannel[] = ['email', 'sms', 'instagram', 'facebook', 'tiktok']

// Validates input and resolves product snapshots. Shared by create + draft update.
async function buildDropFields(orgId: string, input: CreateDropInput) {
  if (!input.title?.trim()) throw new Error('Title is required')
  if (!input.timezone?.trim()) throw new Error('Timezone is required')
  const opens = new Date(input.opens_at)
  const closes = new Date(input.closes_at)
  if (Number.isNaN(opens.getTime()) || Number.isNaN(closes.getTime())) throw new Error('Please pick valid open and close times')
  if (closes.getTime() <= opens.getTime()) throw new Error('A drop must close after it opens')
  if (!input.pickup?.location_name?.trim()) throw new Error('Pickup location is required')
  if (!input.pickup.windows?.length) throw new Error('Add at least one pickup window')
  for (const w of input.pickup.windows) {
    const valid = DAY_RE.test(w.day) && TIME_RE.test(w.start) && TIME_RE.test(w.end) && w.start < w.end &&
      (w.slot_minutes === undefined || (Number.isInteger(w.slot_minutes) && w.slot_minutes > 0))
    if (!valid) throw new Error('Please enter valid pickup windows')
  }
  if (!input.items?.length) throw new Error('Add at least one item')
  if (input.tax_rate !== undefined && !(input.tax_rate >= 0 && input.tax_rate <= 30)) throw new Error('Invalid tax rate')
  const channels = (input.channels ?? []).filter((c) => CHANNELS.includes(c))

  const products = await listProductsCore(orgId)
  const byId = new Map(products.map((p) => [p.id, p]))
  const items: DropItem[] = input.items.map((i) => {
    const p = byId.get(i.product_id)
    if (!p || !p.active) throw new Error('A selected product is not available')
    if (i.stock !== undefined && (!Number.isInteger(i.stock) || i.stock < 0)) throw new Error('Invalid stock')
    return {
      product_id: p.id,
      name: p.name,
      price: p.price,
      ...(p.description ? { description: p.description } : {}),
      ...(p.photo_url ? { photo_url: p.photo_url } : {}),
      ...(i.stock !== undefined ? { stock: i.stock } : {}),
    }
  })
  const windows: DropPickupWindow[] = input.pickup.windows.map((w) => ({
    id: randomBytes(8).toString('hex'),
    day: w.day,
    start: w.start,
    end: w.end,
    ...(w.slot_minutes !== undefined ? { slot_minutes: w.slot_minutes } : {}),
  }))
  return {
    title: input.title.trim(),
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    opens_at: opens.toISOString(),
    closes_at: closes.toISOString(),
    timezone: input.timezone.trim(),
    pickup: {
      location_name: input.pickup.location_name.trim(),
      ...(input.pickup.address?.trim() ? { address: input.pickup.address.trim() } : {}),
      windows,
    },
    items,
    ...(input.tax_rate !== undefined && input.tax_rate > 0 ? { tax_rate: input.tax_rate } : {}),
    channels,
  }
}

export async function createDropCore(orgId: string, input: CreateDropInput): Promise<Drop> {
  const fields = await buildDropFields(orgId, input)
  const id = randomBytes(8).toString('hex')
  const drop: Drop = { id, status: 'draft', ...fields, created_at: new Date().toISOString() }
  await dropsRef(orgId).doc(id).set(drop)
  return drop
}

/** Full re-edit, drafts only — published drops have live order references. */
export async function updateDraftDropCore(orgId: string, dropId: string, input: CreateDropInput): Promise<Drop> {
  const existing = await getDropCore(orgId, dropId)
  if (!existing) throw new Error('Drop not found')
  if (existing.status !== 'draft') throw new Error('Only draft drops can be edited')
  const fields = await buildDropFields(orgId, input)
  const { note: _note, tax_rate: _taxRate, ...base } = existing
  const drop: Drop = { ...base, ...fields, updated_at: new Date().toISOString() }
  await dropsRef(orgId).doc(dropId).set(drop)
  return drop
}

export async function getDropCore(orgId: string, dropId: string): Promise<Drop | null> {
  const snap = await dropsRef(orgId).doc(dropId).get()
  return snap.exists ? (snap.data() as Drop) : null
}

export async function listDropsCore(orgId: string): Promise<Drop[]> {
  const snap = await dropsRef(orgId).orderBy('opens_at', 'desc').get()
  return snap.docs.map((d) => d.data() as Drop)
}

/** Guard-free publish: draft → scheduled. The Stripe/handle gates live in the action (Task 10). */
export async function publishDropCore(orgId: string, dropId: string): Promise<Drop> {
  const drop = await getDropCore(orgId, dropId)
  if (!drop) throw new Error('Drop not found')
  if (drop.status !== 'draft') throw new Error('Only draft drops can be published')
  if (!drop.items.length) throw new Error('Add at least one item before publishing')
  if (drop.closes_at <= new Date().toISOString()) throw new Error('This drop already closed — update its times first')
  const now = new Date().toISOString()
  await dropsRef(orgId).doc(dropId).update({ status: 'scheduled', updated_at: now })
  return { ...drop, status: 'scheduled', updated_at: now }
}

export async function closeDropCore(orgId: string, dropId: string): Promise<void> {
  const drop = await getDropCore(orgId, dropId)
  if (!drop) throw new Error('Drop not found')
  if (drop.status !== 'scheduled') throw new Error('Only a published drop can be closed')
  await dropsRef(orgId).doc(dropId).update({ status: 'closed', updated_at: new Date().toISOString() })
}

export async function archiveDropCore(orgId: string, dropId: string): Promise<void> {
  const drop = await getDropCore(orgId, dropId)
  if (!drop) throw new Error('Drop not found')
  await dropsRef(orgId).doc(dropId).update({ status: 'archived', updated_at: new Date().toISOString() })
}

/** Post-publish stock adjustment: rewrite one item's stock (null = unlimited). */
export async function adjustStockCore(orgId: string, dropId: string, productId: string, stock: number | null): Promise<void> {
  if (stock !== null && (!Number.isInteger(stock) || stock < 0)) throw new Error('Invalid stock')
  const drop = await getDropCore(orgId, dropId)
  if (!drop) throw new Error('Drop not found')
  const items = drop.items.map((i) => {
    if (i.product_id !== productId) return i
    const { stock: _old, ...rest } = i
    return stock === null ? rest : { ...rest, stock }
  })
  await dropsRef(orgId).doc(dropId).update({ items, updated_at: new Date().toISOString() })
}
