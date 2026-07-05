import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { proposalTotal, PROPOSAL_STATUS_LABELS } from '@/lib/proposals'
import type { Proposal } from '@/lib/types'

export interface ProposalRow extends Proposal {
  clientName: string
}

interface AllProposalsTableProps {
  orgSlug: string
  rows: ProposalRow[]
}

export function AllProposalsTable({ orgSlug, rows }: AllProposalsTableProps) {
  return (
    <div className="p-6 max-w-5xl space-y-4">
      <div className="flex items-baseline gap-2">
        <h1 className="text-2xl font-bold">Proposals</h1>
        <span className="text-sm text-muted-foreground">{rows.length}</span>
      </div>

      <div className="bg-card rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted border-b">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Title</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Client</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">No proposals yet.</td></tr>
            ) : (
              rows.map((p) => (
                <tr key={p.id} className="border-b last:border-0 hover:bg-muted/50">
                  <td className="px-3 py-2 font-medium">
                    <Link href={`/${orgSlug}/leads/${p.lead_id}/proposals/${p.id}`} className="block hover:underline">{p.title || 'Untitled proposal'}</Link>
                  </td>
                  <td className="px-3 py-2">{p.clientName || '—'}</td>
                  <td className="px-3 py-2"><Badge variant="secondary">{PROPOSAL_STATUS_LABELS[p.status]}</Badge></td>
                  <td className="px-3 py-2 text-right">${proposalTotal(p.line_items).toFixed(2)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
