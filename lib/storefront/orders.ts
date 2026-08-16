import { adminDb } from '@/lib/firebase-admin'
import { randomBytes } from 'crypto'
import { generateAccessToken } from '@/lib/tokens'
import { dropsRef } from '@/lib/storefront/drops'
import {
  cartFits, computeOrderTotals, dropPhase, soldByProduct,
  PENDING_HOLD_MS, type CartLine,
} from '@/lib/storefront/drop-logic'
import type { Drop, Order, OrderPayment, OrderRefund } from '@/lib/types'

export interface CheckoutInput {
  cart: CartLine[]
  buyer: { name: string; email: string; phone?: string }
  pickup_window_id: string
  pickup_slot?: string
  tip?: number
}

export function ordersRef(orgId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('orders')
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SLOT_RE = /^\d{2}:\d{2}$/

/**
 * Guard-free checkout write. Validates everything server-side, then a single
 * transaction re-reads all orders for the drop, derives availability (spec
 * §5.3 — unexpired pending holds count as sold), and creates the pending
 * order. Two concurrent checkouts for the last unit cannot both pass: the
 * transaction's read set covers the query.
 */
export async function createPendingOrderCore(orgId: string, drop: Drop, input: CheckoutInput): Promise<Order> {
  const nowMs = Date.now()
  const nowIso = new Date(nowMs).toISOString()
  if (dropPhase(drop, nowIso) !== 'open') throw new Error('Sales are not open for this drop')

  const window = drop.pickup.windows.find((w) => w.id === input.pickup_window_id)
  if (!window) throw new Error('Please choose a pickup window')
  if (window.slot_minutes) {
    const slot = input.pickup_slot
    if (!slot || !SLOT_RE.test(slot) || slot < window.start || slot >= window.end) {
      throw new Error('Please choose a pickup time')
    }
  }

  const name = input.buyer.name?.trim()
  const email = input.buyer.email?.trim()
  const phone = input.buyer.phone?.trim()
  if (!name || name.length > 200) throw new Error('Please enter your name')
  if (!email || email.length > 200 || !EMAIL_RE.test(email)) throw new Error('Please enter a valid email')
  if (phone && phone.length > 50) throw new Error('Please enter a valid phone number')

  const totals = computeOrderTotals(drop.items, input.cart, { tax_rate: drop.tax_rate, tip: input.tip })
  const order: Order = {
    id: randomBytes(8).toString('hex'),
    org_id: orgId,
    channel: 'drop',
    drop_id: drop.id,
    status: 'pending',
    expires_at: new Date(nowMs + PENDING_HOLD_MS).toISOString(),
    buyer: { name, email, ...(phone ? { phone } : {}) },
    lines: totals.lines,
    pickup_window_id: window.id,
    ...(window.slot_minutes && input.pickup_slot ? { pickup_slot: input.pickup_slot } : {}),
    subtotal: totals.subtotal,
    ...(totals.tax_rate !== undefined ? { tax_rate: totals.tax_rate } : {}),
    tax: totals.tax,
    ...(totals.tip > 0 ? { tip: totals.tip } : {}),
    total: totals.total,
    token: generateAccessToken(),
    created_at: nowIso,
  }

  // Single-field auto-index on drop_id; status/expiry filtered in code so no
  // composite index is needed (per-drop order volume is small).
  const query = ordersRef(orgId).where('drop_id', '==', drop.id)
  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(query)
    const existing = snap.docs.map((d) => d.data() as Order)
    const fit = cartFits(drop.items, input.cart, soldByProduct(existing, nowIso))
    if (!fit.ok) throw new Error(`Sold out: ${fit.name}`)
    tx.set(ordersRef(orgId).doc(order.id), order)
    return order
  })
}

/**
 * Webhook-driven confirm. Idempotent: only a pending order transitions; the
 * per-drop pickup number and the order write share one transaction. A late
 * success after a refund is a no-op (the refund won).
 */
export async function confirmOrderCore(
  orgId: string,
  orderId: string,
  payment: OrderPayment,
): Promise<{ order: Order; confirmedNow: boolean }> {
  const orderRef = ordersRef(orgId).doc(orderId)
  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(orderRef)
    if (!snap.exists) throw new Error('Order not found')
    const order = snap.data() as Order
    if (order.status !== 'pending') return { order, confirmedNow: false }

    const dropRef = dropsRef(orgId).doc(order.drop_id)
    const dropSnap = await tx.get(dropRef)
    const seq = ((dropSnap.exists ? (dropSnap.data() as Drop).order_seq : 0) ?? 0) + 1
    const now = new Date().toISOString()
    tx.set(dropRef, { order_seq: seq, updated_at: now }, { merge: true })
    tx.set(orderRef, { status: 'confirmed', number: seq, payment, updated_at: now }, { merge: true })
    return { order: { ...order, status: 'confirmed', number: seq, payment, updated_at: now }, confirmedNow: true }
  })
}

export async function listOrdersForDropCore(orgId: string, dropId: string): Promise<Order[]> {
  const snap = await ordersRef(orgId).where('drop_id', '==', dropId).get()
  return snap.docs
    .map((d) => d.data() as Order)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
}

/** Public status page resolver (token = authorization). */
export async function getOrderByTokenCore(token: string): Promise<Order | null> {
  if (!token || token.length > 100) return null
  const snap = await adminDb.collectionGroup('orders').where('token', '==', token).limit(1).get()
  return snap.empty ? null : (snap.docs[0].data() as Order)
}

export async function markPickedUpCore(orgId: string, orderId: string): Promise<void> {
  const snap = await ordersRef(orgId).doc(orderId).get()
  if (!snap.exists) throw new Error('Order not found')
  if ((snap.data() as Order).status !== 'confirmed') throw new Error('Only confirmed orders can be picked up')
  await ordersRef(orgId).doc(orderId).update({ status: 'picked_up', updated_at: new Date().toISOString() })
}

/** Idempotent — safe under webhook retries and dashboard-refund reconciliation. */
export async function markRefundedCore(orgId: string, orderId: string, refund: OrderRefund): Promise<void> {
  const snap = await ordersRef(orgId).doc(orderId).get()
  if (!snap.exists) throw new Error('Order not found')
  const order = snap.data() as Order
  if (order.status === 'refunded') return
  await ordersRef(orgId).doc(orderId).update({ status: 'refunded', refund, updated_at: new Date().toISOString() })
}

/** Best-effort cleanup when PaymentIntent creation fails after the hold was written. */
export async function deletePendingOrderCore(orgId: string, orderId: string): Promise<void> {
  await ordersRef(orgId).doc(orderId).delete().catch(() => {})
}
