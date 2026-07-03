import type { ContractStatus } from '@/lib/types'

export const CONTRACT_STATUSES: ContractStatus[] = ['draft', 'sent', 'signed']

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  draft: 'Draft',
  sent: 'Awaiting signature',
  signed: 'Signed',
}

// A contract can be signed only while it's out for signature.
export function canSignContract(status: ContractStatus): boolean {
  return status === 'sent'
}
