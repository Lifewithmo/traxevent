export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { getContract } from '@/actions/contracts'
import { ContractEditorClient } from '@/components/admin/ContractEditorClient'

export default async function ContractEditorPage({ params }: { params: Promise<{ orgSlug: string; leadId: string; contractId: string }> }) {
  const { orgSlug, leadId, contractId } = await params
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const orgId = orgSnap.docs[0].id
  const contract = await getContract(orgId, contractId)
  if (!contract || contract.lead_id !== leadId) notFound()
  return <ContractEditorClient orgId={orgId} orgSlug={orgSlug} leadId={leadId} contract={contract} />
}
