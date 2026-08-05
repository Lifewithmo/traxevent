// app/api/payments/proposal-deposit/intent/route.ts
import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { stripe } from '@/lib/stripe'
import { adminDb } from '@/lib/firebase-admin'
import { computeSelectedTotal, depositAmount } from '@/lib/proposals'
import { signedDocumentHash } from '@/lib/proposal-signature'
import type { Org, Proposal, ProposalSelection, PendingSignature } from '@/lib/types'

// Server-authoritative request context. The client never supplies ip/ua —
// they are derived here from the (server-trusted) request headers, exactly
// as in actions/proposals-public.ts.
async function requestContext(): Promise<{ ip: string; user_agent: string }> {
  const h = await headers()
  return {
    ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown',
    user_agent: h.get('user-agent') ?? 'unknown',
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const token = typeof body?.token === 'string' ? body.token : ''
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 })

  // Resolve the proposal by its unguessable public token (authorization).
  const snap = await adminDb.collectionGroup('proposals').where('token', '==', token).limit(1).get()
  if (snap.empty) return NextResponse.json({ error: 'Proposal not found' }, { status: 404 })
  const doc = snap.docs[0]
  const proposal = doc.data() as Proposal

  if (!proposal.deposit) {
    return NextResponse.json({ error: 'This proposal has no deposit configured' }, { status: 400 })
  }

  // The org lives at orgs/{orgId}/proposals/{proposalId} — derive it from the
  // found doc's own path, never from client input.
  const orgRef = doc.ref.parent.parent
  if (!orgRef) return NextResponse.json({ error: 'Org not found' }, { status: 404 })
  const orgSnap = await orgRef.get()
  if (!orgSnap.exists) return NextResponse.json({ error: 'Org not found' }, { status: 404 })
  const org = orgSnap.data() as Org

  if (!org.stripe_account_id) {
    return NextResponse.json(
      { error: 'This organization has not connected a Stripe account' },
      { status: 400 }
    )
  }

  let selection: ProposalSelection

  if (proposal.deposit_gate === 'before_accept') {
    // Not yet signed — the client must sign in the same request that funds
    // the deposit. Validate signer/consent/selection exactly as
    // actions/proposals-public.ts#signProposal does, then capture a
    // server-authoritative pending_signature BEFORE creating the intent.
    if (proposal.status !== 'sent' || proposal.signature) {
      return NextResponse.json(
        { error: 'This proposal is no longer awaiting a response' },
        { status: 400 }
      )
    }

    const name = typeof body?.signer_name === 'string' ? body.signer_name.trim() : ''
    const email = typeof body?.signer_email === 'string' ? body.signer_email.trim() : ''
    const optionalIds = body?.selection?.optional_item_ids ?? []
    if (!name || !email || !email.includes('@')) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
    if (body?.consent !== true) {
      return NextResponse.json({ error: 'You must consent to sign electronically' }, { status: 400 })
    }
    if (!Array.isArray(optionalIds)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const packages = proposal.packages ?? []
    const items = proposal.line_items ?? []
    const packageId = body?.selection?.package_id
    if (packages.length > 0) {
      if (!packageId) {
        return NextResponse.json({ error: 'Please select an option before accepting' }, { status: 400 })
      }
      if (!packages.some((p) => p.id === packageId)) {
        return NextResponse.json({ error: 'Invalid selection' }, { status: 400 })
      }
    }
    const validOptional = new Set(
      items.filter((i) => i.optional === true && i.id !== undefined).map((i) => i.id as string),
    )
    for (const id of optionalIds) {
      if (!validOptional.has(id)) {
        return NextResponse.json({ error: 'Invalid selection' }, { status: 400 })
      }
    }

    const now = new Date().toISOString()
    const { ip, user_agent } = await requestContext()
    selection = {
      ...(packages.length > 0 && packageId ? { package_id: packageId } : {}),
      optional_item_ids: optionalIds,
      selected_total: computeSelectedTotal(proposal, { package_id: packageId, optional_item_ids: optionalIds }),
      selected_at: now,
    }
    const document_hash = signedDocumentHash(proposal, selection)
    const pending_signature: PendingSignature = {
      signer_name: name,
      signer_email: email,
      captured_at: now,
      ip,
      user_agent,
      document_hash,
      selection,
    }
    // Written BEFORE the PaymentIntent is created — the webhook promotes
    // this to the authoritative `signature` only once the deposit succeeds.
    await doc.ref.update({ pending_signature, updated_at: now })
  } else {
    // after_accept (or legacy/no gate): the proposal must already be signed
    // with a locked selection — the deposit is charged against THAT
    // selection, never a client-supplied one.
    if (!proposal.selection) {
      return NextResponse.json({ error: 'This proposal has not been accepted yet' }, { status: 400 })
    }
    selection = proposal.selection
  }

  // The amount is always server-computed from the proposal + selection —
  // never taken from the request body.
  const total = computeSelectedTotal(proposal, selection)
  const depositDue = depositAmount(total, proposal.deposit)
  if (!(depositDue > 0)) {
    return NextResponse.json({ error: 'This proposal has no deposit configured' }, { status: 400 })
  }

  const amountCents = Math.round(depositDue * 100)
  const applicationFeeCents = Math.round(amountCents * 0.01) // 1% platform fee

  let paymentIntent: Awaited<ReturnType<typeof stripe.paymentIntents.create>>
  try {
    paymentIntent = await stripe.paymentIntents.create(
      {
        amount: amountCents,
        currency: 'usd',
        application_fee_amount: applicationFeeCents,
        automatic_payment_methods: { enabled: true },
        metadata: { purpose: 'proposal_deposit', proposal_id: proposal.id, token },
      },
      { stripeAccount: org.stripe_account_id }
    )
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create payment' },
      { status: 502 }
    )
  }

  if (!paymentIntent.client_secret) {
    return NextResponse.json({ error: 'Payment intent has no client secret' }, { status: 500 })
  }

  return NextResponse.json({
    clientSecret: paymentIntent.client_secret,
    stripeAccountId: org.stripe_account_id,
  })
}
