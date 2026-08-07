'use client'

// The pricing half of the builder canvas (spec §4): package cards render as
// the customer sees them, and every figure is editable in place — bullets
// edit the underlying item description, the qty/price opens a popover, the
// tier price toggles a round-number override, and a member picker composes
// tiers from the shared line-item pool. Legacy tiers (no item_ids) render
// read-only; the upgrade-on-open adapter runs in the builder client.
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { InlineText } from '@/components/admin/proposal-builder/InlineText'
import { ItemPopover } from '@/components/admin/proposal-builder/ItemPopover'
import {
  packagePrice,
  type ProposalLineItem,
  type ProposalPackage,
} from '@/lib/proposal-builder-stubs'

const money = (n: number) => `$${n.toFixed(2)}`

function toNumber(v: string): number {
  if (v.trim() === '') return 0
  const n = Number(v)
  return Number.isNaN(n) ? 0 : n
}

type Popover =
  | { kind: 'item'; itemId: string; rowKey: string }
  | { kind: 'price'; pkgId: string }
  | { kind: 'members'; pkgId: string }
  | { kind: 'add-tier' }
  | null

export function PricingCanvas({
  lineItems,
  packages,
  onItemsChange,
  onPackagesChange,
  disabled,
}: {
  lineItems: ProposalLineItem[]
  packages: ProposalPackage[]
  onItemsChange: (next: ProposalLineItem[]) => void
  onPackagesChange: (next: ProposalPackage[]) => void
  disabled: boolean
}) {
  const [popover, setPopover] = useState<Popover>(null)

  const byId = new Map(lineItems.filter((i) => i.id).map((i) => [i.id as string, i]))
  const memberIds = new Set(packages.flatMap((p) => p.item_ids ?? []))
  const requiredItems = lineItems.filter((i) => i.optional !== true && !memberIds.has(i.id ?? ''))
  const optionalItems = lineItems.filter((i) => i.optional === true)

  function updateItem(id: string, patch: Partial<ProposalLineItem>) {
    onItemsChange(lineItems.map((i) => (i.id === id ? { ...i, ...patch } : i)))
  }

  function updatePackage(id: string, patch: Partial<ProposalPackage>) {
    onPackagesChange(packages.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }

  function addItemToTier(pkg: ProposalPackage) {
    const id = crypto.randomUUID()
    onItemsChange([...lineItems, { id, description: 'New item', quantity: 1, unit_price: 0 }])
    onPackagesChange(
      packages.map((p) => (p.id === pkg.id ? { ...p, item_ids: [...(p.item_ids ?? []), id] } : p)),
    )
  }

  function addPoolItem(optional: boolean) {
    onItemsChange([
      ...lineItems,
      { id: crypto.randomUUID(), description: 'New item', quantity: 1, unit_price: 0, ...(optional ? { optional } : {}) },
    ])
  }

  function addTier(fromPrevious: boolean) {
    const previous = packages[packages.length - 1]
    onPackagesChange([
      ...packages,
      {
        id: crypto.randomUUID(),
        name: 'New tier',
        includes: [],
        price: 0,
        item_ids: fromPrevious && previous?.item_ids ? [...previous.item_ids] : [],
      },
    ])
    setPopover(null)
  }

  function itemRow(item: ProposalLineItem, ariaPrefix: string) {
    const id = item.id as string
    // The same pool item can appear in several tiers; the popover is keyed by
    // the row instance so opening it in one tier doesn't open it everywhere.
    const rowKey = `${ariaPrefix}:${id}`
    return (
      <li key={id} className="relative flex items-center justify-between gap-2 py-1 text-sm">
        <span className="flex-1 text-gray-700">
          <InlineText value={item.description} disabled={disabled} ariaLabel={`${ariaPrefix} description`}
            onCommit={(description) => updateItem(id, { description })} />
        </span>
        {disabled ? (
          <span className="text-gray-500">{item.quantity} × {money(item.unit_price)}</span>
        ) : (
          <button
            type="button"
            className="rounded px-1 text-gray-500 hover:bg-gray-100"
            aria-label={`${item.quantity} × ${money(item.unit_price)}${item.unit ? ` per ${item.unit}` : ''}`}
            onClick={() => setPopover({ kind: 'item', itemId: id, rowKey })}
          >
            {item.quantity} × {money(item.unit_price)}{item.unit ? `/${item.unit}` : ''}
          </button>
        )}
        {popover?.kind === 'item' && popover.rowKey === rowKey && (
          <ItemPopover item={item} onChange={(patch) => updateItem(id, patch)} onClose={() => setPopover(null)} />
        )}
      </li>
    )
  }

  function tierCard(pkg: ProposalPackage) {
    const legacy = !pkg.item_ids
    const computed = packagePrice(pkg, lineItems)
    const overridden = pkg.price_override !== undefined
    const members = (pkg.item_ids ?? []).flatMap((id) => {
      const item = byId.get(id)
      return item ? [item] : []
    })
    return (
      <div
        key={pkg.id}
        data-testid={`tier-${pkg.id}`}
        className="relative rounded-lg border border-gray-200 p-4"
      >
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
        <p className="font-semibold text-gray-900">
          <InlineText value={pkg.name} disabled={disabled || legacy} ariaLabel={`Tier ${pkg.name} name`}
            onCommit={(name) => updatePackage(pkg.id, { name })} />
        </p>

        {disabled || legacy ? (
          <p className="mt-2 text-lg font-bold" style={{ color: 'var(--proposal-accent, #111827)' }}>
            {money(computed)}
          </p>
        ) : (
          <button
            type="button"
            aria-label="Set package price"
            className="mt-2 rounded text-lg font-bold hover:bg-gray-50"
            style={{ color: 'var(--proposal-accent, #111827)' }}
            onClick={() => setPopover({ kind: 'price', pkgId: pkg.id })}
          >
            {money(computed)}
          </button>
        )}
        {overridden && (
          <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
            Overridden
          </span>
        )}

        {popover?.kind === 'price' && popover.pkgId === pkg.id && (
          <div className="absolute z-30 mt-1 w-56 space-y-2 rounded-md border bg-white p-3 shadow-lg">
            <div className="space-y-1">
              <Label htmlFor="pkg-price">Package price</Label>
              <Input
                id="pkg-price"
                type="number"
                value={String(pkg.price_override ?? computed)}
                onChange={(e) => updatePackage(pkg.id, { price_override: toNumber(e.target.value) })}
              />
            </div>
            <Button type="button" size="sm" variant="outline" className="w-full"
              onClick={() => updatePackage(pkg.id, { price_override: undefined })}>
              Use computed sum
            </Button>
            <Button type="button" size="sm" className="w-full" onClick={() => setPopover(null)}>Done</Button>
          </div>
        )}

        {legacy ? (
          <>
            <ul className="mt-3 space-y-1 text-sm text-gray-700">
              {pkg.includes.map((line, i) => (
                <li key={i} className="flex gap-2"><span aria-hidden="true">✓</span><span>{line}</span></li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-gray-400">
              Legacy package — opens for editing after the one-time upgrade to itemized pricing.
            </p>
          </>
        ) : (
          <>
            <ul className="mt-3 space-y-1">
              {members.map((item) => itemRow(item, `Tier ${pkg.name} item`))}
            </ul>
            {!disabled && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => addItemToTier(pkg)}>
                  Add item
                </Button>
                <Button type="button" size="sm" variant="outline"
                  onClick={() => setPopover({ kind: 'members', pkgId: pkg.id })}>
                  Edit members
                </Button>
                <Button type="button" size="sm" variant="ghost"
                  onClick={() => onPackagesChange(packages.filter((p) => p.id !== pkg.id))}>
                  Remove tier
                </Button>
              </div>
            )}
            {popover?.kind === 'members' && popover.pkgId === pkg.id && (
              <div className="absolute z-30 mt-1 w-64 space-y-1 rounded-md border bg-white p-3 shadow-lg">
                <p className="text-xs font-medium text-gray-500">Members of {pkg.name}</p>
                {lineItems.filter((i) => i.id && i.optional !== true).map((item) => {
                  const id = item.id as string
                  const isMember = (pkg.item_ids ?? []).includes(id)
                  return (
                    <label key={id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={isMember}
                        aria-label={item.description}
                        onChange={() =>
                          updatePackage(pkg.id, {
                            item_ids: isMember
                              ? (pkg.item_ids ?? []).filter((x) => x !== id)
                              : [...(pkg.item_ids ?? []), id],
                          })
                        }
                      />
                      {item.description}
                    </label>
                  )
                })}
                <Button type="button" size="sm" className="w-full" onClick={() => setPopover(null)}>Done</Button>
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {(packages.length > 0 || !disabled) && (
        <section>
          <h2 className="mb-3 text-xl font-bold" style={{ color: 'var(--proposal-accent, #111827)' }}>
            Choose an option
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {packages.map((pkg) => tierCard(pkg))}
          </div>
          {!disabled && packages.length < 3 && (
            <div className="relative mt-3">
              <Button type="button" size="sm" variant="outline"
                onClick={() => setPopover(popover?.kind === 'add-tier' ? null : { kind: 'add-tier' })}>
                Add tier
              </Button>
              {popover?.kind === 'add-tier' && (
                <div className="absolute z-30 mt-1 flex w-56 flex-col gap-1 rounded-md border bg-white p-2 shadow-lg">
                  <Button type="button" size="sm" variant="ghost" onClick={() => addTier(false)}>
                    Empty tier
                  </Button>
                  {packages.length > 0 && packages[packages.length - 1].item_ids && (
                    <Button type="button" size="sm" variant="ghost" onClick={() => addTier(true)}>
                      Start from {packages[packages.length - 1].name}
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {(requiredItems.length > 0 || !disabled) && (
        <section>
          <h3 className="mb-2 text-lg font-semibold" style={{ color: 'var(--proposal-accent, #111827)' }}>
            What&apos;s included
          </h3>
          <ul className="divide-y">{requiredItems.map((item) => itemRow(item, 'Included item'))}</ul>
          {!disabled && (
            <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => addPoolItem(false)}>
              Add included item
            </Button>
          )}
        </section>
      )}

      {(optionalItems.length > 0 || !disabled) && (
        <section>
          <h3 className="mb-2 text-lg font-semibold" style={{ color: 'var(--proposal-accent, #111827)' }}>
            Optional add-ons
          </h3>
          <ul className="divide-y">{optionalItems.map((item) => itemRow(item, 'Add-on'))}</ul>
          {!disabled && (
            <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => addPoolItem(true)}>
              Add optional add-on
            </Button>
          )}
        </section>
      )}
    </div>
  )
}
