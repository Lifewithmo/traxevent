import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { CONTRACT_STATUS_LABELS } from '@/lib/contracts'
import type { Contract } from '@/lib/types'

export interface ContractRow extends Contract {
  clientName: string
}

interface AllContractsTableProps {
  orgSlug: string
  rows: ContractRow[]
}

function formatSigned(c: ContractRow): string {
  if (c.status !== 'signed') return '—'
  const who = c.signed_by || 'Signed'
  const when = c.signed_at ? new Date(c.signed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''
  return when ? `${who} · ${when}` : who
}

export function AllContractsTable({ orgSlug, rows }: AllContractsTableProps) {
  return (
    <div className="p-6 max-w-5xl space-y-4">
      <div className="flex items-baseline gap-2">
        <h1 className="text-2xl font-bold">Contracts</h1>
        <span className="text-sm text-muted-foreground">{rows.length}</span>
      </div>

      <div className="bg-card rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted border-b">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Title</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Client</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Signed</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">No contracts yet.</td></tr>
            ) : (
              rows.map((c) => (
                <tr key={c.id} className="border-b last:border-0 hover:bg-muted/50">
                  <td className="px-3 py-2 font-medium">
                    <Link href={`/${orgSlug}/leads/${c.lead_id}/contracts/${c.id}`} className="block hover:underline">{c.title || 'Contract'}</Link>
                  </td>
                  <td className="px-3 py-2">{c.clientName || '—'}</td>
                  <td className="px-3 py-2"><Badge variant="secondary">{CONTRACT_STATUS_LABELS[c.status]}</Badge></td>
                  <td className="px-3 py-2 text-muted-foreground">{formatSigned(c)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
