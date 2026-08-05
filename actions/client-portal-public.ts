'use server'

import { adminDb } from '@/lib/firebase-admin'
import { buildLeadTimeline, type LeadTimelineStep } from '@/lib/client-portal'
import { proposalTotal } from '@/lib/proposals'
import { invoiceAmountDue, invoiceBalance } from '@/lib/invoices'
import { normalizeInvoice } from '@/lib/invoice-normalize'
import type { Lead, LeadStage, Proposal, ProposalStatus, InvoiceLifecycle, Contract, ContractStatus } from '@/lib/types'

export interface ClientPortalProposal {
  title?: string
  status: ProposalStatus
  total: number
  token: string
}

export interface ClientPortalInvoice {
  title?: string
  number?: string
  lifecycle: InvoiceLifecycle
  total: number
  balance: number
  token: string
}

export interface ClientPortalContract {
  title?: string
  status: ContractStatus
  token: string
}

// Public-safe: only client-facing fields. Omits internal lead fields
// (notes, estimated_value, email, phone, id, org_id, portal_token).
export interface ClientPortal {
  client_name: string
  organization?: string
  event_type?: string
  event_date?: string
  stage: LeadStage
  timeline: LeadTimelineStep[]
  proposals: ClientPortalProposal[]
  invoices: ClientPortalInvoice[]
  contracts: ClientPortalContract[]
}

// PUBLIC (portal_token = authorization). Aggregates the lead's non-draft proposals + invoices.
export async function getClientPortal(token: string): Promise<ClientPortal | null> {
  const snap = await adminDb.collectionGroup('leads').where('portal_token', '==', token).limit(1).get()
  if (snap.empty) return null
  const leadDoc = snap.docs[0]
  const lead = leadDoc.data() as Lead
  const orgRef = leadDoc.ref.parent.parent
  if (!orgRef) return null
  const leadId = leadDoc.id

  const [propSnap, invSnap, contractSnap] = await Promise.all([
    orgRef.collection('proposals').where('lead_id', '==', leadId).get(),
    orgRef.collection('invoices').where('lead_id', '==', leadId).get(),
    orgRef.collection('contracts').where('lead_id', '==', leadId).get(),
  ])

  const proposals: ClientPortalProposal[] = propSnap.docs
    .map((d) => d.data() as Proposal)
    .filter((p) => p.status !== 'draft')
    .map((p) => ({
      status: p.status,
      total: proposalTotal(p.line_items),
      token: p.token,
      ...(p.title !== undefined ? { title: p.title } : {}),
    }))

  const invoices: ClientPortalInvoice[] = invSnap.docs
    .map((d) => normalizeInvoice(d.data()))
    // Show only finalized invoices to clients — hide drafts (never issued) and the
    // internal 'approved' state (queued to be issued but not yet client-facing).
    .filter((i) => i.lifecycle !== 'draft' && i.lifecycle !== 'approved')
    .map((i) => ({
      lifecycle: i.lifecycle,
      total: invoiceAmountDue(i),
      balance: invoiceBalance(i),
      token: i.token,
      ...(i.title !== undefined ? { title: i.title } : {}),
      ...(i.number !== undefined ? { number: i.number } : {}),
    }))

  const contracts: ClientPortalContract[] = contractSnap.docs
    .map((d) => d.data() as Contract)
    .filter((c) => c.status !== 'draft')
    .map((c) => ({
      status: c.status,
      token: c.token,
      ...(c.title !== undefined ? { title: c.title } : {}),
    }))

  const portal: ClientPortal = {
    client_name: lead.name,
    stage: lead.stage,
    timeline: buildLeadTimeline(lead.stage),
    proposals,
    invoices,
    contracts,
  }
  if (lead.organization !== undefined) portal.organization = lead.organization
  if (lead.event_type !== undefined) portal.event_type = lead.event_type
  if (lead.event_date !== undefined) portal.event_date = lead.event_date
  return portal
}
