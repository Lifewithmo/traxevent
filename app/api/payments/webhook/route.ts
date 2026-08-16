// app/api/payments/webhook/route.ts
import Stripe from 'stripe'
import { FieldValue } from 'firebase-admin/firestore'
import { stripe } from '@/lib/stripe'
import { headers } from 'next/headers'
import { adminDb } from '@/lib/firebase-admin'
import { sendRegistrationConfirmation, sendProposalSignedConfirmation, sendOrderConfirmation } from '@/lib/email'
import { getVerifiedSendingDomain } from '@/actions/domains'
import { reconcileProposalDeposit } from '@/lib/crm/deposit-reconcile'
import { confirmOrderCore, markRefundedCore, ordersRef } from '@/lib/storefront/orders'
import { getDropCore } from '@/lib/storefront/drops'
import { findOrCreateCustomerCore } from '@/lib/crm/customers'
import { logActivity } from '@/lib/activity'
import type { Proposal } from '@/lib/types'

export async function POST(req: Request) {
  const body = await req.text()
  const headersList = await headers()
  const sig = headersList.get('stripe-signature')

  if (!sig) return new Response('Missing stripe-signature header', { status: 400 })

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_PAYMENT_WEBHOOK_SECRET!)
  } catch {
    return new Response('Invalid webhook signature', { status: 400 })
  }

  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object as Stripe.PaymentIntent

    if (pi.metadata?.purpose === 'drop_order') {
      const orderId = pi.metadata.order_id
      const orgId = pi.metadata.org_id
      if (!orderId || !orgId) return new Response('ok')

      // Durable write first: transactional confirm + pickup-number assignment.
      // Everything after is best-effort and must not trigger Stripe retries.
      const { order, confirmedNow } = await confirmOrderCore(orgId, orderId, {
        intent_id: pi.id,
        paid_at: new Date(pi.created * 1000).toISOString(),
      })
      if (!confirmedNow) return new Response('ok')

      try {
        const { customer } = await findOrCreateCustomerCore(orgId, {
          name: order.buyer.name,
          email: order.buyer.email,
          ...(order.buyer.phone ? { phone: order.buyer.phone } : {}),
        })
        await ordersRef(orgId).doc(orderId).update({ customer_id: customer.id, updated_at: new Date().toISOString() })

        const drop = await getDropCore(orgId, order.drop_id)
        await logActivity(orgId, {
          parent_type: 'customer',
          parent_id: customer.id,
          kind: 'order',
          summary: `Order #${order.number} — ${drop?.title ?? 'drop'} ($${order.total.toFixed(2)})`,
        })

        const window = drop?.pickup.windows.find((w) => w.id === order.pickup_window_id)
        const pickupLabel = [
          window ? `${window.day} ${order.pickup_slot ?? `${window.start}–${window.end}`}` : '',
          drop?.pickup.location_name ?? '',
        ].filter(Boolean).join(' · ')
        let fromDomain: string | undefined
        try {
          fromDomain = await getVerifiedSendingDomain(orgId)
        } catch {
          // domain lookup failure should not block the email
        }
        const orgSnap = await adminDb.collection('orgs').doc(orgId).get()
        const orgData = orgSnap.exists ? (orgSnap.data() as { name?: string; branding?: { display_name?: string } }) : {}
        await sendOrderConfirmation({
          to: order.buyer.email,
          buyerName: order.buyer.name,
          orgDisplayName: orgData.branding?.display_name || orgData.name || 'Your order',
          dropTitle: drop?.title ?? 'Drop',
          orderNumber: order.number!,
          pickupLabel,
          lines: order.lines.map((l) => ({ name: l.name, qty: l.qty, price: l.price })),
          total: order.total,
          orderUrl: `${process.env.NEXT_PUBLIC_BASE_URL ?? 'https://traxevent.com'}/orders/${order.token}`,
          ...(fromDomain ? { fromDomain } : {}),
        })
      } catch {
        // CRM/email are best-effort — the order is already confirmed
      }
      return new Response('ok')
    }

    if (pi.metadata?.purpose === 'proposal_deposit') {
      const proposalId = pi.metadata.proposal_id
      const snap = await adminDb
        .collectionGroup('proposals')
        .where('id', '==', proposalId)
        .limit(1)
        .get()
      if (snap.empty) return new Response('ok')
      const ref = snap.docs[0].ref
      const proposal = snap.docs[0].data() as Proposal
      const orgRef = ref.parent.parent
      const now = new Date().toISOString()

      if (proposal.payment_status !== 'deposit_paid') {
        const update: Record<string, unknown> = {
          payment_status: 'deposit_paid',
          deposit_payment: { intent_id: pi.id, amount: pi.amount / 100, paid_at: now },
          updated_at: now,
          events: FieldValue.arrayUnion({ kind: 'deposit_paid', at: now }),
        }

        // Set only when this call is the one that promotes a before_accept
        // pending signature — drives the confirmation email below.
        let promotedSigner: { signer_name: string; signer_email: string } | null = null

        // before_accept: promote the pending signature and finalize the close
        // atomically with the deposit — the FIRST time the deposit lands.
        if (!proposal.signature && proposal.pending_signature) {
          const ps = proposal.pending_signature
          update.status = 'accepted'
          update.selection = ps.selection
          update.signature = {
            signer_name: ps.signer_name,
            signer_email: ps.signer_email,
            signed_at: now,
            ip: ps.ip,
            user_agent: ps.user_agent,
            consent_electronic: true,
            document_hash: ps.document_hash,
          }
          update.client_response_at = now
          update.pending_signature = FieldValue.delete()
          update.events = FieldValue.arrayUnion(
            { kind: 'signed', at: now, ip: ps.ip, user_agent: ps.user_agent },
            { kind: 'deposit_paid', at: now },
          )
          promotedSigner = { signer_name: ps.signer_name, signer_email: ps.signer_email }
          // The lead advance runs BEFORE the proposal `ref.update` below. This is
          // deliberate and self-healing: `payment_status` only flips to
          // 'deposit_paid' in the write that follows, so if that write fails,
          // Stripe retries the event and the idempotency guard above (which
          // checks `payment_status === 'deposit_paid'`) hasn't tripped yet —
          // this whole block, including the lead advance, safely replays.
          // Reordering to proposal-first would do the opposite: a failed lead
          // update after a successful proposal write would permanently strand
          // the lead un-advanced, since the now-`deposit_paid` guard would skip
          // this block on every retry. Do not reorder.
          if (orgRef) {
            await orgRef.collection('leads').doc(proposal.lead_id).update({
              stage: 'closed_won',
              updated_at: now,
            })
          }
        }

        await ref.update(update)

        if (promotedSigner) {
          // best-effort signed/paid confirmation email for the before_accept
          // path — the after_accept path already sends this from signProposal
          // when the signer originally signs, well before any deposit.
          let fromDomain: string | undefined
          try {
            fromDomain = orgRef ? await getVerifiedSendingDomain(orgRef.id) : undefined
          } catch {
            // domain lookup failure should not block the email — fall back to default
          }
          try {
            await sendProposalSignedConfirmation({
              to: promotedSigner.signer_email,
              signerName: promotedSigner.signer_name,
              token: proposal.token,
              signedAt: now,
              fromDomain,
            })
          } catch {
            // email failure should not cause Stripe to retry the webhook
          }
        }
      }

      // ALWAYS reconcile (idempotent). Runs after the proposal is `accepted` —
      // either just-finalized above, or already accepted on a retry — and
      // safely replays on a retry after a partial reconcile failure.
      // Idempotency for the invoice/payment side lives in the reconciler
      // itself, not in this guard.
      if (orgRef) {
        // Use the PaymentIntent's own `created` (the actual Stripe charge
        // time), not `now` (webhook processing time) — the invoice's
        // issued/charge timestamp should reflect when Stripe actually
        // charged the card, not when this handler happened to run.
        await reconcileProposalDeposit(orgRef.id, proposal.lead_id, proposal.id, {
          intent_id: pi.id, amount: pi.amount / 100, paid_at: new Date(pi.created * 1000).toISOString(),
        })
      }
      return new Response('ok')
    }

    const familyId = pi.metadata?.familyId
    if (!familyId) return new Response('ok')

    const snap = await adminDb
      .collectionGroup('families')
      .where('id', '==', familyId)
      .limit(1)
      .get()

    if (!snap.empty) {
      try {
        await snap.docs[0].ref.update({
          payment_status: 'paid',
          amount_paid: pi.amount / 100,
          updated_at: new Date().toISOString(),
        })
      } catch {
        return new Response('Firestore update failed', { status: 500 })
      }

      const familyData = snap.docs[0].data() as {
        first_name: string
        email: string
        event_name: string
        org_name: string
        org_slug: string
        event_slug: string
        id: string
        org_id: string
        event_id: string
        access_token: string | null
      }

      // Fetch event for sender config
      const eventSnap = await adminDb
        .collection('orgs').doc(familyData.org_id)
        .collection('events').doc(familyData.event_id)
        .get()
      const eventSenderConfig = eventSnap.exists
        ? eventSnap.data() as { from_display_name?: string; reply_to_email?: string }
        : {}

      // Send confirmation email (best-effort — don't fail the webhook if email fails)
      try {
        const fromDomain = await getVerifiedSendingDomain(familyData.org_id)
        await sendRegistrationConfirmation({
          to: familyData.email,
          firstName: familyData.first_name,
          eventName: familyData.event_name,
          orgName: familyData.org_name,
          orgSlug: familyData.org_slug,
          eventSlug: familyData.event_slug,
          familyId: familyData.id,
          accessToken: familyData.access_token ?? '',
          fromDisplayName: eventSenderConfig.from_display_name,
          replyTo: eventSenderConfig.reply_to_email,
          fromDomain,
        })
      } catch {
        // Email failure should not cause Stripe to retry the webhook
      }
    }
  }

  if (event.type === 'charge.refunded') {
    const charge = event.data.object as Stripe.Charge
    const piId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id
    const account = event.account   // connected-account events carry the acct id
    if (piId && account) {
      try {
        // Charge metadata is NOT copied from the PI — retrieve the PI on the
        // connected account to learn whether this refund belongs to a drop
        // order (covers refunds issued from the org's own Stripe dashboard).
        // Per-request options like `stripeAccount` are the THIRD argument
        // (params is the second) — this is the sanctioned, type-safe form.
        const pi = await stripe.paymentIntents.retrieve(piId, {}, { stripeAccount: account })
        if (pi.metadata?.purpose === 'drop_order' && pi.metadata.order_id && pi.metadata.org_id) {
          await markRefundedCore(pi.metadata.org_id, pi.metadata.order_id, {
            refund_id: charge.refunds?.data?.[0]?.id ?? 'unknown',
            amount: (charge.amount_refunded ?? 0) / 100,
            refunded_at: new Date().toISOString(),
          })
        }
      } catch {
        // best-effort reconciliation — cancelOrder already wrote the primary record
      }
    }
    return new Response('ok')
  }

  return new Response('ok')
}
