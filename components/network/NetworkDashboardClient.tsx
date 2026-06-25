'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LinkOrgForm } from '@/components/network/LinkOrgForm'
import type { Network, Org } from '@/lib/types'
import type { NetworkReport } from '@/lib/reports'

interface NetworkDashboardClientProps {
  network: Network
  networkId: string
  orgs: Org[]
  report: NetworkReport
}

function money(n: number): string {
  return `$${n.toFixed(2)}`
}

export function NetworkDashboardClient({ network, networkId, orgs, report }: NetworkDashboardClientProps) {
  return (
    <div className="p-6 max-w-4xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{network.name}</h1>
        <p className="text-sm text-muted-foreground">Network dashboard</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs uppercase text-muted-foreground">Member orgs</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{report.totals.orgs}</CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs uppercase text-muted-foreground">Registrants</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{report.totals.registrants}</CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs uppercase text-muted-foreground">Outstanding</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{money(report.totals.outstanding)}</CardContent></Card>
      </div>

      <div className="bg-card rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted border-b">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Organization</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Events</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Registrants</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Due</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Paid</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Outstanding</th>
            </tr>
          </thead>
          <tbody>
            {report.orgs.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">No member organizations yet.</td></tr>
            ) : (
              report.orgs.map((o) => (
                <tr key={o.org_id} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium">{o.org_name}</td>
                  <td className="px-3 py-2 text-right">{o.report.totals.camps}</td>
                  <td className="px-3 py-2 text-right">{o.report.totals.registrants}</td>
                  <td className="px-3 py-2 text-right">{money(o.report.totals.totalDue)}</td>
                  <td className="px-3 py-2 text-right">{money(o.report.totals.totalPaid)}</td>
                  <td className="px-3 py-2 text-right">{money(o.report.totals.outstanding)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Member organizations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {orgs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No organizations linked to this network yet.</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {orgs.map((o) => (
                <li key={o.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="font-medium">{o.name}</span>
                  <span className="text-muted-foreground">{o.slug}</span>
                </li>
              ))}
            </ul>
          )}
          <LinkOrgForm networkId={networkId} />
        </CardContent>
      </Card>
    </div>
  )
}
