'use client'

// The slim right rail (spec §4): everything non-visual — send/void/delete,
// the always-visible client link, pricing terms (discount/tax/deposit/gate/
// expiry), completeness, the AI panel, and the autosave state. The document
// itself is edited on the canvas, never here.
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ProposalAiPanel } from '@/components/admin/proposal-builder/ProposalAiPanel'
import type { SaveStatus } from '@/components/admin/proposal-builder/useDraftAutosave'
import type { ProposalDraftUpdate } from '@/lib/proposals/draft'
import type { Proposal, ProposalBlock } from '@/lib/types'

function toNumber(v: string): number {
  if (v.trim() === '') return 0
  const n = Number(v)
  return Number.isNaN(n) ? 0 : n
}

const SAVE_LABELS: Record<SaveStatus, string> = {
  saved: 'Saved',
  dirty: 'Saving…',
  saving: 'Saving…',
  retrying: 'Retrying',
}

export function RightRail({
  proposal,
  status,
  locked,
  draft,
  update,
  saveStatus,
  adjustments,
  retryNow,
  placeholderCount,
  aiEnabled,
  busy,
  error,
  onSend,
  onVoid,
  onDelete,
  onAiApply,
}: {
  proposal: Proposal
  status: Proposal['status']
  locked: boolean
  draft: ProposalDraftUpdate
  update: (patch: Partial<ProposalDraftUpdate>) => void
  saveStatus: SaveStatus
  adjustments: string[]
  retryNow: () => void
  placeholderCount: number
  aiEnabled: boolean
  busy: boolean
  error: string | null
  onSend: () => void
  onVoid: () => void
  onDelete: () => void
  onAiApply: (blocks: ProposalBlock[], mode: 'fill' | 'replace') => void
}) {
  const [copied, setCopied] = useState(false)
  const shareLink =
    typeof window !== 'undefined'
      ? `${window.location.origin}/proposals/${proposal.token}`
      : `/proposals/${proposal.token}`

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareLink)
      setCopied(true)
    } catch {
      // non-fatal; the input is selectable
    }
  }

  const discount = draft.discount
  const deposit = draft.deposit

  return (
    <aside data-testid="builder-rail" className="w-80 shrink-0 space-y-4 border-l bg-gray-50/50 p-4">
      <div aria-live="polite" aria-atomic="true" className="space-y-1">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {adjustments.map((a, i) => (
          <p key={i} className="text-xs text-amber-700">{a}</p>
        ))}
      </div>

      {!locked && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{SAVE_LABELS[saveStatus]}</span>
          {saveStatus === 'retrying' && (
            <Button size="sm" variant="outline" onClick={retryNow}>Retry now</Button>
          )}
        </div>
      )}

      <div className="text-sm">
        {placeholderCount > 0 ? (
          <p className="font-medium text-amber-700">
            {placeholderCount} placeholder section{placeholderCount === 1 ? '' : 's'} remaining
          </p>
        ) : (
          <p className="text-muted-foreground">All sections complete</p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {!locked && (
            <Button size="sm" onClick={onSend} disabled={busy}>Send to client</Button>
          )}
          {status === 'draft' && (
            <Button size="sm" variant="destructive" onClick={onDelete} disabled={busy}>Delete</Button>
          )}
          {status !== 'draft' && status !== 'voided' && (
            <Button size="sm" variant="outline" onClick={onVoid} disabled={busy}>Void proposal</Button>
          )}
        </div>
        <div className="space-y-1">
          <Label htmlFor="client-link">Client link</Label>
          <div className="flex items-center gap-2">
            <Input id="client-link" readOnly value={shareLink} className="flex-1 text-xs" />
            <Button size="sm" variant="outline" onClick={copyLink}>{copied ? 'Copied!' : 'Copy'}</Button>
          </div>
        </div>
      </div>

      <div className="space-y-3 border-t pt-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-32 space-y-1">
            <Label htmlFor="discountType">Discount</Label>
            <select
              id="discountType"
              value={discount?.type ?? 'none'}
              onChange={(e) => {
                const t = e.target.value
                update({
                  discount: t === 'none' ? undefined : { type: t as 'percent' | 'fixed', value: discount?.value ?? 0 },
                })
              }}
              disabled={locked}
              className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="none">None</option>
              <option value="percent">Percent</option>
              <option value="fixed">Fixed</option>
            </select>
          </div>
          <div className="w-24 space-y-1">
            <Label htmlFor="discountValue">Value</Label>
            <Input
              id="discountValue"
              type="number"
              value={String(discount?.value ?? 0)}
              disabled={locked || !discount}
              onChange={(e) =>
                update({ discount: discount ? { ...discount, value: toNumber(e.target.value) } : discount })
              }
            />
          </div>
        </div>

        <div className="w-24 space-y-1">
          <Label htmlFor="taxRate">Tax rate (%)</Label>
          <Input
            id="taxRate"
            type="number"
            value={draft.tax_rate != null ? String(draft.tax_rate) : ''}
            onChange={(e) =>
              update({ tax_rate: e.target.value.trim() === '' ? undefined : Number(e.target.value) })
            }
            disabled={locked}
          />
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="w-32 space-y-1">
            <Label htmlFor="depositType">Deposit</Label>
            <select
              id="depositType"
              value={deposit?.type ?? 'none'}
              onChange={(e) => {
                const t = e.target.value
                update({
                  deposit: t === 'none' ? undefined : { type: t as 'percent' | 'fixed', value: deposit?.value ?? 0 },
                  ...(t === 'none' ? { deposit_gate: undefined, deposit_terms: undefined } : {}),
                })
              }}
              disabled={locked}
              className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="none">None</option>
              <option value="percent">Percent</option>
              <option value="fixed">Fixed</option>
            </select>
          </div>
          <div className="w-24 space-y-1">
            <Label htmlFor="depositValue">Value</Label>
            <Input
              id="depositValue"
              type="number"
              value={String(deposit?.value ?? 0)}
              disabled={locked || !deposit}
              onChange={(e) =>
                update({ deposit: deposit ? { ...deposit, value: toNumber(e.target.value) } : deposit })
              }
            />
          </div>
        </div>

        {deposit && (
          <div className="space-y-3 border-t border-border pt-3">
            <div className="space-y-1">
              <Label htmlFor="depositGate">Deposit gate</Label>
              <select
                id="depositGate"
                value={draft.deposit_gate ?? 'after_accept'}
                onChange={(e) => update({ deposit_gate: e.target.value as 'before_accept' | 'after_accept' })}
                disabled={locked}
                className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="after_accept">Request deposit after acceptance</option>
                <option value="before_accept">Require deposit before accepting</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="depositTerms">Cancellation / refund policy</Label>
              <textarea
                id="depositTerms"
                value={draft.deposit_terms ?? ''}
                onChange={(e) => update({ deposit_terms: e.target.value || undefined })}
                placeholder="e.g. Deposit is non-refundable within 30 days of the event date."
                disabled={locked}
                className="flex min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          </div>
        )}

        <div className="space-y-1">
          <Label htmlFor="propTerms">Terms</Label>
          <textarea
            id="propTerms"
            value={draft.terms ?? ''}
            onChange={(e) => update({ terms: e.target.value || undefined })}
            placeholder="Legal terms the client agrees to when signing. Seeded from Branding → Proposal terms."
            disabled={locked}
            className="flex min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <p className="text-xs text-muted-foreground">Shown above the signature box; covered by the client&apos;s e-signature.</p>
        </div>

        <div className="w-40 space-y-1">
          <Label htmlFor="expiresAt">Expires</Label>
          <Input
            id="expiresAt"
            type="date"
            value={draft.expires_at ?? ''}
            onChange={(e) => update({ expires_at: e.target.value || undefined })}
            disabled={locked}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="propNotes">Notes for the client</Label>
          <textarea
            id="propNotes"
            value={draft.notes ?? ''}
            onChange={(e) => update({ notes: e.target.value || undefined })}
            disabled={locked}
            className="flex min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
      </div>

      {aiEnabled && !locked && (
        <div className="border-t pt-3">
          <ProposalAiPanel
            orgId={proposal.org_id}
            proposalId={proposal.id}
            placeholderCount={placeholderCount}
            hasBlocks={(draft.blocks ?? []).length > 0}
            disabled={locked}
            onApply={onAiApply}
          />
        </div>
      )}
    </aside>
  )
}
