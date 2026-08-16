'use client'

import { Mail, Phone, Plus, FileText, MoreHorizontal } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { StatusPill, type pillVariants } from '@/components/ui/status-pill'
import { Button } from '@/components/ui/button'
import { Menu, MenuTrigger, MenuContent, MenuItem } from '@/components/ui/menu'
import type { Customer } from '@/lib/types'
import type { ClientGroup } from '@/lib/crm/client-list'
import type { CustomerAR } from '@/lib/crm/ar-rollup'
import type { VariantProps } from 'class-variance-authority'

type Tone = NonNullable<VariantProps<typeof pillVariants>['tone']>

interface ClientCockpitHeaderProps {
  orgSlug: string
  customer: Customer
  group: ClientGroup
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

function money(n: number): string {
  return `$${n.toLocaleString()}`
}

export function ClientCockpitHeader({ orgSlug, customer, group, ar, onNewJob, onNewProposal }: ClientCockpitHeaderProps) {
  const pastDue = ar.overdueAmount > 0
  const pill = pastDue ? { tone: 'alert' as Tone, label: `Past due ${money(ar.overdueAmount)}` } : GROUP_PILL[group]
  const subtitle = [customer.company, customer.email, customer.phone].filter(Boolean).join(' · ')

  async function copyLink() {
    if (typeof window === 'undefined') return
    await navigator.clipboard.writeText(`${window.location.origin}/${orgSlug}/clients/${customer.id}`)
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

        <div className="flex shrink-0 items-center gap-2">
          {customer.email && (
            <Button variant="outline" size="sm" render={<a href={`mailto:${customer.email}`} />}>
              <Mail /> Email
            </Button>
          )}
          {customer.phone && (
            <Button variant="outline" size="sm" render={<a href={`tel:${customer.phone}`} />}>
              <Phone /> Call
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onNewJob}>
            <Plus /> New job
          </Button>
          <Button variant="outline" size="sm" onClick={onNewProposal}>
            <FileText /> New proposal
          </Button>
          <Menu>
            <MenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="More actions" />}>
              <MoreHorizontal />
            </MenuTrigger>
            <MenuContent>
              <MenuItem onClick={copyLink}>Copy client link</MenuItem>
            </MenuContent>
          </Menu>
        </div>
      </div>
    </header>
  )
}
