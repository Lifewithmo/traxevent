export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { listAllInvoices, getInvoiceNumbering } from '@/actions/invoices'
import { listLeads } from '@/actions/leads'
import { InvoiceNumberingSettings } from '@/components/admin/InvoiceNumberingSettings'
import { InvoicesKpiBand } from '@/components/admin/invoices/InvoicesKpiBand'
import { InvoicesLedger } from '@/components/admin/invoices/InvoicesLedger'
import { buildInvoiceLedger, type LedgerInvoice } from '@/lib/invoices-ledger'

// The exact messages `assertOrgMember`/`assertOrgAdmin` throw (lib/auth/assert.ts).
// Anything else out of `getInvoiceNumbering` is a Firestore/read failure, not a
// permission answer.
const AUTHORIZATION_DENIALS = new Set(['Forbidden', 'Unauthorized'])

function isAuthorizationDenial(err: unknown): boolean {
  return err instanceof Error && AUTHORIZATION_DENIALS.has(err.message)
}

export default async function InvoicesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const orgId = orgSnap.docs[0].id
  const [invoices, leads, numbering] = await Promise.all([
    listAllInvoices(orgId),
    listLeads(orgId),
    // `getInvoiceNumbering` calls assertOrgAdmin, but reading this ledger only
    // requires org MEMBERSHIP (`listAllInvoices` asserts that). Awaiting it
    // unguarded threw the entire /invoices route for every non-admin member.
    // Numbering is an admin-only setting, so a DENIAL is an expected, silent
    // degrade — just don't render the control. Anything else (the counter doc
    // read failing, a malformed doc) is a real fault: still degrade rather than
    // throw the whole route, but leave a trail, or an owner sees the control
    // quietly vanish with nothing to explain it.
    getInvoiceNumbering(orgId).catch((err: unknown) => {
      if (!isAuthorizationDenial(err)) {
        console.error(`[invoices] numbering unavailable for org ${orgId}:`, err)
      }
      return null
    }),
  ])
  // ONE clock for the whole render. Two `new Date()` calls can straddle UTC
  // midnight, and the KPI band's Overdue tile would then disagree with the
  // ledger's Overdue group by an invoice within a single page load.
  const now = new Date()
  const nameByLead = new Map<string, string>(leads.map((l) => [l.id, l.name]))
  const rows: LedgerInvoice[] = invoices.map((inv) => ({
    ...inv,
    clientName: nameByLead.get(inv.lead_id) ?? '',
  }))
  const groups = buildInvoiceLedger(rows, now)

  return (
    // Full-bleed: the old `max-w-5xl` had no `mx-auto`, stranding ~650px of dead
    // gutter on a wide screen. A ledger wants the width.
    <div className="w-full">
      <div className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-baseline gap-2">
          <h1 className="text-base font-semibold">Invoices</h1>
          <span className="text-xs text-muted-foreground">{rows.length}</span>
        </div>
        {numbering ? <InvoiceNumberingSettings orgId={orgId} initial={numbering} /> : null}
      </div>

      <div className="px-4 py-3">
        <InvoicesKpiBand invoices={invoices} now={now} />
      </div>

      <InvoicesLedger orgSlug={orgSlug} groups={groups} />
    </div>
  )
}
