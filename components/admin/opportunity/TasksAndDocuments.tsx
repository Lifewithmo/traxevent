'use client'

import { useState } from 'react'
import { attachmentChips, todayYmd, type AttachmentChip } from '@/lib/opportunity-detail'
import { AttachmentChips } from '@/components/admin/opportunity/AttachmentChips'
import { TasksPanel, type TasksPanelHandle } from '@/components/admin/opportunity/TasksPanel'
import { LeadProposalsClient } from '@/components/admin/LeadProposalsClient'
import { LeadInvoicesClient } from '@/components/admin/LeadInvoicesClient'
import { LeadContractsClient } from '@/components/admin/LeadContractsClient'
import { LeadVendorsClient } from '@/components/admin/LeadVendorsClient'
import type { Contract, NormalizedInvoice, Proposal, Task, Vendor } from '@/lib/types'

interface TasksAndDocumentsProps {
  orgId: string
  orgSlug: string
  leadId: string
  tasks: Task[]
  proposals: Proposal[]
  invoices: NormalizedInvoice[]
  contracts: Contract[]
  vendors: Vendor[]
  acceptedProposals: { id: string; title: string }[]
  tasksPanelRef?: React.Ref<TasksPanelHandle>
}

export function TasksAndDocuments({
  orgId,
  orgSlug,
  leadId,
  tasks,
  proposals,
  invoices,
  contracts,
  vendors,
  acceptedProposals,
  tasksPanelRef,
}: TasksAndDocumentsProps) {
  const [selected, setSelected] = useState<AttachmentChip['kind']>('task')
  const chips = attachmentChips({ tasks, proposals, invoices, contracts, vendors, today: todayYmd() })
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground">Tasks & documents</h2>
      <AttachmentChips chips={chips} selected={selected} onSelect={setSelected} />
      {selected === 'task' && <TasksPanel ref={tasksPanelRef} orgId={orgId} leadId={leadId} tasks={tasks} />}
      {selected === 'proposal' && (
        <LeadProposalsClient orgId={orgId} orgSlug={orgSlug} leadId={leadId} proposals={proposals} />
      )}
      {selected === 'invoice' && (
        <LeadInvoicesClient
          orgId={orgId}
          orgSlug={orgSlug}
          leadId={leadId}
          invoices={invoices}
          acceptedProposals={acceptedProposals}
        />
      )}
      {selected === 'contract' && (
        <LeadContractsClient orgId={orgId} orgSlug={orgSlug} leadId={leadId} contracts={contracts} />
      )}
      {selected === 'vendor' && <LeadVendorsClient orgId={orgId} leadId={leadId} vendors={vendors} />}
    </div>
  )
}
