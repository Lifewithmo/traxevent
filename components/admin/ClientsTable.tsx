import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { LEAD_STAGE_LABELS } from '@/lib/leads'
import type { Lead } from '@/lib/types'

interface ClientsTableProps {
  orgSlug: string
  leads: Lead[]
}

export function ClientsTable({ orgSlug, leads }: ClientsTableProps) {
  return (
    <div className="p-6 max-w-5xl space-y-4">
      <div className="flex items-baseline gap-2">
        <h1 className="text-2xl font-bold">Clients</h1>
        <span className="text-sm text-muted-foreground">{leads.length}</span>
      </div>

      <div className="bg-card rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted border-b">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Name</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Organization</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Stage</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Email</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Est. value</th>
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">No clients yet.</td></tr>
            ) : (
              leads.map((l) => (
                <tr key={l.id} className="border-b last:border-0 hover:bg-muted/50">
                  <td className="px-3 py-2 font-medium">
                    <Link href={`/${orgSlug}/leads/${l.id}`} className="block hover:underline">{l.name}</Link>
                  </td>
                  <td className="px-3 py-2">{l.organization || '—'}</td>
                  <td className="px-3 py-2"><Badge variant="secondary">{LEAD_STAGE_LABELS[l.stage]}</Badge></td>
                  <td className="px-3 py-2">{l.email || '—'}</td>
                  <td className="px-3 py-2 text-right">${(l.estimated_value ?? 0).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
