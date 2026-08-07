export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { getLead } from '@/actions/leads'
import { getCustomer } from '@/actions/customers'
import { SkeletonPicker } from '@/components/admin/proposal-builder/SkeletonPicker'
import type { OrgBranding } from '@/lib/types'

// "New proposal" (spec §3): full-screen skeleton picker with CRM autofill —
// the title and intro greeting come from the org and the opportunity, so no
// customer data is ever copy-pasted into a fresh document by hand.
export default async function NewProposalPage({ params }: { params: Promise<{ orgSlug: string; leadId: string }> }) {
  const { orgSlug, leadId } = await params
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const orgId = orgSnap.docs[0].id
  const org = orgSnap.docs[0].data() as { name: string; branding?: OrgBranding }

  const lead = await getLead(orgId, leadId)
  if (!lead) notFound()
  const customer = lead.customer_id ? await getCustomer(orgId, lead.customer_id) : null

  const displayName = org.branding?.display_name ?? org.name
  const opportunityName = lead.title ?? lead.name
  const title = `${displayName} — ${opportunityName}`
  const contactName = customer?.name ?? lead.name

  return (
    <SkeletonPicker
      orgId={orgId}
      orgSlug={orgSlug}
      leadId={leadId}
      title={title}
      contactName={contactName}
    />
  )
}
