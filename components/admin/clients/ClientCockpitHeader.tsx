'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, Phone, Plus, MoreHorizontal, ArrowRight, RefreshCw, Send, type LucideIcon } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { StatusPill, type pillVariants } from '@/components/ui/status-pill'
import { Button } from '@/components/ui/button'
import { Menu, MenuTrigger, MenuContent, MenuItem } from '@/components/ui/menu'
import { nextBestAction, type NextBestActionKind } from '@/lib/crm/next-best-action'
import { overdueInvoices } from '@/lib/crm/ar-rollup'
import { buildReminderMailto } from '@/lib/crm/reminder'
import { createProposalFromLastAccepted } from '@/actions/proposal-rebook'
import { logContactActivity } from '@/actions/activity'
import { todayYmd } from '@/lib/opportunity-detail'
import { OPEN_STAGES } from '@/lib/leads'
import type { Customer, Invoice, Lead, LeadStage } from '@/lib/types'
import type { ClientGroup, ClientRow } from '@/lib/crm/client-list'
import type { CustomerAR } from '@/lib/crm/ar-rollup'
import type { VariantProps } from 'class-variance-authority'

type Tone = NonNullable<VariantProps<typeof pillVariants>['tone']>

interface ClientCockpitHeaderProps {
  orgId: string
  orgSlug: string
  customer: Customer
  group: ClientGroup
  row: ClientRow
  opportunities: Lead[]
  invoices: Invoice[]
  ar: CustomerAR
  onNewJob: () => void
  onNewProposal: () => void
}

// Group -> pill, before the past-due override. Mirrors client-list.ts's
// GROUP_META groupings but in StatusPill's tone vocabulary; 'booked_now'
// covers both an open lead and a won job, so it reads as 'Active' rather
// than overclaiming 'Booked'.
const GROUP_PILL: Record<ClientGroup, { tone: Tone; label: string }> = {
  dormant_repeat: { tone: 'alert', label: 'Gone quiet' },
  booked_now: { tone: 'pending', label: 'Active' },
  never_booked: { tone: 'neutral', label: 'Prospect' },
}

// One icon per computed next move, so the primary CTA visually reads its kind.
const KIND_ICON: Record<NextBestActionKind, LucideIcon> = {
  reminder: Mail,
  followup: ArrowRight,
  rebook: RefreshCw,
  'send-proposal': Send,
  none: Plus,
}

function money(n: number): string {
  return `$${n.toLocaleString()}`
}

export function ClientCockpitHeader({
  orgId,
  orgSlug,
  customer,
  group,
  row,
  opportunities,
  invoices,
  ar,
  onNewJob,
  onNewProposal,
}: ClientCockpitHeaderProps) {
  const router = useRouter()
  const [rebooking, setRebooking] = useState(false)
  const [rebookError, setRebookError] = useState<string | null>(null)

  const pastDue = ar.overdueAmount > 0
  const pill = pastDue ? { tone: 'alert' as Tone, label: `Past due ${money(ar.overdueAmount)}` } : GROUP_PILL[group]
  const subtitle = [customer.company, customer.email, customer.phone].filter(Boolean).join(' · ')

  const now = new Date()
  const today = todayYmd(now)

  // Wiring targets for the action kinds that link/route.
  const openLead = opportunities.find((l) => (OPEN_STAGES as LeadStage[]).includes(l.stage))
  const overdue = overdueInvoices(invoices, now)
  const reminderHref = customer.email && overdue[0] ? buildReminderMailto(customer.email, overdue[0]) : undefined

  // The computed, ranked next move. Reads real AR (via `ar`), the client's
  // re-book cadence (via `row`), and open opportunities — never quoted pipeline.
  const rawNba = nextBestAction({ row, opportunities, ar, todayYmd: today })
  // A 'reminder' we cannot actually send (no email on file, or no matching
  // invoice to reference) would render a dead, disabled primary. Fall back to the
  // next actionable move instead — the "Past due" pill still surfaces the debt —
  // and explain the blocker on the reason line rather than dead-ending the CTA.
  const reminderBlocked = rawNba.kind === 'reminder' && !reminderHref
  const nba = reminderBlocked
    ? nextBestAction({ row, opportunities, ar: { ...ar, overdueAmount: 0 }, todayYmd: today })
    : rawNba
  const Icon = KIND_ICON[nba.kind]
  const reasonLine =
    reminderBlocked && !customer.email ? 'Add an email to send a reminder.' : nba.reason

  // A failed re-book alert must not linger and hide the reason line once the
  // recommended move changes (e.g. the client got re-booked, or AR was paid).
  useEffect(() => {
    setRebookError(null)
  }, [nba.kind, nba.label])

  async function copyLink() {
    if (typeof window === 'undefined') return
    setRebookError(null)
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/${orgSlug}/clients/${customer.id}`)
    } catch (err) {
      // A clipboard rejection (permissions, insecure context) must not surface as
      // an unhandled promise rejection from this fire-and-forget onClick.
      console.error('Failed to copy client link', err)
    }
  }

  // Re-book: seed a fresh proposal from the last accepted one and jump into the
  // builder. When there is nothing accepted to copy, fall back to a new proposal.
  async function handleRebook() {
    setRebooking(true)
    setRebookError(null)
    try {
      const res = await createProposalFromLastAccepted(orgId, customer.id)
      if (res) router.push(`/${orgSlug}/leads/${res.leadId}/proposals/${res.proposalId}`)
      else onNewProposal()
    } catch (err) {
      console.error('Re-book failed', err)
      setRebookError("Couldn't start a re-book. Please try again.")
    } finally {
      setRebooking(false)
    }
  }

  // Fire-and-forget contact log; the native mailto:/tel: href still fires.
  function logContact(kind: 'emailed' | 'called') {
    setRebookError(null)
    logContactActivity(orgId, { parent_type: 'customer', parent_id: customer.id, kind }).catch((err) => {
      console.error('Failed to log contact activity', err)
    })
  }

  // ONE filled primary button whose behavior is driven by nba.kind. 'none' is
  // the quiet, healthy default (outline), not a loud call to action.
  const primaryVariant = nba.kind === 'none' ? 'outline' : 'default'
  function primaryCta() {
    switch (nba.kind) {
      case 'reminder':
        return reminderHref ? (
          <Button size="sm" variant={primaryVariant} render={<a href={reminderHref} />}>
            <Icon /> {nba.label}
          </Button>
        ) : (
          <Button size="sm" variant={primaryVariant} disabled>
            <Icon /> {nba.label}
          </Button>
        )
      case 'followup':
        return openLead ? (
          <Button size="sm" variant={primaryVariant} render={<a href={`/${orgSlug}/leads/${openLead.id}`} />}>
            <Icon /> {nba.label}
          </Button>
        ) : (
          <Button size="sm" variant={primaryVariant} disabled>
            <Icon /> {nba.label}
          </Button>
        )
      case 'rebook':
        return (
          <Button size="sm" variant={primaryVariant} onClick={handleRebook} disabled={rebooking}>
            <Icon /> {nba.label}
          </Button>
        )
      case 'send-proposal':
        return (
          <Button size="sm" variant={primaryVariant} onClick={onNewProposal}>
            <Icon /> {nba.label}
          </Button>
        )
      case 'none':
      default:
        return (
          <Button size="sm" variant={primaryVariant} onClick={onNewJob}>
            <Icon /> {nba.label}
          </Button>
        )
    }
  }

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/95 px-1 py-3 backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={customer.name} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold">{customer.name}</h1>
              <StatusPill tone={pill.tone}>{pill.label}</StatusPill>
            </div>
            {subtitle && <p className="truncate text-sm text-muted-foreground">{subtitle}</p>}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            {primaryCta()}
            {customer.email && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => logContact('emailed')}
                render={<a href={`mailto:${customer.email}`} />}
              >
                <Mail /> Email
              </Button>
            )}
            {customer.phone && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => logContact('called')}
                render={<a href={`tel:${customer.phone}`} />}
              >
                <Phone /> Call
              </Button>
            )}
            <Menu>
              <MenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="More actions" />}>
                <MoreHorizontal />
              </MenuTrigger>
              <MenuContent>
                <MenuItem onClick={onNewJob}>New job</MenuItem>
                <MenuItem onClick={onNewProposal}>New proposal</MenuItem>
                <MenuItem onClick={copyLink}>Copy client link</MenuItem>
              </MenuContent>
            </Menu>
          </div>
          {rebookError ? (
            <p role="alert" className="max-w-xs text-right text-xs text-destructive">
              {rebookError}
            </p>
          ) : (
            reasonLine && <p className="max-w-xs text-right text-xs text-muted-foreground">{reasonLine}</p>
          )}
        </div>
      </div>
    </header>
  )
}
