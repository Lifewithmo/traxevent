'use client'

// The totals half of the builder canvas: mirrors the client-facing
// ProposalTotals layout (Total / Deposit due / expiry), but every figure here
// is editable in place via popovers — the same idiom PricingCanvas uses for
// package price and item qty/price. This replaces the pricing-terms fields
// that used to live in RightRail.tsx; the patch shapes below (especially the
// deposit "None" clearing deposit_gate/deposit_terms together) are copied
// verbatim from that file's semantics so autosave behavior doesn't change.
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { depositAmount } from '@/lib/proposals'
import type { ProposalDraftUpdate } from '@/lib/proposals/draft'

const money = (n: number) => `$${n.toFixed(2)}`

function moneySpan(range: { min: number; max: number }): string {
  return range.min === range.max ? money(range.min) : `${money(range.min)} – ${money(range.max)}`
}

function toNumber(v: string): number {
  if (v.trim() === '') return 0
  const n = Number(v)
  return Number.isNaN(n) ? 0 : n
}

type Popover = 'discount' | 'tax' | 'deposit' | null

export function TotalsCanvas({
  draft,
  update,
  range,
  disabled,
}: {
  draft: ProposalDraftUpdate
  update: (patch: Partial<ProposalDraftUpdate>) => void
  range: { min: number; max: number }
  disabled: boolean
}) {
  const [popover, setPopover] = useState<Popover>(null)
  const [expiryEditing, setExpiryEditing] = useState(false)

  const discount = draft.discount
  const deposit = draft.deposit
  const showExpiryInput = draft.expires_at !== undefined || expiryEditing

  const discountText = discount
    ? discount.type === 'percent' ? `${discount.value}%` : money(discount.value)
    : ''
  const taxText = draft.tax_rate != null ? `${draft.tax_rate}%` : ''
  const depositText = deposit
    ? moneySpan({
        min: depositAmount(range.min, deposit),
        max: depositAmount(range.max, deposit),
      })
    : 'None'

  return (
    <section className="space-y-3 rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">Total</span>
        <span className="text-2xl font-bold text-gray-900">{moneySpan(range)}</span>
      </div>

      {/* Discount — one popover reused by both the set row (button) and the
          unset ghost ("+ Add discount"); it reads discount?.type ?? 'none'
          the same way the Deposit popover below does, so there is exactly
          one copy of the patch logic regardless of which row opened it. */}
      {(discount || !disabled) && (
        <div className="relative">
          {disabled ? (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Discount</span>
              <span className="text-gray-900">{discountText}</span>
            </div>
          ) : discount ? (
            <button
              type="button"
              className="flex w-full items-center justify-between rounded px-1 text-sm hover:bg-gray-50"
              onClick={() => setPopover(popover === 'discount' ? null : 'discount')}
            >
              <span className="text-gray-500">Discount</span>
              <span className="text-gray-900">{discountText}</span>
            </button>
          ) : (
            <button
              type="button"
              className="text-sm text-gray-500 hover:text-gray-700"
              onClick={() => setPopover(popover === 'discount' ? null : 'discount')}
            >
              + Add discount
            </button>
          )}
          {popover === 'discount' && !disabled && (
            <div className="absolute right-0 z-30 mt-1 w-64 space-y-2 rounded-md border bg-white p-3 shadow-lg">
              <div className="space-y-1">
                <Label htmlFor="discountType">Discount</Label>
                <select
                  id="discountType"
                  value={discount?.type ?? 'none'}
                  onChange={(e) => {
                    const t = e.target.value
                    update({
                      discount:
                        t === 'none' ? undefined : { type: t as 'percent' | 'fixed', value: discount?.value ?? 0 },
                    })
                  }}
                  className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="none">None</option>
                  <option value="percent">Percent</option>
                  <option value="fixed">Fixed</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="discountValue">Value</Label>
                <Input
                  id="discountValue"
                  type="number"
                  value={String(discount?.value ?? 0)}
                  disabled={!discount}
                  onChange={(e) =>
                    update({ discount: discount ? { ...discount, value: toNumber(e.target.value) } : discount })
                  }
                />
              </div>
              <Button type="button" size="sm" className="w-full" onClick={() => setPopover(null)}>
                Done
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Tax — same single-popover shape as Discount above. */}
      {(draft.tax_rate != null || !disabled) && (
        <div className="relative">
          {disabled ? (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Tax</span>
              <span className="text-gray-900">{taxText}</span>
            </div>
          ) : draft.tax_rate != null ? (
            <button
              type="button"
              className="flex w-full items-center justify-between rounded px-1 text-sm hover:bg-gray-50"
              onClick={() => setPopover(popover === 'tax' ? null : 'tax')}
            >
              <span className="text-gray-500">Tax</span>
              <span className="text-gray-900">{taxText}</span>
            </button>
          ) : (
            <button
              type="button"
              className="text-sm text-gray-500 hover:text-gray-700"
              onClick={() => setPopover(popover === 'tax' ? null : 'tax')}
            >
              + Add tax
            </button>
          )}
          {popover === 'tax' && !disabled && (
            <div className="absolute right-0 z-30 mt-1 w-64 space-y-2 rounded-md border bg-white p-3 shadow-lg">
              <div className="space-y-1">
                <Label htmlFor="taxRate">Tax rate (%)</Label>
                <Input
                  id="taxRate"
                  type="number"
                  value={draft.tax_rate != null ? String(draft.tax_rate) : ''}
                  onChange={(e) =>
                    update({ tax_rate: e.target.value.trim() === '' ? undefined : Number(e.target.value) })
                  }
                />
              </div>
              <Button type="button" size="sm" className="w-full" onClick={() => setPopover(null)}>
                Done
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Deposit — always a row (never a ghost); the popover's own type
          selector is how a deposit gets set in the first place. */}
      {(deposit || !disabled) && (
        <div className="relative">
          {disabled ? (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Deposit due</span>
              <span className="text-gray-900">{depositText}</span>
            </div>
          ) : (
            <button
              type="button"
              className="flex w-full items-center justify-between rounded px-1 text-sm hover:bg-gray-50"
              onClick={() => setPopover(popover === 'deposit' ? null : 'deposit')}
            >
              <span className="text-gray-500">Deposit due</span>
              <span className="text-gray-900">{depositText}</span>
            </button>
          )}
          {popover === 'deposit' && !disabled && (
            <div className="absolute right-0 z-30 mt-1 w-64 space-y-2 rounded-md border bg-white p-3 shadow-lg">
              <div className="space-y-1">
                <Label htmlFor="depositType">Deposit</Label>
                <select
                  id="depositType"
                  value={deposit?.type ?? 'none'}
                  onChange={(e) => {
                    const t = e.target.value
                    update({
                      deposit:
                        t === 'none' ? undefined : { type: t as 'percent' | 'fixed', value: deposit?.value ?? 0 },
                      ...(t === 'none' ? { deposit_gate: undefined, deposit_terms: undefined } : {}),
                    })
                  }}
                  className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="none">None</option>
                  <option value="percent">Percent</option>
                  <option value="fixed">Fixed</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="depositValue">Value</Label>
                <Input
                  id="depositValue"
                  type="number"
                  value={String(deposit?.value ?? 0)}
                  disabled={!deposit}
                  onChange={(e) =>
                    update({ deposit: deposit ? { ...deposit, value: toNumber(e.target.value) } : deposit })
                  }
                />
              </div>
              {deposit && (
                <div className="space-y-2 border-t border-border pt-2">
                  <div className="space-y-1">
                    <Label>Deposit gate</Label>
                    <div className="space-y-1">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="depositGate"
                          checked={(draft.deposit_gate ?? 'after_accept') === 'after_accept'}
                          onChange={() => update({ deposit_gate: 'after_accept' })}
                        />
                        Request deposit after acceptance
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="depositGate"
                          checked={draft.deposit_gate === 'before_accept'}
                          onChange={() => update({ deposit_gate: 'before_accept' })}
                        />
                        Require deposit before accepting
                      </label>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="depositTerms">Cancellation / refund policy</Label>
                    <textarea
                      id="depositTerms"
                      value={draft.deposit_terms ?? ''}
                      onChange={(e) => update({ deposit_terms: e.target.value || undefined })}
                      placeholder="e.g. Deposit is non-refundable within 30 days of the event date."
                      className="flex min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                  </div>
                </div>
              )}
              <Button type="button" size="sm" className="w-full" onClick={() => setPopover(null)}>
                Done
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Expiry */}
      {disabled ? (
        draft.expires_at && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">Expiry</span>
            <span className="text-gray-900">{draft.expires_at}</span>
          </div>
        )
      ) : showExpiryInput ? (
        <div className="flex items-center justify-between gap-2 text-sm">
          <Label htmlFor="expiresAt">Expiry</Label>
          <Input
            id="expiresAt"
            type="date"
            className="w-40"
            value={draft.expires_at ?? ''}
            onChange={(e) => update({ expires_at: e.target.value || undefined })}
          />
        </div>
      ) : (
        <button
          type="button"
          className="text-sm text-gray-500 hover:text-gray-700"
          onClick={() => setExpiryEditing(true)}
        >
          + Add expiry
        </button>
      )}

      {/* Notes */}
      {(disabled ? draft.notes : true) && (
        <div className="space-y-1 border-t pt-3">
          <Label htmlFor="propNotes">Notes for the client</Label>
          {disabled ? (
            <p className="text-sm text-gray-700">{draft.notes}</p>
          ) : (
            <textarea
              id="propNotes"
              value={draft.notes ?? ''}
              onChange={(e) => update({ notes: e.target.value || undefined })}
              className="flex min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          )}
        </div>
      )}
    </section>
  )
}
