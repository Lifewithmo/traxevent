export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { getPublicContract } from '@/actions/contracts-public'
import { ContractSignClient } from '@/components/contracts/ContractSignClient'

export default async function PublicContractPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const contract = await getPublicContract(token)
  if (!contract) notFound()
  return <ContractSignClient token={token} contract={contract} />
}
