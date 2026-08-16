'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { Button, buttonVariants } from '@/components/ui/button'
import { StatusPill } from '@/components/ui/status-pill'
import { Phone, Mail, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Customer, Lead } from '@/lib/types'

/**
 * Kit button SKIN on a real anchor, rather than `<Button render={<a/>}>`.
 *
 * Base UI's Button owns button semantics: left native it warns and stamps
 * `type="button"` onto the anchor, and with `nativeButton={false}` it stamps
 * `role="button"`, which tells a screen reader that a `mailto:` is a button and
 * drops the label children on the floor. A mailto/tel IS a link. Consuming the
 * kit's exported `buttonVariants` keeps the styling identical and the semantics
 * honest.
 */
const contactActionClass = cn(buttonVariants({ variant: 'outline', size: 'sm' }))

interface ContactCardProps {
  orgSlug: string
  customer: Customer | null
  lead: Lead
  /**
   * Vestigial. ContactCard renders one layout; the prop survives so callers
   * (and P5's spine) keep compiling while the two tasks land in either order.
   */
  variant?: 'strip'
  /**
   * Still accepted, deliberately NOT rendered — the returning-client count is a
   * figure on OpportunityKpiBand now. It used to be concatenated into a
   * `truncate`d subtitle where a long company name could clip it away entirely.
   */
  pastBookings?: number
  portalAction?: React.ReactNode
}

/**
 * Who this deal is with, and the two ways to reach them.
 *
 * Identity only: no figures (they're on the KPI band) and no editable facts
 * (they're in FactsGrid). Everything past name/company/contact is behind the
 * More disclosure, because on a spine this strip is the thing the operator
 * reads past, not the thing they stop on.
 */
// `variant` and `pastBookings` are accepted (see the interface) and deliberately
// not destructured — nothing in here reads them.
export function ContactCard({ orgSlug, customer, lead, portalAction }: ContactCardProps) {
  const [expanded, setExpanded] = useState(false)

  // `Lead.name` is required, so `name` is always a string — Avatar dereferences
  // it unguarded and must never be handed undefined.
  const name = customer?.name ?? lead.name
  const company = customer?.company ?? lead.organization
  const email = customer?.email ?? lead.email
  const phone = customer?.phone ?? lead.phone
  const tags = customer?.tags ?? lead.tags ?? []
  const notes = customer?.notes
  const contactLine = [email, phone].filter(Boolean).join(' · ')

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Avatar name={name} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{name}</p>
            {contactLine && <p className="truncate text-sm text-muted-foreground">{contactLine}</p>}
            {company && <p className="truncate text-sm text-muted-foreground">{company}</p>}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {email && (
              <a href={`mailto:${email}`} aria-label="Email" className={contactActionClass}>
                <Mail /> Email
              </a>
            )}
            {phone && (
              <a href={`tel:${phone}`} aria-label="Call" className={contactActionClass}>
                <Phone /> Call
              </a>
            )}
            {portalAction}
            <Button
              variant="ghost"
              size="sm"
              aria-label={expanded ? 'Collapse contact' : 'Expand contact'}
              aria-expanded={expanded}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? 'Less' : 'More'}
              <ChevronDown className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </Button>
            {customer && (
              <Link href={`/${orgSlug}/clients/${customer.id}`} className="text-xs text-primary hover:underline">
                View customer
              </Link>
            )}
          </div>
        </div>
        {expanded && (
          <dl className="space-y-1.5 border-t border-border pt-3 text-sm">
            {email && <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Email</dt><dd className="truncate">{email}</dd></div>}
            {phone && <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Phone</dt><dd>{phone}</dd></div>}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {tags.map((t) => <StatusPill key={t} tone="neutral">{t}</StatusPill>)}
              </div>
            )}
            {notes && <p className="pt-1 text-muted-foreground">{notes}</p>}
          </dl>
        )}
      </CardContent>
    </Card>
  )
}
