// app/api/payments/webhook/route.ts
import Stripe from 'stripe'
import { FieldValue } from 'firebase-admin/firestore'
import { stripe } from '@/lib/stripe'
import { headers } from 'next/headers'
import { adminDb } from '@/lib/firebase-admin'
import { sendRegistrationConfirmation } from '@/lib/email'
import { getVerifiedSendingDomain } from '@/actions/domains'
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
      if (proposal.payment_status === 'deposit_paid') return new Response('ok') // idempotent

      const now = new Date().toISOString()
      const update: Record<string, unknown> = {
        payment_status: 'deposit_paid',
        deposit_payment: { intent_id: pi.id, amount: pi.amount / 100, paid_at: now },
        updated_at: now,
        events: FieldValue.arrayUnion({ kind: 'deposit_paid', at: now }),
      }

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
        const orgRef = ref.parent.parent
        if (orgRef) {
          await orgRef.collection('leads').doc(proposal.lead_id).update({
            stage: 'closed_won',
            updated_at: now,
          })
        }
      }

      await ref.update(update)
      try {
        // best-effort signed/paid confirmation email
      } catch {
        // email failure should not cause Stripe to retry the webhook
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

  return new Response('ok')
}
