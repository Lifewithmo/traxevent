'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { KpiBand } from '@/components/ui/kpi-band'
import { StatTile } from '@/components/ui/stat-tile'
import { StatusPill } from '@/components/ui/status-pill'
import { buildCustomReportCsv } from '@/actions/reports'
import { CUSTOM_REPORT_FIELDS, type CustomReportField } from '@/lib/reports'
import { FAMILY_LABEL, FAMILY_TONE, type PillTone } from '@/lib/event-ui'
import { formatMoney } from '@/lib/utils'
import type { EventReportData } from '@/actions/reports'
import type { FormCompletionRow } from '@/lib/forms'

type TabKey = 'summary' | 'financial' | 'dietary' | 'medical' | 'tshirt' | 'forms' | 'custom'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'summary', label: 'Summary' },
  { key: 'financial', label: 'Financial' },
  { key: 'dietary', label: 'Dietary & Allergy' },
  { key: 'medical', label: 'Medical' },
  { key: 'tshirt', label: 'T-shirts' },
  { key: 'forms', label: 'Forms' },
  { key: 'custom', label: 'Custom Export' },
]

interface ReportsClientProps {
  orgId: string
  eventId: string
  eventName: string
  registrationType: string
  data: EventReportData
  formSubmissions: FormCompletionRow[]
}

// Registration-status pills share the module-wide vocabulary; payment statuses
// get their own mapping (keys don't exist in FAMILY_TONE).
const STATUS_TONE: Record<string, PillTone> = FAMILY_TONE
const STATUS_LABEL: Record<string, string> = FAMILY_LABEL
const PAY_TONE: Record<string, PillTone> = { paid: 'confirmed', partial: 'pending', unpaid: 'alert', waived: 'neutral' }
const PAY_LABEL: Record<string, string> = { paid: 'Paid', partial: 'Partial', unpaid: 'Unpaid', waived: 'Waived' }

function downloadMissingCsv(row: { template_name: string; missing: { name: string; email: string }[] }) {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`
  const lines = ['Name,Email', ...row.missing.map((m) => `${esc(m.name)},${esc(m.email)}`)]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `missing-${row.template_name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function ReportsClient({ orgId, eventId, eventName, registrationType, data, formSubmissions }: ReportsClientProps) {
  const [tab, setTab] = useState<TabKey>('summary')
  const [selectedFields, setSelectedFields] = useState<CustomReportField[]>([
    'family_last_name',
    'member_first_name',
    'member_last_name',
  ])
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleField(field: CustomReportField) {
    setSelectedFields((prev) =>
      prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]
    )
  }

  async function handleDownload() {
    if (selectedFields.length === 0) return
    setDownloading(true)
    setError(null)
    try {
      const csv = await buildCustomReportCsv(orgId, eventId, selectedFields)
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${eventName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-report.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to build report')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="p-5 space-y-4">
      <div role="tablist" aria-label="Report views" className="flex gap-1 border-b flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            aria-controls={`panel-${t.key}`}
            id={`tab-${t.key}`}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.key
                ? 'border-b-2 border-primary text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'summary' && (
        <div role="tabpanel" id="panel-summary" aria-labelledby="tab-summary" className="space-y-4">
          <KpiBand>
            <StatTile label="Registrations" value={String(data.summary.total)} note={`${registrationType} registration`} />
            <StatTile label="Confirmed" value={String(data.summary.byStatus.confirmed ?? 0)} />
            <StatTile label="Collected" value={formatMoney(data.financial.totalPaid)} tone="money" />
            <StatTile label="Outstanding" value={formatMoney(data.financial.outstanding)} tone="money" />
          </KpiBand>
          <Card>
            <CardHeader><CardTitle className="text-base">Registrations ({data.summary.total})</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {data.summary.total === 0 ? (
                <EmptyState title="No registrations." />
              ) : (
                <>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase mb-1">By status</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(data.summary.byStatus).map(([s, n]) => (
                        <StatusPill key={s} tone={STATUS_TONE[s] ?? 'neutral'}>{STATUS_LABEL[s] ?? s}: {n}</StatusPill>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase mb-1">By payment</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(data.summary.byPaymentStatus).map(([s, n]) => (
                        <StatusPill key={s} tone={PAY_TONE[s] ?? 'neutral'}>{PAY_LABEL[s] ?? s}: {n}</StatusPill>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'financial' && (
        <div role="tabpanel" id="panel-financial" aria-labelledby="tab-financial">
          <Card>
            <CardHeader><CardTitle className="text-base">Financial</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Total billed</span><span className="font-medium">{formatMoney(data.financial.totalDue)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Total collected</span><span className="font-medium text-[var(--money-green)]">{formatMoney(data.financial.totalPaid)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Outstanding</span><span className="font-medium text-destructive">{formatMoney(data.financial.outstanding)}</span></div>
              <div className="pt-2 mt-2 border-t flex flex-wrap gap-2">
                <StatusPill tone="confirmed">Paid: {data.financial.paidCount}</StatusPill>
                <StatusPill tone="pending">Partial: {data.financial.partialCount}</StatusPill>
                <StatusPill tone="alert">Unpaid: {data.financial.unpaidCount}</StatusPill>
                <StatusPill tone="neutral">Waived: {data.financial.waivedCount}</StatusPill>
              </div>
              <p className="text-xs text-muted-foreground pt-2">Outstanding excludes waived balances. Refunds are managed in your Stripe dashboard.</p>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'dietary' && (
        <div role="tabpanel" id="panel-dietary" aria-labelledby="tab-dietary">
          <Card>
            <CardHeader><CardTitle className="text-base">Dietary & Allergy ({data.dietary.length})</CardTitle></CardHeader>
            <CardContent>
              {data.dietary.length === 0 ? (
                <EmptyState title="No dietary or allergy notes recorded." />
              ) : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-muted-foreground"><th className="py-1 pr-4 font-medium">Name</th><th className="py-1 pr-4 font-medium">Allergies</th><th className="py-1 font-medium">Dietary</th></tr></thead>
                  <tbody>
                    {data.dietary.map((r, i) => (
                      <tr key={i} className="border-b last:border-0"><td className="py-1.5 pr-4">{r.name}</td><td className="py-1.5 pr-4">{r.allergies || '—'}</td><td className="py-1.5">{r.dietary_restrictions || '—'}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'medical' && (
        <div role="tabpanel" id="panel-medical" aria-labelledby="tab-medical">
          <Card>
            <CardHeader><CardTitle className="text-base">Medical Notes ({data.medical.length})</CardTitle></CardHeader>
            <CardContent>
              {data.medical.length === 0 ? (
                <EmptyState title="No medical notes recorded." />
              ) : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-muted-foreground"><th className="py-1 pr-4 font-medium">Name</th><th className="py-1 font-medium">Medical notes</th></tr></thead>
                  <tbody>
                    {data.medical.map((r, i) => (
                      <tr key={i} className="border-b last:border-0"><td className="py-1.5 pr-4">{r.name}</td><td className="py-1.5">{r.medical_notes}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'tshirt' && (
        <div role="tabpanel" id="panel-tshirt" aria-labelledby="tab-tshirt">
          <Card>
            <CardHeader><CardTitle className="text-base">T-shirt Sizes ({data.tshirt.total})</CardTitle></CardHeader>
            <CardContent>
              {data.tshirt.total === 0 ? (
                <EmptyState title="No t-shirt sizes recorded." />
              ) : (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(data.tshirt.bySize).map(([size, n]) => (
                    <Badge key={size} variant="outline">{size}: {n}</Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'forms' && (
        <div role="tabpanel" id="panel-forms" aria-labelledby="tab-forms" className="space-y-4">
          {formSubmissions.length === 0 ? (
            <EmptyState title="No required registrant forms are assigned to this event." />
          ) : (
            formSubmissions.map((row) => {
              const pct = row.total === 0 ? 0 : Math.round((row.submitted_count / row.total) * 100)
              return (
                <div key={row.assignment_id} className="bg-card rounded-lg border overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b bg-muted">
                    <div>
                      <p className="font-medium">{row.template_name}</p>
                      <div className="mt-0.5 flex items-center gap-2">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted-foreground/20" aria-hidden="true">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {row.submitted_count} of {row.total} signed ({pct}%)
                        </p>
                      </div>
                    </div>
                    {row.missing.length > 0 && (
                      <Button variant="link" size="xs" onClick={() => downloadMissingCsv(row)}>
                        Export missing CSV
                      </Button>
                    )}
                  </div>
                  {row.missing.length === 0 ? (
                    <p className="px-4 py-3">
                      <StatusPill tone="confirmed">All registrants have signed. 🎉</StatusPill>
                    </p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="border-b">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium text-muted-foreground">Missing — Name</th>
                          <th className="px-4 py-2 text-left font-medium text-muted-foreground">Email</th>
                        </tr>
                      </thead>
                      <tbody>
                        {row.missing.map((m) => (
                          <tr key={m.family_id} className="border-b last:border-0">
                            <td className="px-4 py-2 font-medium">{m.name}</td>
                            <td className="px-4 py-2 text-muted-foreground">{m.email}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {tab === 'custom' && (
        <div role="tabpanel" id="panel-custom" aria-labelledby="tab-custom">
          <Card>
            <CardHeader><CardTitle className="text-base">Custom CSV Export</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">Choose columns, then download one row per attendee.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {CUSTOM_REPORT_FIELDS.map((field) => (
                  <label key={field} htmlFor={`f-${field}`} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      id={`f-${field}`}
                      type="checkbox"
                      className="w-4 h-4"
                      checked={selectedFields.includes(field)}
                      onChange={() => toggleField(field)}
                    />
                    <span className="break-all">{field}</span>
                  </label>
                ))}
              </div>
              <div aria-live="polite" aria-atomic="true">
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>
              <Button onClick={handleDownload} disabled={downloading || selectedFields.length === 0}>
                {downloading ? 'Building…' : 'Download CSV'}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
