'use client'

import Link from 'next/link'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { RelatedRecordCard } from '@/components/ui/related-record-card'
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { StatusPill } from '@/components/ui/status-pill'
import { formatMoney } from '@/lib/utils'
import { VENDOR_STATUS_LABELS, VENDOR_STATUS_TONE, type VendorLedgerRow } from '@/lib/vendors'

interface VendorDetailSheetProps {
  row: VendorLedgerRow | null
  orgSlug: string
  onClose: () => void
}

/**
 * R6 — an unset field is an affordance, not an em-dash. This sheet is read-only
 * (vendor editing lives on the lead's vendor panel), so "add" means "go where
 * you can add it".
 */
function AddField({ label, href }: { label: string; href: string }) {
  return (
    <Link href={href} className="text-xs font-medium text-muted-foreground hover:text-[var(--link)] hover:underline">
      + Add {label}
    </Link>
  )
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-border py-2 first:border-t-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right text-[13px]">{children}</span>
    </div>
  )
}

export function VendorDetailSheet({ row, orgSlug, onClose }: VendorDetailSheetProps) {
  // Base UI's Dialog unmounts its popup when closed, so a null row simply
  // renders a closed Sheet rather than needing a separate branch.
  const leadHref = row ? `/${orgSlug}/leads/${row.lead_id}` : `/${orgSlug}/leads`
  const hasContact = Boolean(row && (row.contact_name || row.email || row.phone))

  return (
    <Sheet
      open={row !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <SheetContent>
        {row && (
          <>
            <SheetHeader>
              <div className="flex items-center gap-2.5">
                <Avatar name={row.name} size="sm" />
                <SheetTitle>{row.name}</SheetTitle>
                <StatusPill tone={VENDOR_STATUS_TONE[row.status]}>{VENDOR_STATUS_LABELS[row.status]}</StatusPill>
              </div>
              {row.service ? <SheetDescription>{row.service}</SheetDescription> : null}
            </SheetHeader>

            <SheetBody className="flex flex-col gap-5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[.06em] text-muted-foreground">Cost</p>
                {row.cost == null ? (
                  <div className="mt-1">
                    <AddField label="cost" href={leadHref} />
                  </div>
                ) : (
                  <p className="text-[26px] font-semibold leading-tight tracking-[-.02em] tabular-nums text-[var(--money-green)]">
                    {formatMoney(row.cost)}
                  </p>
                )}
              </div>

              <section>
                <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-[.06em] text-muted-foreground">
                  Contact
                </h3>
                {hasContact ? (
                  <div>
                    <FieldRow label="Name">
                      {row.contact_name ? row.contact_name : <AddField label="contact name" href={leadHref} />}
                    </FieldRow>
                    <FieldRow label="Email">
                      {row.email ? (
                        <a href={`mailto:${row.email}`} className="text-[var(--link)] hover:underline">
                          {row.email}
                        </a>
                      ) : (
                        <AddField label="email" href={leadHref} />
                      )}
                    </FieldRow>
                    <FieldRow label="Phone">
                      {row.phone ? (
                        <a href={`tel:${row.phone}`} className="text-[var(--link)] hover:underline">
                          {row.phone}
                        </a>
                      ) : (
                        <AddField label="phone" href={leadHref} />
                      )}
                    </FieldRow>
                  </div>
                ) : (
                  <EmptyState
                    title="No contact details yet."
                    description="Add a name, email, or phone on the client's vendor panel."
                    action={
                      <Button variant="outline" size="sm" render={<Link href={leadHref} />}>
                        Add contact
                      </Button>
                    }
                  />
                )}
              </section>

              <section>
                <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-[.06em] text-muted-foreground">
                  Notes
                </h3>
                {row.notes ? (
                  <p className="whitespace-pre-wrap text-[13px] text-foreground">{row.notes}</p>
                ) : (
                  <AddField label="notes" href={leadHref} />
                )}
              </section>

              <RelatedRecordCard
                title="Client"
                count={1}
                rows={[
                  {
                    id: row.lead_id,
                    title: row.clientName || 'Unassigned',
                    subtitle: row.clientName ? undefined : 'This vendor’s lead has no name yet.',
                    href: leadHref,
                  },
                ]}
                emptyTitle="Not linked to a client."
                emptyCtaLabel="Find a client"
              />
            </SheetBody>

            <SheetFooter>
              <Button variant="link" render={<Link href={leadHref} />}>
                Open client →
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
