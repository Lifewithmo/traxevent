import type { ClientPortal } from '@/actions/client-portal-public'
import { PROPOSAL_STATUS_LABELS } from '@/lib/proposals'
import { INVOICE_LIFECYCLE_LABELS } from '@/lib/invoice-status'
import { CONTRACT_STATUS_LABELS } from '@/lib/contracts'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// Plain presentational component — read-only, no handlers, so no 'use client'.
// The login-free client hub: event details, a status timeline, and click-through
// to the client's own proposals (/proposals/[token]) and invoices (/invoices/[token]).

function money(n: number): string {
  return `$${n.toFixed(2)}`
}

export function ClientPortalView({ portal }: { portal: ClientPortal }) {
  const eventLine = [portal.event_type, portal.event_date].filter(Boolean).join(' · ')

  return (
    <main className="min-h-screen bg-gray-50 py-10">
      <div className="mx-auto max-w-3xl space-y-6 px-6">
        <header>
          <h1 className="text-2xl font-bold text-gray-900">{portal.client_name}</h1>
          {portal.organization && <p className="mt-1 text-gray-600">{portal.organization}</p>}
          {eventLine && <p className="mt-1 text-sm text-gray-500">{eventLine}</p>}
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Your event</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="flex items-center gap-2 overflow-x-auto">
              {portal.timeline.map((step, i) => (
                <li key={step.stage} className="flex items-center gap-2">
                  <div className="flex flex-col items-center gap-1.5 text-center">
                    <span
                      className={[
                        'flex h-8 w-8 items-center justify-center rounded-full border text-sm font-semibold',
                        step.done
                          ? 'border-green-600 bg-green-600 text-white'
                          : step.current
                            ? 'border-blue-600 bg-blue-600 text-white'
                            : 'border-gray-300 bg-white text-gray-400',
                      ].join(' ')}
                    >
                      {step.done ? '✓' : i + 1}
                    </span>
                    <span
                      className={[
                        'text-xs whitespace-nowrap',
                        step.current
                          ? 'font-semibold text-blue-700'
                          : step.done
                            ? 'text-gray-700'
                            : 'text-gray-400',
                      ].join(' ')}
                    >
                      {step.label}
                    </span>
                  </div>
                  {i < portal.timeline.length - 1 && (
                    <span
                      className={[
                        'h-px w-6 shrink-0',
                        step.done ? 'bg-green-600' : 'bg-gray-300',
                      ].join(' ')}
                      aria-hidden="true"
                    />
                  )}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Proposals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {portal.proposals.length === 0 ? (
              <p className="text-sm text-gray-500">No proposals yet.</p>
            ) : (
              portal.proposals.map((p) => (
                <div
                  key={p.token}
                  className="flex items-center justify-between gap-3 rounded-md border border-gray-200 px-3 py-2"
                >
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{p.title || 'Proposal'}</span>
                      <Badge variant="secondary">{PROPOSAL_STATUS_LABELS[p.status]}</Badge>
                    </div>
                    <p className="text-xs text-gray-500">{money(p.total)}</p>
                  </div>
                  <a
                    href={`/proposals/${p.token}`}
                    className="inline-flex h-8 items-center rounded-md border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-100"
                  >
                    View proposal
                  </a>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Invoices</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {portal.invoices.length === 0 ? (
              <p className="text-sm text-gray-500">No invoices yet.</p>
            ) : (
              portal.invoices.map((i) => (
                <div
                  key={i.token}
                  className="flex items-center justify-between gap-3 rounded-md border border-gray-200 px-3 py-2"
                >
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">
                        {[i.number ? `#${i.number}` : '', i.title || 'Invoice'].filter(Boolean).join(' ')}
                      </span>
                      <Badge variant="secondary">{INVOICE_LIFECYCLE_LABELS[i.lifecycle]}</Badge>
                    </div>
                    <p className="text-xs text-gray-500">
                      {money(i.total)} · Balance due {money(i.balance)}
                    </p>
                  </div>
                  <a
                    href={`/invoices/${i.token}`}
                    className="inline-flex h-8 items-center rounded-md border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-100"
                  >
                    View invoice
                  </a>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contracts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {portal.contracts.length === 0 ? (
              <p className="text-sm text-gray-500">No contracts yet.</p>
            ) : (
              portal.contracts.map((c) => (
                <div
                  key={c.token}
                  className="flex items-center justify-between gap-3 rounded-md border border-gray-200 px-3 py-2"
                >
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{c.title || 'Contract'}</span>
                      <Badge variant="secondary">{CONTRACT_STATUS_LABELS[c.status]}</Badge>
                    </div>
                  </div>
                  <a
                    href={`/contracts/${c.token}`}
                    className="inline-flex h-8 items-center rounded-md border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-100"
                  >
                    View contract
                  </a>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
