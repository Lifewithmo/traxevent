export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { getPublicProposal } from '@/actions/proposals-public'
import { PrintButton } from '@/components/admin/ops/PrintButton'
import {
  ProposalPackageOption,
  ProposalIncludedItems,
  ProposalOptionalItems,
  ProposalTotals,
  packageOptionDisplay,
} from '@/components/proposals/ProposalPricing'
import { proposalDisplayRange } from '@/lib/proposals'
import { ProposalTheme } from '@/components/proposals/ProposalTheme'
import { ProposalComposition } from '@/components/proposals/ProposalComposition'
import type { OrgBranding } from '@/lib/types'

export default async function ProposalPrintPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  // Same lookup as the main public page: the token is the authorization,
  // and drafts return null.
  const proposal = await getPublicProposal(token)
  if (!proposal) notFound()

  // STATUS GATE — mirrors ProposalResponseClient exactly, because this route
  // renders the same offer from the same projection and must refuse for the
  // same reasons. getPublicProposal only nulls out drafts; every other refusal
  // lived in the client component, which this server route does not run.
  //
  // `voided` short-circuits to the same sentence the main page shows, rather
  // than notFound(): the customer holds a link that worked yesterday, and a
  // 404 reads as "broken", not "revoked". Critically, nothing below renders —
  // no document, no pricing, no notes — so a voided proposal can no longer be
  // printed and kept as though it were a live offer.
  if (proposal.status === 'voided') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-6 text-center">
        <p className="text-lg font-medium text-gray-500">This proposal is no longer available.</p>
      </main>
    )
  }

  // `rejected` and signed/accepted still render — the main page renders them
  // too, and a customer is entitled to a copy of what they declined or signed.
  // But a printed sheet outlives the screen it came from, so each state is
  // stated on the page: an unmarked printout of a signed proposal is
  // indistinguishable from a live offer awaiting a decision.
  const declined = proposal.status === 'rejected'
  const signed = proposal.signed

  // A locked selection prices itself; anything unselected is a SPAN, not a
  // guess. proposalDisplayRange encodes exactly that rule and is already what
  // the admin list views use.
  const total = proposalDisplayRange(proposal)
  const selectedPackageId = proposal.selection?.package_id
  const selectedOptionalIds = proposal.selection?.optional_item_ids ?? []

  const packages = proposal.packages ?? []
  // Same base-scope rule as ProposalResponseClient: package member items live
  // in their tier card, not in the always-included list. Not a composition
  // archetype of its own — it prints alongside the investment/pricing summary.
  const memberIds = new Set((proposal.packages ?? []).flatMap((p) => p.item_ids ?? []))
  const requiredItems = proposal.line_items.filter(
    (i) => i.optional !== true && !memberIds.has(i.id ?? ''),
  )
  const optionalItems = proposal.line_items.filter((i) => i.optional === true && i.id)

  const branding = (proposal as { branding?: OrgBranding }).branding

  return (
    <ProposalTheme branding={branding}>
    {/* Print restyle (spec §6): restrained ink — no background fills; the
        accent lands on headings only (ProposalBlockView) and page-break
        rules keep blocks and package cards whole. */}
    <main className="mx-auto max-w-3xl px-8 py-10 text-gray-900">
      <div className="mb-6 flex items-start justify-between">
        <div>
          {branding?.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logo_url} alt={`${branding.display_name ?? 'Company'} logo`} className="mb-3 h-10 w-auto" />
          )}
          <h1 className="text-2xl font-bold" style={{ color: 'var(--proposal-accent, #111827)' }}>
            {proposal.title || 'Proposal'}
          </h1>
          {branding?.display_name && (
            <p className="mt-1 text-sm text-gray-500">{branding.display_name}</p>
          )}
        </div>
        <PrintButton />
      </div>

      {signed && (
        <div className="mb-6 rounded-md border border-green-200 bg-green-50 p-4 text-sm">
          <p className="font-medium text-green-800">Accepted</p>
          <p className="text-green-700">
            Signed by {signed.signer_name} on {new Date(signed.signed_at).toLocaleString()}.
          </p>
          {proposal.payment_status === 'deposit_paid' && (
            <p className="text-green-700">Deposit paid.</p>
          )}
        </div>
      )}

      {declined && (
        <div className="mb-6 rounded-md border border-gray-300 bg-gray-50 p-4 text-sm font-medium text-gray-700">
          This proposal was declined.
        </div>
      )}

      <ProposalComposition
        proposal={proposal}
        branding={branding}
        renderDerived={(type) => {
          switch (type) {
            case 'tiers':
              return packages.length > 0 ? (
                <section className="mt-8">
                  <h2 className="mb-3 text-lg font-bold">Options</h2>
                  <div className="grid grid-cols-1 gap-4 break-inside-avoid sm:grid-cols-3">
                    {packages.map((pkg) => (
                      <ProposalPackageOption
                        key={pkg.id}
                        pkg={pkg}
                        selected={pkg.id === selectedPackageId}
                        {...packageOptionDisplay(pkg, packages, proposal.line_items)}
                      />
                    ))}
                  </div>
                </section>
              ) : null
            case 'add_ons':
              return optionalItems.length > 0 ? (
                <section className="mt-8">
                  <h2 className="mb-2 text-lg font-bold">Optional add-ons</h2>
                  <ProposalOptionalItems items={optionalItems} selectedIds={selectedOptionalIds} />
                </section>
              ) : null
            case 'investment':
              return (
                <>
                  {requiredItems.length > 0 && (
                    <section className="mt-8">
                      <h2 className="mb-2 text-lg font-bold">What&apos;s included</h2>
                      <ProposalIncludedItems items={requiredItems} />
                    </section>
                  )}
                  <section className="mt-8 border-t pt-4">
                    <ProposalTotals
                      total={total}
                      deposit={signed ? undefined : proposal.deposit}
                      depositLabel={
                        proposal.deposit_gate === 'before_accept'
                          ? 'Deposit due to accept'
                          : 'Deposit due on acceptance'
                      }
                      depositPaid={Boolean(signed) && proposal.payment_status === 'deposit_paid'}
                      expiresAt={signed || declined ? undefined : proposal.expires_at}
                    />
                  </section>
                  {proposal.deposit_terms && (
                    <section className="mt-8">
                      <h2 className="mb-2 text-lg font-bold">Deposit terms</h2>
                      <p className="whitespace-pre-wrap text-sm text-gray-700">{proposal.deposit_terms}</p>
                    </section>
                  )}
                </>
              )
            case 'accept':
              // No sign box on paper — the signed/declined banners above
              // already state the status.
              return null
            case 'terms':
              return proposal.terms ? (
                <section className="mt-8">
                  <h2 className="mb-2 text-lg font-bold">Terms</h2>
                  <p className="whitespace-pre-wrap text-sm text-gray-700">{proposal.terms}</p>
                </section>
              ) : null
            default:
              return null
          }
        }}
      />
    </main>
    </ProposalTheme>
  )
}
