'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { attachmentChips, type AttachmentChip } from '@/lib/opportunity-detail'
import { AttachmentChips } from '@/components/admin/opportunity/AttachmentChips'
import { TasksPanel, type TasksPanelHandle } from '@/components/admin/opportunity/TasksPanel'
import { LeadProposalsClient } from '@/components/admin/LeadProposalsClient'
import { LeadInvoicesClient } from '@/components/admin/LeadInvoicesClient'
import { LeadVendorsClient } from '@/components/admin/LeadVendorsClient'
import type { NormalizedInvoice, Proposal, Task, Vendor } from '@/lib/types'

interface TasksAndDocumentsProps {
  orgId: string
  orgSlug: string
  leadId: string
  tasks: Task[]
  proposals: Proposal[]
  invoices: NormalizedInvoice[]
  vendors: Vendor[]
  acceptedProposals: { id: string; title: string }[]
  today: string
}

export interface TasksAndDocumentsHandle {
  openTaskComposer(): void
}

export const TasksAndDocuments = forwardRef<TasksAndDocumentsHandle, TasksAndDocumentsProps>(function TasksAndDocuments(
  { orgId, orgSlug, leadId, tasks, proposals, invoices, vendors, acceptedProposals, today },
  ref
) {
  const [selected, setSelected] = useState<AttachmentChip['kind']>('task')
  // Set alongside `selected` when the composer is requested imperatively; consumed by the
  // effect below once TasksPanel has (re)mounted, so it also covers the "Tasks already
  // selected" case (TasksPanel is already mounted, so the effect fires immediately).
  const [pendingComposer, setPendingComposer] = useState(false)
  const tasksPanelRef = useRef<TasksPanelHandle>(null)
  const chips = attachmentChips({ tasks, proposals, invoices, vendors, today })

  useImperativeHandle(ref, () => ({
    openTaskComposer: () => {
      setSelected('task')
      setPendingComposer(true)
    },
  }))

  useEffect(() => {
    if (selected === 'task' && pendingComposer) {
      tasksPanelRef.current?.openComposer()
      setPendingComposer(false)
    }
  }, [selected, pendingComposer])

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
      {selected === 'vendor' && <LeadVendorsClient orgId={orgId} leadId={leadId} vendors={vendors} />}
    </div>
  )
})
