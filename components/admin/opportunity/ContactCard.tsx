'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Phone, Mail, ChevronDown } from 'lucide-react'
import { initials } from '@/lib/opportunity-detail'
import type { Customer, Lead } from '@/lib/types'

interface ContactCardProps {
  orgSlug: string
  customer: Customer | null
  lead: Lead
  variant?: 'strip'
  pastBookings?: number
  portalAction?: React.ReactNode
}

export function ContactCard({ orgSlug, customer, lead, variant, pastBookings = 0, portalAction }: ContactCardProps) {
  const [expanded, setExpanded] = useState(false)

  const name = customer?.name ?? lead.name
  const company = customer?.company ?? lead.organization
  const email = customer?.email ?? lead.email
  const phone = customer?.phone ?? lead.phone
  const tags = customer?.tags ?? lead.tags ?? []
  const notes = customer?.notes

  if (variant === 'strip') {
    const contactLine = [email, phone].filter(Boolean).join(' · ')
    const returning = pastBookings > 0
      ? `returning client (${pastBookings} past event${pastBookings === 1 ? '' : 's'})`
      : null
    const companyLine = [company, returning].filter(Boolean).join(' · ')
    return (
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div
              aria-hidden
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold"
            >
              {initials(name)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{name}</p>
              {contactLine && <p className="truncate text-sm text-muted-foreground">{contactLine}</p>}
              {companyLine && <p className="truncate text-sm text-muted-foreground">{companyLine}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {email && (
                <a
                  href={`mailto:${email}`}
                  aria-label="Email"
                  className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-muted"
                >
                  <Mail className="h-4 w-4" /> Email
                </a>
              )}
              {phone && (
                <a
                  href={`tel:${phone}`}
                  aria-label="Call"
                  className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-muted"
                >
                  <Phone className="h-4 w-4" /> Call
                </a>
              )}
              {portalAction}
              <button
                type="button"
                aria-label={expanded ? 'Collapse contact' : 'Expand contact'}
                aria-expanded={expanded}
                onClick={() => setExpanded((v) => !v)}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                {expanded ? 'Less' : 'More'}
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
              </button>
              {customer && (
                <Link href={`/${orgSlug}/clients/${customer.id}`} className="text-xs underline text-muted-foreground hover:text-foreground">
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
                  {tags.map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}
                </div>
              )}
              {notes && <p className="pt-1 text-muted-foreground">{notes}</p>}
            </dl>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div
            aria-hidden
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold"
          >
            {initials(name)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{name}</p>
            {company && <p className="truncate text-sm text-muted-foreground">{company}</p>}
          </div>
        </div>

        <div className="flex gap-2">
          {email && (
            <a
              href={`mailto:${email}`}
              aria-label="Email"
              className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border border-border text-sm hover:bg-muted"
            >
              <Mail className="h-4 w-4" /> Email
            </a>
          )}
          {phone && (
            <a
              href={`tel:${phone}`}
              aria-label="Call"
              className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border border-border text-sm hover:bg-muted"
            >
              <Phone className="h-4 w-4" /> Call
            </a>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label={expanded ? 'Collapse contact' : 'Expand contact'}
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            className="flex flex-1 items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {expanded ? 'Less' : 'More'}
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
          {customer && (
            <Link href={`/${orgSlug}/clients/${customer.id}`} className="text-xs underline text-muted-foreground hover:text-foreground">
              View customer
            </Link>
          )}
        </div>

        {expanded && (
          <dl className="space-y-1.5 border-t border-border pt-3 text-sm">
            {email && <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Email</dt><dd className="truncate">{email}</dd></div>}
            {phone && <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Phone</dt><dd>{phone}</dd></div>}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {tags.map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}
              </div>
            )}
            {notes && <p className="pt-1 text-muted-foreground">{notes}</p>}
          </dl>
        )}
      </CardContent>
    </Card>
  )
}
