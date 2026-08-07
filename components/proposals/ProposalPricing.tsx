// Presentational pricing primitives shared by the interactive public proposal
// page (ProposalResponseClient) and the static print view.
//
// WHY THIS FILE EXISTS: the print route originally reimplemented pricing from
// scratch — a flat `line_items` table — and so ignored packages, the `optional`
// flag, discount, tax, deposit and the locked `selection`. A packaged proposal
// printed with no price at all; add-ons printed as included; the printed
// subtotal contradicted the web page beside it. Every number a customer can
// read now comes from one of these components, and every one of them derives
// its figures from lib/proposals.ts rather than recomputing.
//
// These are deliberately dumb: no state, no data fetching, no hooks. Handlers
// arrive as optional props, so the interactive page keeps ownership of all
// selection behaviour while the server-rendered print view simply omits them
// and gets a read-only rendering of the same rows.

import type { CSSProperties } from 'react'
import { lineItemSubtotal, depositAmount, proposalExpiryInstant } from '@/lib/proposals'
import type { ProposalLineItem, ProposalPackage, ProposalDeposit } from '@/lib/types'

export function money(n: number): string {
  return `$${n.toFixed(2)}`
}

// A price that may be a single figure (a locked selection, or an itemized
// proposal with no optional add-ons) or a span (a packaged proposal the
// customer has not chosen from yet). Rendering a span as one number is how a
// static view ends up asserting a price nobody agreed to.
function moneySpan(range: { min: number; max: number }): string {
  return range.min === range.max ? money(range.min) : `${money(range.min)} – ${money(range.max)}`
}

/**
 * One package tier. `onSelect` present = the interactive public page.
 *
 * Composed (pricing model v2) packages pass `bullets` — the member items'
 * descriptions in item_ids order (spec §1: bullets ARE the items) — and
 * optionally `supersetLabel` ("Everything in {smaller tier}") rendered as the
 * first line. When absent, the legacy `includes` render exactly as before.
 * Accent styling comes from the --proposal-* theme variables.
 */
export function ProposalPackageOption({
  pkg, selected, selectable = false, onSelect, bullets, supersetLabel,
}: {
  pkg: ProposalPackage
  selected: boolean
  selectable?: boolean
  onSelect?: () => void
  bullets?: string[]
  supersetLabel?: string
}) {
  const lines = bullets ?? pkg.includes ?? []
  const body = (
    <>
      {pkg.recommended && (
        <span
          className="absolute right-3 top-3 rounded-full px-2 py-0.5 text-xs font-medium"
          style={{
            backgroundColor: 'var(--proposal-accent, #111827)',
            color: 'var(--proposal-accent-text, #ffffff)',
          }}
        >
          Recommended
        </span>
      )}
      <p className="font-semibold text-gray-900">{pkg.name}</p>
      {pkg.description && <p className="mt-1 text-sm text-gray-500">{pkg.description}</p>}
      <p className="mt-2 text-lg font-bold" style={{ color: 'var(--proposal-accent, #111827)' }}>
        {money(pkg.price)}
      </p>
      {(supersetLabel || lines.length > 0) && (
        <ul className="mt-3 space-y-1 text-sm text-gray-700">
          {supersetLabel && (
            <li className="flex gap-2 font-medium">
              <span aria-hidden="true">✓</span>
              <span>{supersetLabel}</span>
            </li>
          )}
          {lines.map((line, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden="true">✓</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  )

  const frame = `relative rounded-lg border p-4 text-left transition ${
    selected ? 'border-transparent ring-2' : 'border-gray-200'
  }`

  // Selected ring takes the brand accent; Tailwind's ring utility reads its
  // color from --tw-ring-color, so the theme variable feeds it directly.
  const frameStyle = selected
    ? ({ '--tw-ring-color': 'var(--proposal-accent, #111827)' } as CSSProperties)
    : undefined

  // No handler (print, or a locked page) => not a button at all, so a static
  // rendering never advertises an affordance it does not have.
  if (!onSelect) {
    return (
      <div className={frame} style={frameStyle}>
        {body}
        {selected && <p className="mt-3 text-xs font-medium text-gray-900">Selected</p>}
      </div>
    )
  }

  return (
    <button
      type="button"
      disabled={!selectable}
      onClick={() => selectable && onSelect()}
      aria-pressed={selected}
      style={frameStyle}
      className={`${frame} ${selectable ? 'cursor-pointer hover:border-gray-400' : 'cursor-default'}`}
    >
      {body}
    </button>
  )
}

/** Required base scope — identical on both surfaces, never selectable. */
export function ProposalIncludedItems({ items }: { items: ProposalLineItem[] }) {
  return (
    <ul className="divide-y">
      {items.map((item, i) => (
        <li key={item.id ?? i} className="flex items-center justify-between py-2 text-sm">
          <span className="text-gray-900">
            {item.description} <span className="text-gray-500">× {item.quantity}</span>
          </span>
          <span className="text-gray-900">{money(lineItemSubtotal(item))}</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * Optional add-ons. `onToggle` present = interactive checkboxes; absent = a
 * read-only rendering that still states, per row, whether the add-on is in the
 * price. Printing these as ordinary included rows understated nothing and
 * overstated the base offer, which is the whole point of the distinction.
 */
export function ProposalOptionalItems({
  items, selectedIds, onToggle, disabled = false,
}: {
  items: ProposalLineItem[]
  selectedIds: string[]
  onToggle?: (id: string) => void
  disabled?: boolean
}) {
  return (
    <ul className="divide-y">
      {items.map((item) => {
        const id = item.id as string
        const chosen = selectedIds.includes(id)
        const label = (
          <span>
            {item.description} <span className="text-gray-500">× {item.quantity}</span>
          </span>
        )
        return (
          <li key={id} className="flex items-center justify-between py-2 text-sm">
            {onToggle ? (
              <label className="flex items-center gap-3 text-gray-900">
                <input
                  type="checkbox"
                  checked={chosen}
                  disabled={disabled}
                  onChange={() => onToggle(id)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                {label}
              </label>
            ) : (
              <span className="flex items-center gap-3 text-gray-900">
                <span aria-hidden="true" className="text-gray-500">{chosen ? '☑' : '☐'}</span>
                {label}
                <span className="text-xs text-gray-500">
                  {chosen ? '(included)' : '(not included)'}
                </span>
              </span>
            )}
            <span className="text-gray-900">{money(lineItemSubtotal(item))}</span>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * The money block: total, deposit due, expiry. The single place either surface
 * states a headline price.
 */
export function ProposalTotals({
  total, deposit, depositLabel, expiresAt, depositPaid = false,
}: {
  total: { min: number; max: number }
  // Omitted once the proposal is signed on the interactive page, matching how
  // that page swaps the "deposit due" line for its paid/pay-now treatment.
  deposit?: ProposalDeposit
  depositLabel?: string
  expiresAt?: string
  depositPaid?: boolean
}) {
  return (
    <div>
      <p className="text-sm text-gray-500">Total</p>
      <p className="text-2xl font-bold text-gray-900">{moneySpan(total)}</p>
      {deposit && (
        <p className="text-sm text-gray-600">
          {depositLabel ?? 'Deposit due'}:{' '}
          {moneySpan({
            min: depositAmount(total.min, deposit),
            max: depositAmount(total.max, deposit),
          })}
        </p>
      )}
      {depositPaid && <p className="text-sm font-medium text-green-700">Deposit paid.</p>}
      {expiresAt && (
        <p className="text-xs text-gray-400">
          {/* Rendered from the same instant the signing/deposit guards
              use (proposalExpiryInstant), so a date-only expires_at
              (end of that UTC day) never shows a date the guards
              would already treat as expired, or vice versa. */}
          This proposal expires{' '}
          {new Date(proposalExpiryInstant(expiresAt)).toLocaleDateString()}
        </p>
      )}
    </div>
  )
}
