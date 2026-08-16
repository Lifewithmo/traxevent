'use server'

import { assertOrgMember, assertOrgAdmin } from '@/lib/auth/assert'
import { adminDb } from '@/lib/firebase-admin'
import { stripe } from '@/lib/stripe'
import {
  listOrdersForDropCore, markPickedUpCore, markRefundedCore, ordersRef,
} from '@/lib/storefront/orders'
import type { Order, Org } from '@/lib/types'

export async function listOrdersForDrop(orgId: string, dropId: string): Promise<Order[]> {
  await assertOrgMember(orgId)
  return listOrdersForDropCore(orgId, dropId)
}

export async function markOrderPickedUp(orgId: string, orderId: string): Promise<void> {
  await assertOrgMember(orgId)
  return markPickedUpCore(orgId, orderId)
}

/**
 * Full cancel + refund. Writes the refund record immediately from the
 * synchronous Stripe response; the charge.refunded webhook is idempotent
 * backup (and catches dashboard-initiated refunds). Restock is implicit —
 * refunded orders drop out of the availability sum (spec §5.4).
 */
export async function cancelOrder(orgId: string, orderId: string, opts?: { note?: string }): Promise<void> {
  await assertOrgAdmin(orgId)
  const snap = await ordersRef(orgId).doc(orderId).get()
  if (!snap.exists) throw new Error('Order not found')
  const order = snap.data() as Order
  if (order.status === 'refunded') throw new Error('This order was already refunded')
  if (!order.payment?.intent_id) throw new Error('Only paid orders can be canceled — pending holds expire on their own')

  const orgSnap = await adminDb.collection('orgs').doc(orgId).get()
  const org = orgSnap.exists ? (orgSnap.data() as Org) : null
  if (!org?.stripe_account_id) throw new Error('Stripe is not connected')

  const refund = await stripe.refunds.create(
    { payment_intent: order.payment.intent_id },
    { stripeAccount: org.stripe_account_id },
  )
  await markRefundedCore(orgId, orderId, {
    refund_id: refund.id,
    amount: (refund.amount ?? 0) / 100,
    refunded_at: new Date().toISOString(),
    ...(opts?.note ? { note: opts.note } : {}),
  })
}
