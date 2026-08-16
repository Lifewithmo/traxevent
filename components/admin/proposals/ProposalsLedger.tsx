import Link from 'next/link'
import { FileText } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusPill } from '@/components/ui/status-pill'
import { PROPOSAL_STATUS_LABELS, PROPOSAL_STATUS_TONE } from '@/lib/proposals'
import type {
  ProposalLedger,
  ProposalLedgerGroup,
  ProposalLedgerRow,
  ProposalSignal,
} from '@/lib/proposals/ledger'

// Deliberately a SERVER component — no 'use client'. The raw Proposal doc the
// page loads carries `token`, `signature.ip`, `signature.signer_email` and
// `pending_signature`; buildProposalLedger narrows it to the minimal row shape
// above. Rendering here keeps that PII out of the client bundle entirely, which
// a client component would undo by serializing whatever it is handed.

const SIGNAL_LABEL: Record<ProposalSignal, string> = {
  expired: 'Expired',
  expiring: 'Expiring soon',
  unopened: 'Not opened',
}

function money(n: number): string {
  return `$${n.toLocaleString()}`
}

function GroupHeader({ group }: { group: ProposalLedgerGroup }) {
  return (
    <div
      className={[
        'flex items-center justify-between border-y px-5 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.1em]',
        group.tone === 'urgent'
          ? 'border-destructive/25 bg-destructive/5 text-destructive'
          : 'border-border bg-muted text-muted-foreground',
      ].join(' ')}
    >
      <span>
        {group.label} · {group.rows.length}
      </span>
      <span className="tabular-nums">{money(group.value)}</span>
    </div>
  )
}

function Row({ row, orgSlug }: { row: ProposalLedgerRow; orgSlug: string }) {
  const amount = row.min === row.max ? money(row.min) : `${money(row.min)}–${money(row.max)}`
  // A signalled row is always `sent`, so the signal replaces the status pill
  // rather than sitting beside a redundant "Sent".
  const pill = row.signal ? (
    <StatusPill tone={row.signal === 'expired' ? 'alert' : 'pending'}>
      {SIGNAL_LABEL[row.signal]}
    </StatusPill>
  ) : (
    <StatusPill tone={PROPOSAL_STATUS_TONE[row.status]}>
      {PROPOSAL_STATUS_LABELS[row.status]}
    </StatusPill>
  )

  return (
    <Link
      href={`/${orgSlug}/leads/${row.leadId}/proposals/${row.id}`}
      className={[
        'flex items-center gap-3 border-b border-border/60 px-5 py-2.5 hover:bg-muted/50',
        row.signal === 'expired' ? 'border-l-2 border-l-destructive' : '',
      ].join(' ')}
    >
      <Avatar name={row.clientName || 'Unknown'} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{row.title}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.clientName || '—'}</p>
      </div>
      {pill}
      <span className="shrink-0 text-sm font-semibold tabular-nums">{amount}</span>
    </Link>
  )
}

export function ProposalsLedger({ ledger, orgSlug }: { ledger: ProposalLedger; orgSlug: string }) {
  if (ledger.total === 0) {
    return (
      <EmptyState
        icon={<FileText />}
        title="No proposals yet"
        description="Proposals start from a job in your pipeline."
        action={
          <Button variant="outline" size="sm" render={<Link href={`/${orgSlug}/leads`} />}>
            View pipeline
          </Button>
        }
      />
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {ledger.groups.map((group) => (
        <div key={group.key}>
          <GroupHeader group={group} />
          {group.rows.map((row) => (
            <Row key={row.id} row={row} orgSlug={orgSlug} />
          ))}
        </div>
      ))}
    </div>
  )
}
