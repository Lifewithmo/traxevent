'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { StatusPill } from '@/components/ui/status-pill'
import { ChevronDown } from 'lucide-react'
import type { Customer, Lead } from '@/lib/types'

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
 * Who this deal is with.
 *
 * Identity ONLY: no figures (they're on the KPI band), no editable facts
 * (they're in FactsGrid) and — since P5 built the sticky header — no Email/Call
 * buttons either. The header renders Avatar + name + Email + Call and is sticky,
 * so its pair is on screen at every scroll position; a second pair here put two
 * identically-named "Email" links and two "Call" links in the links rotor at
 * once. OpportunityActionsMenu.tsx:46-48 already states the intended split
 * ("Email/Call stay outside as header buttons") — this card is the identity, the
 * portal link and the disclosure.
 *
 * The disclosure carries ONLY what is not already on the card face: tags and
 * notes. It used to repeat the email and phone the contact line above it
 * prints, so expanding "More" revealed nothing new — and when there were no
 * tags or notes it revealed an empty list, which is why the toggle is now gated
 * on there being something to disclose.
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
  const hasMore = tags.length > 0 || Boolean(notes)

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
            {portalAction}
            {hasMore && (
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
            )}
            {customer && (
              <Link href={`/${orgSlug}/clients/${customer.id}`} className="text-xs text-primary hover:underline">
                View customer
              </Link>
            )}
          </div>
        </div>
        {/* A plain <div>, not the <dl> this used to be: with the Email/Phone
            rows gone there are no dt/dd pairs left, and a definition list whose
            only children are a pill row and a paragraph is invalid markup that
            a screen reader announces as an empty list. */}
        {hasMore && expanded && (
          <div className="space-y-1.5 border-t border-border pt-3 text-sm">
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {tags.map((t) => <StatusPill key={t} tone="neutral">{t}</StatusPill>)}
              </div>
            )}
            {notes && <p className="pt-1 text-muted-foreground">{notes}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
