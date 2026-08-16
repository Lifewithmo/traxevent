'use client'

// Template editor (spec 2026-08-13 §3): the same themed document canvases as
// the proposal builder — blocks, pricing, totals — editing a ProposalTemplate
// instead of a Proposal. No send/status/client-link/void (templates are not
// transactional documents) and no AI composer (drafting consumes lead
// context; a template has none).
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  updateTemplateDraft,
  renameProposalTemplate,
  deleteProposalTemplate,
} from '@/actions/proposal-templates'
import { uploadProposalImage } from '@/actions/proposal-images'
import { proposalRange, packagePrice } from '@/lib/proposals'
import type { ProposalDraftUpdate } from '@/lib/proposals/draft'
import { ProposalTheme } from '@/components/proposals/ProposalTheme'
import { BlockCanvas } from '@/components/admin/proposal-builder/BlockCanvas'
import { PricingCanvas } from '@/components/admin/proposal-builder/PricingCanvas'
import { TotalsCanvas } from '@/components/admin/proposal-builder/TotalsCanvas'
import { useDraftAutosave, type DraftSave } from '@/components/admin/proposal-builder/useDraftAutosave'
import { TemplateTopBar } from '@/components/admin/templates/TemplateTopBar'
import type { OrgBranding, ProposalBlock, ProposalTemplate } from '@/lib/types'

const money = (n: number) => `$${n.toFixed(2)}`

export function TemplateBuilderClient({
  orgId,
  orgSlug,
  template,
  branding,
}: {
  orgId: string
  orgSlug: string
  template: ProposalTemplate
  branding?: OrgBranding
}) {
  const router = useRouter()
  const [name, setName] = useState(template.name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const seed = useMemo<ProposalDraftUpdate>(
    () => ({
      notes: template.notes,
      blocks: template.blocks ?? [],
      line_items: template.line_items ?? [],
      packages: template.packages,
      discount: template.discount,
      tax_rate: template.tax_rate,
      deposit: template.deposit,
      deposit_gate: template.deposit_gate,
      deposit_terms: template.deposit_terms,
      terms: template.terms,
    }),
    [template]
  )

  const save = useMemo<DraftSave>(
    () => async (d) => {
      const res = await updateTemplateDraft(orgId, template.id, d)
      return { adjustments: res.adjustments, reseed: res.persisted }
    },
    [orgId, template.id]
  )

  const { draft, update, status: saveStatus, adjustments, retryNow } = useDraftAutosave({
    orgId,
    proposalId: template.id,
    initial: seed,
    enabled: true,
    save,
  })

  const blocks = (draft.blocks ?? []) as ProposalBlock[]
  const lineItems = draft.line_items ?? []
  const packages = draft.packages ?? []

  const range = proposalRange({
    packages: packages.length
      ? packages.map((p) => ({ ...p, price: packagePrice(p, lineItems) }))
      : undefined,
    line_items: lineItems,
    discount: draft.discount,
    tax_rate: draft.tax_rate,
  })
  const rangeLabel = range.min === range.max ? money(range.min) : `${money(range.min)}–${money(range.max)}`

  async function handleName(next: string) {
    const trimmed = next.trim()
    if (!trimmed || trimmed === name) return
    setName(trimmed)
    try {
      await renameProposalTemplate(orgId, template.id, trimmed)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to rename template')
    }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this template? Proposals already created from it are unaffected.')) return
    setBusy(true)
    try {
      await deleteProposalTemplate(orgId, template.id)
      router.push(`/${orgSlug}/proposal-templates`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete template')
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <TemplateTopBar
        orgSlug={orgSlug}
        name={name}
        onName={handleName}
        saveStatus={saveStatus}
        retryNow={retryNow}
        onDelete={handleDelete}
        busy={busy}
      />

      <div aria-live="polite" aria-atomic="true" className="pointer-events-none fixed right-4 top-16 z-50 flex w-full max-w-sm flex-col gap-2">
        {/* bg-popover (not bg-white) so the toast surface follows the theme;
            the copy keeps text-destructive rather than popover-foreground. */}
        {error && (
          <div role="status" className="pointer-events-auto rounded-md border border-destructive/50 bg-popover px-3 py-2 text-sm text-destructive shadow-lg">
            {error}
          </div>
        )}
        {adjustments.map((a, i) => (
          <div key={i} role="status" className="pointer-events-auto rounded-md border border-[var(--warn-border)] bg-[var(--warn-bg)] px-3 py-2 text-sm text-[var(--warn-fg)] shadow-lg">
            {a}
          </div>
        ))}
      </div>

      <main className="flex-1 overflow-y-auto bg-muted px-6 py-8">
        {/* The paper is the customer's document, so it stays white in dark mode —
            --warm-0 is the literal white token. Do NOT use bg-card, which inverts. */}
        <ProposalTheme branding={branding} className="mx-auto max-w-3xl rounded-lg bg-[var(--warm-0)] p-8 shadow-sm">
          <BlockCanvas
            blocks={blocks}
            onChange={(next) => update({ blocks: next })}
            onUploadImage={async (file) => {
              const form = new FormData()
              form.set('file', file)
              // Storage paths are keyed by an opaque document id — the
              // template id serves exactly like a proposal id here.
              return uploadProposalImage(orgId, template.id, form)
            }}
            disabled={false}
          />
          <div className="mt-8 border-t pt-6">
            <PricingCanvas
              lineItems={lineItems}
              packages={packages}
              onItemsChange={(next) => update({ line_items: next })}
              onPackagesChange={(next) => update({ packages: next })}
              disabled={false}
            />
          </div>
          <div className="mt-8 border-t pt-6">
            <TotalsCanvas draft={draft} update={update} range={range} disabled={false} />
          </div>
        </ProposalTheme>

        <div className="sticky bottom-0 mx-auto mt-6 max-w-3xl rounded-t-lg border bg-card/95 px-6 py-3 backdrop-blur">
          <p className="text-sm font-semibold">Client would see: {rangeLabel}</p>
        </div>
      </main>
    </div>
  )
}
