'use client'

import { useState, useEffect } from 'react'
import type { PublicProposal } from '@/actions/proposals-public'
import { respondToProposal, signProposal, recordProposalView, getPublicProposal } from '@/actions/proposals-public'
import { computeSelectedTotal, depositAmount } from '@/lib/proposals'
import type { PaymentStatus } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
// Shared with the print route so the two renderings of the same offer cannot
// drift apart again — see components/proposals/ProposalPricing.tsx.
import {
  ProposalPackageOption,
  ProposalIncludedItems,
  ProposalOptionalItems,
  ProposalTotals,
  packageOptionDisplay,
} from '@/components/proposals/ProposalPricing'
import { ProposalDepositPayment } from './ProposalDepositPayment'
import { ProposalTheme } from '@/components/proposals/ProposalTheme'
import { ProposalComposition } from '@/components/proposals/ProposalComposition'
import { AcceptedState } from '@/components/proposals/AcceptedState'
import type { OrgBranding } from '@/lib/types'

// Local, immediate confirmation shown right after a successful `signProposal`
// call in THIS session — the server doesn't echo signed_at back, so it's
// left undefined until a reload/refetch populates the authoritative
// `proposal.signed` projection.
type SignedInfo = { signer_name: string; signed_at?: string }

// Drives the sign form -> (optional) pre-accept payment -> finalizing steps
// for the `before_accept` deposit gate. Ignored once the proposal is signed.
type BeforeAcceptStep = 'idle' | 'payment' | 'finalizing'

export function ProposalResponseClient({
  token,
  proposal,
  branding,
}: {
  token: string
  proposal: PublicProposal
  branding?: OrgBranding
}) {
  const packaged = (proposal.packages?.length ?? 0) > 0
  const [packageId, setPackageId] = useState<string | undefined>(
    proposal.selection?.package_id ?? proposal.packages?.find((p) => p.recommended)?.id,
  )
  const [optionalIds, setOptionalIds] = useState<string[]>(
    proposal.selection?.optional_item_ids ?? [],
  )

  const [signerName, setSignerName] = useState(proposal.contact?.name ?? '')
  const [signerEmail, setSignerEmail] = useState(proposal.contact?.email ?? '')
  const [consent, setConsent] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [declinedLocally, setDeclinedLocally] = useState(false)
  const [signResult, setSignResult] = useState<{ deposit_due: number; payment_status: PaymentStatus } | null>(null)
  // The total actually submitted at sign/decline time — captured at click time so the
  // post-response "locked" display can never drift from what was recorded, even before a
  // reload populates proposal.selection.
  const [acceptedTotal, setAcceptedTotal] = useState<number | null>(null)
  const [depositPaidLocally, setDepositPaidLocally] = useState(false)

  const [beforeAcceptStep, setBeforeAcceptStep] = useState<BeforeAcceptStep>('idle')
  const [pollExhausted, setPollExhausted] = useState(false)
  // Refetched projection once the before_accept deposit succeeds and the
  // webhook has (or might have) finalized the proposal server-side.
  const [liveProposal, setLiveProposal] = useState<PublicProposal | null>(null)

  // Step 1: best-effort view logging, once per mount.
  useEffect(() => {
    recordProposalView(token)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  // Poll for the webhook-finalized state after a before_accept deposit payment succeeds.
  useEffect(() => {
    if (beforeAcceptStep !== 'finalizing') return
    let cancelled = false
    async function poll() {
      for (let attempt = 0; attempt < 3; attempt++) {
        const updated = await getPublicProposal(token)
        if (cancelled) return
        if (updated) {
          setLiveProposal(updated)
          if (updated.status !== 'sent') return
        }
        if (attempt < 2) await new Promise((r) => setTimeout(r, 1500))
      }
      if (!cancelled) setPollExhausted(true)
    }
    poll()
    return () => {
      cancelled = true
    }
  }, [beforeAcceptStep, token])

  // Required base scope = items in NO package and not optional (spec §1).
  // Package member items render inside their tier card; listing them here too
  // would double-display them as always-included regardless of tier choice.
  const memberIds = new Set((proposal.packages ?? []).flatMap((p) => p.item_ids ?? []))
  const requiredItems = proposal.line_items.filter(
    (i) => i.optional !== true && !memberIds.has(i.id ?? ''),
  )
  const optionalItems = proposal.line_items.filter((i) => i.optional === true && i.id)

  function toggleOptional(id: string) {
    setOptionalIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const effectiveProposal = liveProposal ?? proposal

  if (effectiveProposal.status === 'voided') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--warm-50)] px-6 text-center">
        <p className="text-lg font-medium text-[var(--warm-500)]">This proposal is no longer available.</p>
      </main>
    )
  }

  const declined = declinedLocally || effectiveProposal.status === 'rejected'
  const signedInfo: SignedInfo | undefined =
    effectiveProposal.signed ?? (signResult ? { signer_name: signerName.trim() } : undefined)

  const showForm = !declined && !signedInfo && beforeAcceptStep === 'idle'
  const showPayment = !declined && !signedInfo && beforeAcceptStep === 'payment'
  const showFinalizing = !declined && !signedInfo && beforeAcceptStep === 'finalizing'
  // Selection controls (and the sign fields) must lock the instant a step advances, not just
  // once server state catches up — otherwise a customer could change their pick while a
  // request is in flight, after the (correct) submitted payload has already been frozen.
  const editable = showForm && !submitting

  const usesBeforeAcceptGate = !!proposal.deposit && proposal.deposit_gate === 'before_accept'

  const total = signedInfo
    ? (effectiveProposal.selection?.selected_total ??
        acceptedTotal ??
        computeSelectedTotal(proposal, { package_id: packageId, optional_item_ids: optionalIds }))
    : computeSelectedTotal(proposal, { package_id: packageId, optional_item_ids: optionalIds })

  const paymentStatus: PaymentStatus | undefined = depositPaidLocally
    ? 'deposit_paid'
    : (effectiveProposal.payment_status ?? signResult?.payment_status)

  const depositDueNow = signResult?.deposit_due ?? depositAmount(total, effectiveProposal.deposit ?? proposal.deposit)

  async function decline() {
    setSubmitting(true)
    setError(null)
    try {
      await respondToProposal(token, 'rejected')
      setDeclinedLocally(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSign() {
    if (packaged && !packageId) {
      setError('Please choose an option before accepting.')
      return
    }
    if (!signerName.trim() || !signerEmail.trim() || !consent) {
      setError('Please enter your name, email, and confirm consent to sign electronically.')
      return
    }
    setError(null)

    // Freeze the selection at click time — controls are disabled the instant a step advances
    // (see `editable` above), so this is guaranteed to match what's ultimately submitted.
    const selection = { package_id: packageId, optional_item_ids: optionalIds }
    const submittedTotal = computeSelectedTotal(proposal, selection)

    if (usesBeforeAcceptGate) {
      // Don't sign yet — the deposit intent route captures a server-authoritative
      // pending_signature and the webhook promotes it once the payment succeeds.
      setAcceptedTotal(submittedTotal)
      setBeforeAcceptStep('payment')
      return
    }

    setSubmitting(true)
    try {
      const res = await signProposal(token, {
        signer_name: signerName.trim(),
        signer_email: signerEmail.trim(),
        consent,
        selection,
      })
      setAcceptedTotal(submittedTotal)
      setSignResult(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function refreshStatus() {
    const updated = await getPublicProposal(token)
    if (updated) setLiveProposal(updated)
  }

  // Presentation only: the hero renders when the org has any branding to
  // show; absent branding keeps the original plain heading (neutral theme).
  const hasHero = Boolean(branding?.cover_image_url || branding?.logo_url)

  return (
    <ProposalTheme branding={branding}>
    <main className="flex min-h-screen flex-col bg-white">
      {hasHero && (
        <div
          data-testid="proposal-hero"
          className="relative w-full bg-cover bg-center"
          style={
            branding?.cover_image_url
              ? { backgroundImage: `url(${branding.cover_image_url})` }
              : { backgroundColor: 'var(--proposal-accent, #111827)' }
          }
        >
          {/* Fixed-alpha scrim: alpha >= 0.535 guarantees 4.5:1 for white text
              against any cover image (see CoverSection.SCRIM_CLASS). No scrim
              (and no white-text override) when there's no image — the
              background is the theme's own accent, so the WCAG-derived
              --proposal-accent-text variable already guarantees contrast. */}
          <div className={branding?.cover_image_url ? 'bg-black/60' : ''}>
            <div className="mx-auto w-full max-w-3xl px-6 py-16">
              {branding?.logo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={branding.logo_url}
                  alt={`${branding.display_name ?? 'Company'} logo`}
                  className="mb-4 h-12 w-auto"
                />
              )}
              <h1
                className="text-3xl font-bold"
                style={{
                  color: branding?.cover_image_url ? '#ffffff' : 'var(--proposal-accent-text, #ffffff)',
                }}
              >
                {proposal.title || 'Proposal'}
              </h1>
              {branding?.display_name && (
                <p
                  className="mt-1 text-sm"
                  style={{
                    color: branding?.cover_image_url
                      ? 'rgba(255,255,255,0.8)'
                      : 'var(--proposal-accent-text, #ffffff)',
                    opacity: branding?.cover_image_url ? undefined : 0.8,
                  }}
                >
                  {branding.display_name}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
      <div className="mx-auto w-full max-w-3xl px-6 py-10">
        {!hasHero && (
          <h1 className="mb-6 text-2xl font-bold text-[var(--warm-950)]">{proposal.title || 'Proposal'}</h1>
        )}

        <a href={`/proposals/${token}/print`} target="_blank" rel="noreferrer"
           className="mb-6 inline-block text-sm text-[var(--warm-600)] underline print:hidden">
          Download PDF
        </a>
      </div>

      <ProposalComposition
        proposal={proposal}
        branding={branding}
        clientName={proposal.contact?.name}
        renderDerived={(type, treatment) => {
          const band = [
            'w-full px-6 py-12 sm:py-16',
            treatment === 'tinted' ? 'bg-[var(--warm-50)]' : '',
          ].join(' ')
          switch (type) {
            case 'tiers':
              return packaged ? (
                <section className={band}>
                  <div className="mx-auto max-w-3xl">
                    <h2 className="mb-6 text-2xl font-bold text-[var(--warm-950)]">Choose an option</h2>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {proposal.packages!.map((pkg) => (
                        <ProposalPackageOption
                          key={pkg.id}
                          pkg={pkg}
                          selected={packageId === pkg.id}
                          selectable={editable}
                          onSelect={() => setPackageId(pkg.id)}
                          {...packageOptionDisplay(pkg, proposal.packages!, proposal.line_items)}
                        />
                      ))}
                    </div>
                  </div>
                </section>
              ) : null
            case 'add_ons':
              return optionalItems.length > 0 ? (
                <section className={band}>
                  <div className="mx-auto max-w-3xl">
                    <h2 className="mb-4 text-xl font-bold text-[var(--warm-950)]">Optional add-ons</h2>
                    <ProposalOptionalItems
                      items={optionalItems}
                      selectedIds={optionalIds}
                      onToggle={toggleOptional}
                      disabled={!editable}
                    />
                  </div>
                </section>
              ) : null
            case 'investment':
              // A packaged proposal where every line item is a package
              // member has no requiredItems — nothing to show here. Return
              // null (not an empty section) so ProposalComposition's probe
              // drops it from the slot count instead of painting a blank
              // tinted band (spec §15.1).
              return requiredItems.length > 0 ? (
                <section className={band}>
                  <div className="mx-auto max-w-3xl space-y-6">
                    <div>
                      <h2 className="mb-4 text-xl font-bold text-[var(--warm-950)]">What&apos;s included</h2>
                      <ProposalIncludedItems items={requiredItems} />
                    </div>
                  </div>
                </section>
              ) : null
            case 'accept':
              // After a DECLINE, showForm/showPayment/showFinalizing are all
              // false and there is no signedInfo — nothing to show. Return
              // null so the probe drops this section instead of leaving a
              // ~96-128px empty hole where the sign box used to be.
              if (!showForm && !showPayment && !showFinalizing && !signedInfo) return null
              return (
                <section className={band}>
                  <div className="mx-auto max-w-3xl space-y-6">
                    {showForm && (
                      <div className="space-y-4">
                        <h2 className="text-xl font-bold text-[var(--warm-950)]">Sign to accept</h2>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label htmlFor="signer_name">Full name</Label>
                            <Input
                              id="signer_name"
                              value={signerName}
                              disabled={!editable}
                              onChange={(e) => setSignerName(e.target.value)}
                              placeholder="Jane Smith"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="signer_email">Email</Label>
                            <Input
                              id="signer_email"
                              type="email"
                              value={signerEmail}
                              disabled={!editable}
                              onChange={(e) => setSignerEmail(e.target.value)}
                              placeholder="jane@example.com"
                            />
                          </div>
                        </div>
                        {proposal.deposit_terms && (
                          <p className="whitespace-pre-wrap rounded-md bg-[var(--warm-50)] p-3 text-sm text-[var(--warm-700)]">
                            {proposal.deposit_terms}
                          </p>
                        )}
                        <label className="flex items-start gap-2 text-sm text-[var(--warm-900)]">
                          <input
                            type="checkbox"
                            checked={consent}
                            disabled={!editable}
                            onChange={(e) => setConsent(e.target.checked)}
                            className="mt-0.5 h-4 w-4 rounded border-[var(--warm-300)]"
                          />
                          <span>I agree to the terms above and consent to sign electronically.</span>
                        </label>
                      </div>
                    )}

                    {showPayment && (
                      <div className="space-y-3">
                        <h2 className="text-xl font-bold text-[var(--warm-950)]">Pay deposit to accept</h2>
                        <ProposalDepositPayment
                          token={token}
                          depositAmount={depositAmount(total, proposal.deposit)}
                          beforeAccept
                          signer={{ signer_name: signerName.trim(), signer_email: signerEmail.trim() }}
                          consent={consent}
                          selection={{ package_id: packageId, optional_item_ids: optionalIds }}
                          onSuccess={() => setBeforeAcceptStep('finalizing')}
                        />
                        <button
                          type="button"
                          className="mt-3 text-sm text-[var(--warm-500)] underline"
                          onClick={() => setBeforeAcceptStep('idle')}
                        >
                          Back
                        </button>
                      </div>
                    )}

                    {showFinalizing && (
                      <div className="py-6">
                        <p className="text-sm font-medium text-[var(--warm-900)]">
                          Payment received — finalizing your acceptance…
                        </p>
                        {pollExhausted && (
                          <div className="mt-3">
                            <p className="text-sm text-[var(--warm-500)]">
                              This is taking longer than expected. You can check again in a moment.
                            </p>
                            <Button variant="outline" className="mt-2" onClick={refreshStatus}>
                              Check again
                            </Button>
                          </div>
                        )}
                      </div>
                    )}

                    {signedInfo && (
                      <>
                        <AcceptedState
                          signerName={signedInfo.signer_name}
                          signedAt={signedInfo.signed_at}
                          depositPaid={paymentStatus === 'deposit_paid'}
                          orgName={branding?.display_name}
                        />
                        {paymentStatus === 'deposit_pending' && (
                          <div className="rounded-md border border-[var(--warm-200)] p-4">
                            <p className="mb-3 text-sm font-medium text-[var(--warm-900)]">Pay deposit now (optional)</p>
                            <ProposalDepositPayment
                              token={token}
                              depositAmount={depositDueNow}
                              onSuccess={() => setDepositPaidLocally(true)}
                            />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </section>
              )
            case 'terms':
              return proposal.terms ? (
                <section className={band}>
                  <div className="mx-auto max-w-3xl">
                    <h2 className="mb-4 text-xl font-bold text-[var(--warm-950)]">Terms</h2>
                    <p className="whitespace-pre-wrap text-sm text-[var(--warm-700)]">{proposal.terms}</p>
                  </div>
                </section>
              ) : null
            default:
              return null
          }
        }}
      />

      <div className="sticky bottom-0 border-t border-[var(--warm-200)] bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-3xl px-6 py-4">
          {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
          <div className="flex flex-wrap items-end justify-between gap-4">
            <ProposalTotals
              total={{ min: total, max: total }}
              deposit={signedInfo ? undefined : proposal.deposit}
              depositLabel={usesBeforeAcceptGate ? 'Deposit due to accept' : 'Deposit due on acceptance'}
              expiresAt={proposal.expires_at}
            />

            {showForm ? (
              <div className="flex gap-3">
                <Button
                  onClick={handleSign}
                  disabled={submitting || !signerName.trim() || !signerEmail.trim() || !consent}
                >
                  {submitting ? 'Submitting…' : usesBeforeAcceptGate ? 'Continue to payment' : 'Sign & accept'}
                </Button>
                <Button variant="outline" onClick={decline} disabled={submitting}>
                  {submitting ? 'Submitting…' : 'Decline'}
                </Button>
              </div>
            ) : signedInfo ? (
              <p className="text-sm font-medium text-green-700">
                Thanks — you&apos;ve accepted this proposal.
              </p>
            ) : declined ? (
              <p className="text-sm font-medium text-[var(--warm-700)]">
                You&apos;ve declined this proposal.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </main>
    </ProposalTheme>
  )
}
