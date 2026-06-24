'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { aggregateOrgReport } from '@/lib/reports'
import type { OrgReport } from '@/lib/reports'
import type { Department } from '@/lib/types'

interface OrgReportsClientProps {
  report: OrgReport
  departments: Department[]
}

function money(n: number): string {
  return `$${n.toFixed(2)}`
}

function downloadCsv(rows: OrgReport['rows']) {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`
  const header = 'Event,Year,Status,Registrants,Confirmed,Pending,Waitlisted,Total Due,Total Paid,Outstanding'
  const lines = rows.map((r) =>
    [esc(r.camp_name), r.year, esc(r.status), r.registrants, r.confirmed, r.pending, r.waitlisted, r.totalDue.toFixed(2), r.totalPaid.toFixed(2), r.outstanding.toFixed(2)].join(',')
  )
  const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'org-events-report.csv'
  a.click()
  URL.revokeObjectURL(url)
}

export function OrgReportsClient({ report, departments }: OrgReportsClientProps) {
  const [deptFilter, setDeptFilter] = useState<string>('')

  const filtered = useMemo(() => {
    const rows = deptFilter ? report.rows.filter((r) => r.department_id === deptFilter) : report.rows
    return aggregateOrgReport(rows)
  }, [report, deptFilter])

  const { rows, totals } = filtered

  return (
    <div className="p-6 max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Org reports</h1>
        <Button variant="outline" size="sm" onClick={() => downloadCsv(rows)} disabled={rows.length === 0}>
          Export CSV
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">Registration and financial totals across all your events.</p>

      {departments.length > 0 && (
        <div className="space-y-1 max-w-xs">
          <Label htmlFor="deptFilter">Department</Label>
          <select
            id="deptFilter"
            className="w-full border rounded-md px-3 py-2 text-sm bg-white"
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
          >
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs uppercase text-muted-foreground">Events</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{totals.camps}</CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs uppercase text-muted-foreground">Registrants</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{totals.registrants}</CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs uppercase text-muted-foreground">Outstanding</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{money(totals.outstanding)}</CardContent></Card>
      </div>

      <div className="bg-card rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted border-b">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Event</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Year</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Registrants</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Confirmed</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Due</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Paid</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Outstanding</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-4 text-center text-muted-foreground">No events.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.camp_id} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium">{r.camp_name}</td>
                  <td className="px-3 py-2 text-right">{r.year}</td>
                  <td className="px-3 py-2 text-right">{r.registrants}</td>
                  <td className="px-3 py-2 text-right">{r.confirmed}</td>
                  <td className="px-3 py-2 text-right">{money(r.totalDue)}</td>
                  <td className="px-3 py-2 text-right">{money(r.totalPaid)}</td>
                  <td className="px-3 py-2 text-right">{money(r.outstanding)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
