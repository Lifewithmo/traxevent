'use client'

// The layout-first proposal builder (spec §4): a centered themed document
// canvas — the customer's exact rendering, edited in place — under a command
// bar. The rail is gone; everything non-visual (send/void/delete, the client
// link, pricing terms, AI) now lives on the bar or the canvas itself
// (TotalsCanvas, DraftComposer, SendDialog). Replaces the form-per-block
// ProposalEditorClient/ProposalBlockEditor pair.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { sendProposal, deleteProposal, voidProposal } from '@/actions/proposals'
import { uploadProposalImage } from '@/actions/proposal-images'
import { proposalRange, depositAmount, packagePrice } from '@/lib/proposals'
import { upgradeLegacyProposal } from '@/lib/proposals/upgrade'
import type { ProposalDraftUpdate } from '@/lib/proposals/draft'
import { ProposalTheme } from '@/components/proposals/ProposalTheme'
import { BlockCanvas } from '@/components/admin/proposal-builder/BlockCanvas'
import { PricingCanvas } from '@/components/admin/proposal-builder/PricingCanvas'
import { TotalsCanvas } from '@/components/admin/proposal-builder/TotalsCanvas'
import { DraftComposer } from '@/components/admin/proposal-builder/DraftComposer'
import { SendDialog } from '@/components/admin/proposal-builder/SendDialog'
import { TopBar, type Viewport } from '@/components/admin/proposal-builder/TopBar'
import { useDraftAutosave } from '@/components/admin/proposal-builder/useDraftAutosave'
import { mergeDraftIntoBlocks } from '@/components/admin/proposal-builder/merge-draft'
import { Card, CardContent } from '@/components/ui/card'
import type {
  OrgBranding,
  Proposal,
  ProposalBlock,
  ProposalBlock as PlaceholderBlock,
  ProposalStatus,
} from '@/lib/types'

const money = (n: number) => `$${n.toFixed(2)}`

export function ProposalBuilderClient({
  orgId,
  orgSlug,
  leadId,
  proposal,
  branding,
  aiEnabled = false,
  leadContact = null,
}: {
  orgId: string
  orgSlug: string
  leadId: string
  proposal: Proposal
  branding?: OrgBranding
  aiEnabled?: boolean
  leadContact?: { name: string; email?: string } | null
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
    const res = upgradeLegacyProposal({ line_items: base.line_items ?? [], packages: base.packages })
    return {
      draft: { ...base, line_items: res.line_items, packages: res.packages },
      upgraded: res.changed && !locked,
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
  const [sendOpen, setSendOpen] = useState(false)
  const [sentFlag, setSentFlag] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)

  // Transient top-right notice (replaces the rail's inline error text — no
  // toast library). Auto-clears after 6s; also dismissable by hand.
  const [flash, setFlash] = useState<string | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current)
    }
  }, [])

  function showFlash(message: string) {
    setFlash(message)
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlash(null), 6000)
  }

  const blocks = (draft.blocks ?? []) as PlaceholderBlock[]
  const lineItems = draft.line_items ?? []
  const packages = draft.packages ?? []
  const placeholderCount = blocks.filter((b) => b.placeholder === true).length

  // The live customer total (spec §4): composed tier prices are recomputed
  // client-side so the totals section tracks every edit instantly; the server
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

  const shareLink =
    typeof window !== 'undefined'
      ? `${window.location.origin}/proposals/${proposal.token}`
      : `/proposals/${proposal.token}`

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareLink)
      showFlash('Link copied')
    } catch {
      showFlash('Could not copy link')
    }
  }

  function scrollToPlaceholder() {
    document.querySelector('[data-placeholder-block]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  // Pre-flight (placeholder/expiry warnings) now lives in SendDialog; this is
  // just the confirmed send.
  async function handleSend() {
    setBusy(true)
    try {
      await sendProposal(orgId, proposal.id)
      setDocStatus('sent')
      setSentFlag(true)
    } catch (e) {
      showFlash(e instanceof Error ? e.message : 'Failed to send')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this proposal? This cannot be undone.')) return
    setBusy(true)
    try {
      await deleteProposal(orgId, proposal.id)
      router.push(`/${orgSlug}/leads/${leadId}`)
    } catch (e) {
      showFlash(e instanceof Error ? e.message : 'Failed to delete')
      setBusy(false)
    }
  }

  async function handleVoid() {
    const reason = window.prompt('Reason for voiding this proposal:')
    if (!reason || !reason.trim()) return
    setBusy(true)
    try {
      await voidProposal(orgId, proposal.id, reason.trim())
      setDocStatus('voided')
      router.refresh()
    } catch (e) {
      showFlash(e instanceof Error ? e.message : 'Failed to void proposal')
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

  // The hero condition (spec §3): only when AI is enabled, the document is
  // editable, and there is nothing but placeholders — including the empty
  // document (blocks.length === 0 also qualifies).
  const showHero = aiEnabled && !locked && blocks.filter((b) => !b.placeholder).length === 0

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
        saveStatus={saveStatus}
        retryNow={retryNow}
        placeholderCount={placeholderCount}
        onPlaceholderChip={scrollToPlaceholder}
        aiEnabled={aiEnabled}
        onOpenAi={() => setAiOpen(true)}
        onSend={() => setSendOpen(true)}
        onCopyLink={copyLink}
        onVoid={handleVoid}
        onDelete={handleDelete}
        busy={busy}
      />

      <div
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed right-4 top-16 z-50 flex w-full max-w-sm flex-col gap-2"
      >
        {flash && (
          <div
            role="status"
            className="pointer-events-auto flex items-start justify-between gap-2 rounded-md border bg-white px-3 py-2 text-sm shadow-lg"
          >
            <span>{flash}</span>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setFlash(null)}
              className="text-muted-foreground hover:text-foreground"
            >
              ✕
            </button>
          </div>
        )}
        {adjustments.map((a, i) => (
          <div
            key={i}
            role="status"
            className="pointer-events-auto rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 shadow-lg"
          >
            {a}
          </div>
        ))}
      </div>

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

        <ProposalTheme
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
            onFillWithAi={() => setAiOpen(true)}
            hero={
              showHero ? (
                <DraftComposer
                  variant="hero"
                  orgId={orgId}
                  proposalId={proposal.id}
                  placeholderCount={placeholderCount}
                  hasBlocks={blocks.length > 0}
                  open={false}
                  onOpenChange={() => {}}
                  onApply={handleAiApply}
                />
              ) : undefined
            }
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
          <div className="mt-8 border-t pt-6">
            <TotalsCanvas draft={draft} update={update} range={range} disabled={locked} />
          </div>
        </ProposalTheme>

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

      <DraftComposer
        variant="modal"
        open={aiOpen}
        onOpenChange={setAiOpen}
        orgId={orgId}
        proposalId={proposal.id}
        placeholderCount={placeholderCount}
        hasBlocks={blocks.length > 0}
        onApply={handleAiApply}
      />

      <SendDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        recipient={leadContact}
        placeholderCount={placeholderCount}
        rangeLabel={rangeLabel}
        rangeMax={range.max}
        deposit={draft.deposit}
        depositGate={draft.deposit_gate}
        expiresAt={draft.expires_at}
        shareLink={shareLink}
        busy={busy}
        sent={sentFlag}
        onConfirmSend={handleSend}
        onJumpToPlaceholders={scrollToPlaceholder}
      />
    </div>
  )
}
