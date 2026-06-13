// app/api/payments/webhook/route.ts
import Stripe from 'stripe'
import { stripe } from '@/lib/stripe'
import { headers } from 'next/headers'
import { adminDb } from '@/lib/firebase-admin'
import { sendRegistrationConfirmation } from '@/lib/email'
import { getVerifiedSendingDomain } from '@/actions/domains'

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
        camp_name: string
        org_name: string
        org_slug: string
        camp_slug: string
        id: string
        org_id: string
        camp_id: string
        access_token: string | null
      }

      // Fetch camp for sender config
      const campSnap = await adminDb
        .collection('orgs').doc(familyData.org_id)
        .collection('camps').doc(familyData.camp_id)
        .get()
      const campSenderConfig = campSnap.exists
        ? campSnap.data() as { from_display_name?: string; reply_to_email?: string }
        : {}

      // Send confirmation email (best-effort — don't fail the webhook if email fails)
      try {
        const fromDomain = await getVerifiedSendingDomain(familyData.org_id)
        await sendRegistrationConfirmation({
          to: familyData.email,
          firstName: familyData.first_name,
          campName: familyData.camp_name,
          orgName: familyData.org_name,
          orgSlug: familyData.org_slug,
          campSlug: familyData.camp_slug,
          familyId: familyData.id,
          accessToken: familyData.access_token ?? '',
          fromDisplayName: campSenderConfig.from_display_name,
          replyTo: campSenderConfig.reply_to_email,
          fromDomain,
        })
      } catch {
        // Email failure should not cause Stripe to retry the webhook
      }
    }
  }

  return new Response('ok')
}
