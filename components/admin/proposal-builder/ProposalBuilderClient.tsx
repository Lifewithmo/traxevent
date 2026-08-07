'use client'

// The layout-first proposal builder (spec §4): a centered themed document
// canvas — the customer's exact rendering, edited in place — plus a slim
// right rail for non-visual settings and a top bar. Replaces the
// form-per-block ProposalEditorClient/ProposalBlockEditor pair.
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { sendProposal, deleteProposal, voidProposal } from '@/actions/proposals'
import { uploadProposalImage } from '@/actions/proposal-images'
import { proposalRange, depositAmount } from '@/lib/proposals'
import {
  packagePrice,
  upgradeLegacyPackages,
  type OrgBranding,
  type PlaceholderBlock,
  type ProposalDraftUpdate,
} from '@/lib/proposal-builder-stubs'
import { ProposalThemeStub } from '@/components/proposals/ProposalThemeStub'
import { BlockCanvas } from '@/components/admin/proposal-builder/BlockCanvas'
import { PricingCanvas } from '@/components/admin/proposal-builder/PricingCanvas'
import { TopBar, type Viewport } from '@/components/admin/proposal-builder/TopBar'
import { RightRail } from '@/components/admin/proposal-builder/RightRail'
import { useDraftAutosave } from '@/components/admin/proposal-builder/useDraftAutosave'
import { mergeDraftIntoBlocks } from '@/components/admin/proposal-builder/merge-draft'
import { Card, CardContent } from '@/components/ui/card'
import type { Proposal, ProposalBlock, ProposalStatus } from '@/lib/types'

const money = (n: number) => `$${n.toFixed(2)}`

export function ProposalBuilderClient({
  orgId,
  orgSlug,
  leadId,
  proposal,
  branding,
  aiEnabled = false,
}: {
  orgId: string
  orgSlug: string
  leadId: string
  proposal: Proposal
  branding?: OrgBranding
  aiEnabled?: boolean
}) {
  const router = useRouter()

  // Locked whenever a signature is in progress or complete — `pending_signature`
  // means a before_accept deposit payment is in flight; editing during that
  // window would let the payment webhook later find nothing to promote. A
  // voided proposal is permanently locked.
  const voided = proposal.status === 'voided'
  const locked = Boolean(proposal.signature) || Boolean(proposal.pending_signature) || voided

  // Seed the draft, applying the legacy→composed package upgrade (spec §1
  // upgrade-on-open). It persists on the first autosave; a locked proposal
  // never autosaves, so opening read-only never writes.
  const seed = useMemo(() => {
    const base: ProposalDraftUpdate = {
      title: proposal.title,
      notes: proposal.notes,
      blocks: (proposal.blocks ?? []) as PlaceholderBlock[],
      line_items: proposal.line_items ?? [],
      packages: proposal.packages,
      discount: proposal.discount,
      tax_rate: proposal.tax_rate,
      deposit: proposal.deposit,
      deposit_gate: proposal.deposit_gate,
      deposit_terms: proposal.deposit_terms,
      expires_at: proposal.expires_at,
    }
    if (!base.packages?.length) return { draft: base, upgraded: false }
    const res = upgradeLegacyPackages(base.line_items ?? [], base.packages)
    const upgraded = res.packages !== base.packages
    return {
      draft: { ...base, line_items: res.line_items, packages: res.packages },
      upgraded: upgraded && !locked,
    }
  }, [proposal, locked])

  const { draft, update, status: saveStatus, adjustments, retryNow } = useDraftAutosave({
    orgId,
    proposalId: proposal.id,
    initial: seed.draft,
    enabled: !locked,
    initiallyDirty: seed.upgraded,
  })

  const [docStatus, setDocStatus] = useState<ProposalStatus>(proposal.status)
  const [viewport, setViewport] = useState<Viewport>('desktop')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const blocks = (draft.blocks ?? []) as PlaceholderBlock[]
  const lineItems = draft.line_items ?? []
  const packages = draft.packages ?? []
  const placeholderCount = blocks.filter((b) => b.placeholder === true).length

  // The live customer total (spec §4): composed tier prices are recomputed
  // client-side so the sticky bar tracks every edit instantly; the server
  // re-derives the same denormalized price on save.
  const range = proposalRange({
    packages: packages.length
      ? packages.map((p) => ({ ...p, price: packagePrice(p, lineItems) }))
      : undefined,
    line_items: lineItems,
    discount: draft.discount,
    tax_rate: draft.tax_rate,
  })
  const rangeLabel = range.min === range.max ? money(range.min) : `${money(range.min)}–${money(range.max)}`

  async function handleSend() {
    if (
      placeholderCount > 0 &&
      !window.confirm(
        `${placeholderCount} placeholder section${placeholderCount === 1 ? '' : 's'} still need${placeholderCount === 1 ? 's' : ''} content and will be hidden from the client. Send anyway?`,
      )
    ) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      await sendProposal(orgId, proposal.id)
      setDocStatus('sent')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this proposal? This cannot be undone.')) return
    setBusy(true)
    setError(null)
    try {
      await deleteProposal(orgId, proposal.id)
      router.push(`/${orgSlug}/leads/${leadId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete')
      setBusy(false)
    }
  }

  async function handleVoid() {
    const reason = window.prompt('Reason for voiding this proposal:')
    if (!reason || !reason.trim()) return
    setBusy(true)
    setError(null)
    try {
      await voidProposal(orgId, proposal.id, reason.trim())
      setDocStatus('voided')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to void proposal')
    } finally {
      setBusy(false)
    }
  }

  function handleAiApply(draftBlocks: ProposalBlock[], mode: 'fill' | 'replace') {
    if (mode === 'fill') {
      const merged = mergeDraftIntoBlocks(blocks, draftBlocks)
      update({ blocks: merged.blocks })
      return
    }
    // Replace: re-mint ids so a model-supplied id can never collide with an
    // existing block id.
    update({ blocks: draftBlocks.map((b) => ({ ...b, id: crypto.randomUUID() })) })
  }

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar
        orgSlug={orgSlug}
        leadId={leadId}
        title={draft.title ?? ''}
        onTitle={(title) => update({ title: title || undefined })}
        status={docStatus}
        token={proposal.token}
        locked={locked}
        viewport={viewport}
        onViewport={setViewport}
      />

      <div className="flex flex-1">
        <main className="flex-1 overflow-y-auto bg-gray-100 px-6 py-8">
          {voided && (
            <Card className="mx-auto mb-4 max-w-3xl border-destructive/50 bg-destructive/10">
              <CardContent className="pt-6">
                <p className="text-sm font-medium">
                  Voided{proposal.void_reason ? ` — ${proposal.void_reason}` : ''}
                </p>
              </CardContent>
            </Card>
          )}
          {locked && !voided && (
            <Card className="mx-auto mb-4 max-w-3xl border-amber-500/50 bg-amber-500/10">
              <CardContent className="pt-6">
                <p className="text-sm font-medium">
                  This proposal is signed and locked. Create a new version to make changes.
                </p>
              </CardContent>
            </Card>
          )}

          <ProposalThemeStub
            branding={branding}
            className={`mx-auto rounded-lg bg-white p-8 shadow-sm ${viewport === 'mobile' ? 'max-w-sm' : 'max-w-3xl'}`}
          >
            <BlockCanvas
              blocks={blocks}
              onChange={(next) => update({ blocks: next })}
              onUploadImage={async (file) => {
                const form = new FormData()
                form.set('file', file)
                return uploadProposalImage(orgId, proposal.id, form)
              }}
              disabled={locked}
            />
            <div className="mt-8 border-t pt-6">
              <PricingCanvas
                lineItems={lineItems}
                packages={packages}
                onItemsChange={(next) => update({ line_items: next })}
                onPackagesChange={(next) => update({ packages: next })}
                disabled={locked}
              />
            </div>
          </ProposalThemeStub>

          <div className="sticky bottom-0 mx-auto mt-6 max-w-3xl rounded-t-lg border bg-white/95 px-6 py-3 backdrop-blur">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Client sees: {rangeLabel}</p>
              {draft.deposit && (
                <p className="text-xs text-muted-foreground">
                  Deposit: {money(depositAmount(range.max, draft.deposit))}
                </p>
              )}
            </div>
          </div>
        </main>

        <RightRail
          proposal={proposal}
          status={docStatus}
          locked={locked}
          draft={draft}
          update={update}
          saveStatus={saveStatus}
          adjustments={adjustments}
          retryNow={retryNow}
          placeholderCount={placeholderCount}
          aiEnabled={aiEnabled}
          busy={busy}
          error={error}
          onSend={handleSend}
          onVoid={handleVoid}
          onDelete={handleDelete}
          onAiApply={handleAiApply}
        />
      </div>
    </div>
  )
}
