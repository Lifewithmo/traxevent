import Link from 'next/link'
import { formatRelativeTime } from '@/lib/opportunity-detail'
import type { CustomerRollup } from '@/lib/crm/customer-rollup'
import type { Customer } from '@/lib/types'

interface ClientsTableProps {
  orgSlug: string
  rows: Array<{ customer: Customer; rollup: CustomerRollup }>
}

export function ClientsTable({ orgSlug, rows }: ClientsTableProps) {
  return (
    <div className="p-6 max-w-5xl space-y-4">
      <div className="flex items-baseline gap-2">
        <h1 className="text-2xl font-bold">Clients</h1>
        <span className="text-sm text-muted-foreground">{rows.length}</span>
      </div>

      <div className="bg-card rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted border-b">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Name</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Company</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Open</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Won</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Lifetime value</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Last activity</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">No clients yet.</td></tr>
            ) : (
              rows.map(({ customer, rollup }) => (
                <tr key={customer.id} className="border-b last:border-0 hover:bg-muted/50">
                  <td className="px-3 py-2 font-medium">
                    <Link href={`/${orgSlug}/clients/${customer.id}`} className="block hover:underline">{customer.name}</Link>
                  </td>
                  <td className="px-3 py-2">{customer.company || '—'}</td>
                  <td className="px-3 py-2 text-right">{rollup.openCount}</td>
                  <td className="px-3 py-2 text-right">{rollup.wonCount} won</td>
                  <td className="px-3 py-2 text-right">${rollup.totalWonValue.toLocaleString()}</td>
                  <td className="px-3 py-2">{rollup.lastActivityAt ? formatRelativeTime(rollup.lastActivityAt) : '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
