import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { VENDOR_STATUS_LABELS } from '@/lib/vendors'
import type { Vendor } from '@/lib/types'

export interface VendorRow extends Vendor {
  clientName: string
}

interface AllVendorsTableProps {
  orgSlug: string
  rows: VendorRow[]
}

export function AllVendorsTable({ orgSlug, rows }: AllVendorsTableProps) {
  return (
    <div className="p-6 max-w-5xl space-y-4">
      <div className="flex items-baseline gap-2">
        <h1 className="text-2xl font-bold">Vendors</h1>
        <span className="text-sm text-muted-foreground">{rows.length}</span>
      </div>

      <div className="bg-card rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted border-b">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Name</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Service</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Client/Event</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Cost</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">No vendors yet.</td></tr>
            ) : (
              rows.map((v) => (
                <tr key={v.id} className="border-b last:border-0 hover:bg-muted/50">
                  <td className="px-3 py-2 font-medium">
                    <Link href={`/${orgSlug}/leads/${v.lead_id}`} className="block hover:underline">{v.name}</Link>
                  </td>
                  <td className="px-3 py-2">{v.service || '—'}</td>
                  <td className="px-3 py-2">{v.clientName || '—'}</td>
                  <td className="px-3 py-2 text-right">${(v.cost ?? 0).toFixed(2)}</td>
                  <td className="px-3 py-2"><Badge variant="secondary">{VENDOR_STATUS_LABELS[v.status]}</Badge></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
