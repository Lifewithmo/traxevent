'use client'

import { useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Menu, MenuTrigger, MenuContent, MenuItem } from '@/components/ui/menu'
import { StatusPill } from '@/components/ui/status-pill'
import { EmptyState } from '@/components/ui/empty-state'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { UNCOSTED_REASON_HELP } from '@/components/admin/ops/CatalogHealthRail'
import { createWorkPackage, updateWorkPackage, deleteWorkPackage } from '@/actions/work-packages'
import { cn, formatMoney } from '@/lib/utils'
import { asQuantity, qtyValue, unitOptionsForResource } from '@/lib/ops/units'
import { type PackageCosting } from '@/lib/ops/catalog-costing'
import type { OpsResource, WorkPackage, WorkPackageLine, ChecklistTemplate } from '@/lib/types'

interface PackagesTabProps {
  orgId: string
  isAdmin: boolean
  packages: WorkPackage[]
  /** State is lifted to CatalogClient so the KPI band, the health rail and the
   *  sibling tabs all see a create/edit/delete the moment it lands. */
  setPackages: React.Dispatch<React.SetStateAction<WorkPackage[]>>
  resources: OpsResource[]
  templates: ChecklistTemplate[]
  /** Derived by the shell from the same lifted `packages`, so it is never stale. */
  costing: PackageCosting[]
}

interface Draft {
  id?: string            // set when editing an existing package
  name: string
  description: string
  scope: string
  price: string
  max_guests: string
  setup_minutes: string
  teardown_minutes: string
  lines: WorkPackageLine[]
  checklist_template_ids: string[]
}

const EMPTY_DRAFT: Draft = {
  name: '', description: '', scope: '', price: '', max_guests: '',
  setup_minutes: '', teardown_minutes: '', lines: [], checklist_template_ids: [],
}

// The soft-delete warning, verbatim. There is no reverse index of ops plans, so
// deletion cannot be hard-blocked when a package is in use (handoff known gap) —
// re-derive and closeout throw 'Package no longer exists' after this.
const DELETE_WARNING =
  'Any events already set up with it will fail to re-derive lists or compute closeout ("Package no longer exists"). Only delete packages no upcoming event uses.'

function lineSummary(line: WorkPackageLine, resourceById: Map<string, OpsResource>): string {
  if (line.kind === 'labor') return `${line.role} × ${line.count}`
  const r = resourceById.get(line.resource_id)
  const name = r?.name ?? line.resource_id
  if (line.kind === 'consumable') {
    const per = asQuantity(line.qty_per_guest, r?.unit ?? 'each')
    const base = line.base_qty !== undefined ? asQuantity(line.base_qty, per.unit) : undefined
    return `${name}: ${per.qty} ${per.unit} × guests${base ? ` + ${base.qty} ${base.unit} base` : ''}`
  }
  return `${name} × ${line.qty}`
}

/** The single muted run under a package name: what it is made of, then how many
 *  checklists it drags onto an event. Empty `checklist_template_ids` is
 *  meaningful (every template for the industry runs) and is deliberately not
 *  counted here — only an explicit attachment is worth a row-level mention. */
function rowSummary(p: WorkPackage, resourceById: Map<string, OpsResource>): string {
  const parts = p.lines.map((l) => lineSummary(l, resourceById))
  const attached = p.checklist_template_ids?.length ?? 0
  if (attached > 0) parts.push(`${attached} ${attached === 1 ? 'checklist' : 'checklists'}`)
  return parts.join(' · ')
}

/** Every line has the fields it needs to be saved — gates the Save button. */
function linesComplete(lines: WorkPackageLine[]): boolean {
  return lines.every((l) => {
    if (l.kind === 'consumable') return l.resource_id !== '' && qtyValue(l.qty_per_guest) > 0
    if (l.kind === 'equipment') return l.resource_id !== '' && l.qty > 0
    return l.role.trim() !== '' && l.count > 0
  })
}

/** Apply a WorkPackageUpdate-shaped payload locally: null clears the field (mirrors Firestore's
 *  FieldValue.delete() semantics in lib/ops/work-packages.ts), undefined leaves it untouched. */
function applyUpdate(p: WorkPackage, updates: Record<string, unknown>): WorkPackage {
  const next = { ...p } as Record<string, unknown>
  for (const [k, v] of Object.entries(updates)) {
    if (v === null) delete next[k]
    else if (v !== undefined) next[k] = v
  }
  return next as unknown as WorkPackage
}

/** The shell always passes costing for every package it passes. This is the
 *  crash guard for the one frame where it might not, and it reads as "no figure
 *  yet" — never as a $0.00 package. */
function noFigureYet(p: WorkPackage): PackageCosting {
  return { id: p.id, price: p.price, costed: false, materials: 0, gaps: [] }
}

/** The excluded-ingredient sentence, visible to everyone. `gaps` names the
 *  ingredients this figure leaves out; it is populated on the uncosted branch
 *  too, where it is the whole story. Also carries the uncosted reason as real
 *  text — it used to be a title attribute on a non-interactive span, which no
 *  keyboard or touch user could reach. */
function materialsNote(c: PackageCosting): string | null {
  const excluded = c.gaps.length > 0 ? `Excluded: ${c.gaps.join(', ')}` : null
  if (!c.costed) {
    const reason = c.reason ? UNCOSTED_REASON_HELP[c.reason] : null
    return [reason, excluded].filter(Boolean).join(' · ') || null
  }
  return excluded ? `${excluded} — this figure understates the real materials.` : null
}

/** Consumable materials at the package's declared capacity — NOT a cost and NOT a
 *  margin (labor carries no rate anywhere in the schema; equipment isn't consumed).
 *  See lib/ops/catalog-costing.ts. A real right-aligned figure paired with the
 *  price, with its basis beneath it; an uncosted package renders an em dash and
 *  never "$0.00". */
function MaterialsFigure({ c }: { c: PackageCosting }) {
  if (!c.costed) {
    return (
      <>
        <span className="text-[13px] font-semibold tabular-nums text-muted-foreground">—</span>
        <span className="mt-0.5 block">
          <StatusPill tone="neutral">Not costed</StatusPill>
        </span>
      </>
    )
  }
  return (
    <>
      <span className="text-[13px] font-semibold tabular-nums text-foreground">{formatMoney(c.materials)}</span>
      <span className="block text-[11px] text-muted-foreground">at {c.basis} guests</span>
      {c.gaps.length > 0 && (
        // Costed but incomplete: these ingredients contribute nothing, so the
        // figure understates. "{n} not costed" collided with the "Not costed"
        // pill above, which means the opposite thing.
        <span className="mt-0.5 block">
          <StatusPill tone="alert">
            {c.gaps.length} {c.gaps.length === 1 ? 'ingredient' : 'ingredients'} excluded
          </StatusPill>
        </span>
      )}
    </>
  )
}

function GroupHeader({ label, count, urgent }: { label: string; count: number; urgent: boolean }) {
  return (
    <div
      className={cn(
        // Everything above a group header already ends in a border-b, so it
        // carries only its own bottom rule.
        'border-b px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.1em]',
        urgent
          ? 'border-destructive/25 bg-destructive/5 text-destructive'
          : 'border-border bg-muted text-muted-foreground'
      )}
    >
      {label} · {count}
    </div>
  )
}

export function PackagesTab({ orgId, isAdmin, packages, setPackages, resources, templates, costing }: PackagesTabProps) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [pendingDelete, setPendingDelete] = useState<WorkPackage | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The Sheet's popup stays mounted through its slide-out animation. Gating its
  // children on `draft` alone emptied the panel the instant it closed, so what
  // slid off screen was a blank card. Every path that clears `draft` hands the
  // outgoing copy to `exitingDraft` first, and the panel renders from that until
  // Base UI reports the animation finished. State, not a ref: a ref read during
  // render is not a render input, and an effect only runs after the empty frame
  // has already painted — which is the bug.
  const [exitingDraft, setExitingDraft] = useState<Draft | null>(null)
  const sheetDraft = draft ?? exitingDraft

  const resourceById = new Map(resources.map((r) => [r.id, r]))
  const consumables = resources.filter((r) => r.kind === 'consumable')
  const equipment = resources.filter((r) => r.kind !== 'consumable')

  const costingById = new Map(costing.map((c) => [c.id, c]))
  const rows = packages.map((p) => ({ p, c: costingById.get(p.id) ?? noFigureYet(p) }))

  // Cost health, not schema order: the packages with no materials figure are the
  // operator's next decision, so they lead. Mirrors the Vendors ledger, where the
  // to-confirm group sits above the settled ones.
  const groups = [
    { key: 'uncosted', label: 'Needs costing', urgent: true, rows: rows.filter((r) => !r.c.costed) },
    { key: 'costed', label: 'Costed', urgent: false, rows: rows.filter((r) => r.c.costed) },
  ].filter((g) => g.rows.length > 0)

  function setLine(i: number, line: WorkPackageLine) {
    setDraft((d) => d && { ...d, lines: d.lines.map((l, idx) => (idx === i ? line : l)) })
  }

  function lineUnit(line: Extract<WorkPackageLine, { kind: 'consumable' }>): string {
    if (typeof line.qty_per_guest === 'object') return line.qty_per_guest.unit
    return resourceById.get(line.resource_id)?.unit ?? 'each'
  }

  // CreateWorkPackageInput has no null variants — omit unset optional fields entirely.
  function toCreateInput(d: Draft) {
    return {
      name: d.name.trim(),
      price: Number(d.price || 0),
      lines: d.lines,
      ...(d.description.trim() ? { description: d.description.trim() } : {}),
      ...(d.scope.trim() ? { scope: d.scope.trim() } : {}),
      ...(d.max_guests !== '' ? { max_guests: Number(d.max_guests) } : {}),
      ...(d.setup_minutes !== '' ? { setup_minutes: Number(d.setup_minutes) } : {}),
      ...(d.teardown_minutes !== '' ? { teardown_minutes: Number(d.teardown_minutes) } : {}),
      ...(d.checklist_template_ids.length > 0 ? { checklist_template_ids: d.checklist_template_ids } : {}),
    }
  }

  // WorkPackageUpdate treats null as "delete this field" — a cleared optional field must send
  // null, not be omitted, or editing can never remove a previously-set value.
  function toUpdateInput(d: Draft) {
    return {
      name: d.name.trim(),
      price: Number(d.price || 0),
      lines: d.lines,
      description: d.description.trim() ? d.description.trim() : null,
      scope: d.scope.trim() ? d.scope.trim() : null,
      max_guests: d.max_guests !== '' ? Number(d.max_guests) : null,
      setup_minutes: d.setup_minutes !== '' ? Number(d.setup_minutes) : null,
      teardown_minutes: d.teardown_minutes !== '' ? Number(d.teardown_minutes) : null,
      checklist_template_ids: d.checklist_template_ids.length > 0 ? d.checklist_template_ids : null,
    }
  }

  async function handleSave() {
    if (!draft || !draft.name.trim() || !linesComplete(draft.lines)) return
    setSaving(true); setError(null)
    try {
      if (draft.id) {
        const updates = toUpdateInput(draft)
        await updateWorkPackage(orgId, draft.id, updates)
        setPackages((prev) => prev.map((p) => (p.id === draft.id ? applyUpdate(p, updates) : p)))
      } else {
        const created = await createWorkPackage(orgId, toCreateInput(draft))
        setPackages((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
      }
      closeEditor(draft)
    } catch (err: unknown) {
      // Deliberately leaves `draft` set: the editor stays open with the typed
      // values intact, and the message renders inside it (see SheetBody).
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(p: WorkPackage) {
    setSaving(true); setError(null)
    try {
      await deleteWorkPackage(orgId, p.id)
      setPackages((prev) => prev.filter((x) => x.id !== p.id))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setSaving(false)
    }
  }

  /** The one way out of the editor. It hands the draft to `exitingDraft` so the
   *  panel still has something to render while it slides away, and it drops the
   *  error with it — that error belongs to the editing session, and leaving it
   *  behind would surface it on the page as if the delete path had failed. */
  function closeEditor(outgoing: Draft | null) {
    setExitingDraft(outgoing)
    setDraft(null)
    setError(null)
  }

  function newDraft() {
    setError(null)
    setDraft(EMPTY_DRAFT)
  }

  function edit(p: WorkPackage) {
    setError(null)
    setDraft({
      id: p.id,
      name: p.name,
      description: p.description ?? '',
      scope: p.scope ?? '',
      price: String(p.price),
      max_guests: p.max_guests !== undefined ? String(p.max_guests) : '',
      setup_minutes: p.setup_minutes !== undefined ? String(p.setup_minutes) : '',
      teardown_minutes: p.teardown_minutes !== undefined ? String(p.teardown_minutes) : '',
      lines: p.lines.map((l): WorkPackageLine => {
        if (l.kind !== 'consumable') return l
        const unit = typeof l.qty_per_guest === 'object' ? l.qty_per_guest.unit : (resourceById.get(l.resource_id)?.unit ?? 'each')
        return {
          ...l,
          qty_per_guest: asQuantity(l.qty_per_guest, unit),
          ...(l.base_qty !== undefined ? { base_qty: asQuantity(l.base_qty, unit) } : {}),
        }
      }),
      checklist_template_ids: p.checklist_template_ids ?? [],
    })
  }

  return (
    <div className="space-y-4">
      {/* The delete path's error surface. While the editor is open the same
          message renders inside the Sheet instead (the Sheet is modal, so
          anything out here is behind a backdrop and marked inert) — the two are
          gated on opposite sides of `draft` so the message can never render
          twice at once. */}
      {error && draft === null && <p role="alert" className="text-sm text-destructive">{error}</p>}

      {/* Exactly one "New package" affordance in either state: the empty state
          carries the CTA, otherwise this toolbar does. */}
      {isAdmin && packages.length > 0 && (
        <div className="flex justify-end">
          <Button size="sm" onClick={newDraft}>New package</Button>
        </div>
      )}

      {packages.length === 0 ? (
        <EmptyState
          title="No packages yet"
          description="Build your first offering — like an espresso bar priced for up to 100 guests."
          action={isAdmin ? <Button onClick={newDraft}>New package</Button> : undefined}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {/* Two right-aligned money columns are ambiguous without headings.
              aria-hidden because each figure carries its own sr-only label —
              this is the sighted-user copy, gated to md like the Vendors ledger. */}
          <div
            aria-hidden
            className="hidden items-baseline gap-3 border-b border-border px-3 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-[.06em] text-muted-foreground md:flex"
          >
            <span className="min-w-0 flex-1">Package</span>
            <span className="w-20 shrink-0 text-right sm:w-24">Price</span>
            <span className="w-32 shrink-0 text-right sm:w-40">Materials</span>
            {/* w-7 == the `icon-sm` trigger below (size-7). At w-8 the heading
                row ran 4px wider than the column it labels. */}
            {isAdmin && <span className="w-7 shrink-0" />}
          </div>

          {groups.map((group) => (
            <div key={group.key}>
              <GroupHeader label={group.label} count={group.rows.length} urgent={group.urgent} />
              {group.rows.map(({ p, c }) => {
                const note = materialsNote(c)
                return (
                  <div key={p.id} className="border-b border-border/60 px-3 py-2.5">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-[13px] font-medium text-foreground">{p.name}</span>
                          {p.max_guests !== undefined && <StatusPill tone="neutral">up to {p.max_guests} guests</StatusPill>}
                        </div>
                        {/* The attached-checklist count rides in the same run as
                            the lines. The card list named the templates on their
                            own line; a ledger row can't carry that, but "which
                            events run extra checklists" must not become invisible
                            until someone opens the editor. */}
                        <p className="truncate text-xs text-muted-foreground">
                          {rowSummary(p, resourceById)}
                        </p>
                      </div>
                      <div className="w-20 shrink-0 text-right sm:w-24">
                        {/* The visible column heading is aria-hidden, so each figure
                            carries its own label. Punctuated so it never collides
                            textually with the heading it mirrors. */}
                        <span className="sr-only">Price: </span>
                        <span className="text-[13px] font-semibold tabular-nums text-[var(--money-green)]">{formatMoney(p.price)}</span>
                      </div>
                      <div className="w-32 shrink-0 text-right sm:w-40">
                        <span className="sr-only">Materials: </span>
                        <MaterialsFigure c={c} />
                      </div>
                      {isAdmin && (
                        <Menu>
                          {/* shrink-0: without it the trigger is the only flex
                              child that can give, so a narrow viewport squashed
                              it below 28px and clipped its icon. */}
                          <MenuTrigger
                            className="shrink-0"
                            render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${p.name}`} disabled={saving} />}
                          >
                            <MoreHorizontal />
                          </MenuTrigger>
                          <MenuContent>
                            <MenuItem onClick={() => edit(p)}>Edit</MenuItem>
                            <MenuItem onClick={() => setPendingDelete(p)}>Delete</MenuItem>
                          </MenuContent>
                        </Menu>
                      )}
                    </div>
                    {note && <p className="mt-1 text-[11px] text-muted-foreground">{note}</p>}
                  </div>
                )
              })}
            </div>
          ))}

          {/* One disclosure for the column, not a clause buried in every row.
              Equipment is excluded as well as labor — the module only ever
              counts consumables. */}
          <p className="bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
            Materials counts consumable ingredients at each package&rsquo;s guest capacity. Excludes labor and equipment.
          </p>
        </div>
      )}

      {/* The editor is a right-side panel, not a form appended below the list:
          with a dozen packages, editing the first used to render the form
          ~2000px below it with no scroll, no focus move and no link to the row. */}
      <Sheet
        open={isAdmin && draft !== null}
        onOpenChange={(open) => { if (!open) closeEditor(draft) }}
        // Base UI keeps the popup mounted for its exit animation and calls this
        // once the animation has finished — the point at which the outgoing
        // draft is finally safe to drop.
        onOpenChangeComplete={(open) => { if (!open) setExitingDraft(null) }}
      >
        <SheetContent className="sm:max-w-xl">
          {sheetDraft && (
            <>
              <SheetHeader>
                {/* Deliberately not `Edit {draft.name}`: the row behind carries that
                    name, and rendering it twice makes every name query ambiguous. */}
                <SheetTitle>{sheetDraft.id ? 'Edit package' : 'New package'}</SheetTitle>
                <SheetDescription>
                  Lines drive the prep list on every event and the materials figure in the ledger.
                </SheetDescription>
              </SheetHeader>

              <SheetBody className="space-y-4">
                {/* A failed save leaves the editor open, so this is the only place
                    the operator can actually see why. The page-level <p> is behind
                    the backdrop and inert; before this, Save simply re-enabled and
                    nothing on screen changed. Gated on `draft` (not `sheetDraft`)
                    so it is never on screen at the same time as the page-level one. */}
                {error && draft !== null && (
                  <p role="alert" className="text-sm text-destructive">{error}</p>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="pkg-name">Name</Label>
                    <Input id="pkg-name" value={sheetDraft.name} onChange={(e) => setDraft((d) => d && { ...d, name: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="pkg-price">Price ($)</Label>
                    <Input id="pkg-price" type="number" step="0.01" value={sheetDraft.price} onChange={(e) => setDraft((d) => d && { ...d, price: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="pkg-guests">Max guests</Label>
                    <Input id="pkg-guests" type="number" value={sheetDraft.max_guests} onChange={(e) => setDraft((d) => d && { ...d, max_guests: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="pkg-desc">Description</Label>
                    <Input id="pkg-desc" value={sheetDraft.description} onChange={(e) => setDraft((d) => d && { ...d, description: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="pkg-scope">Customer-facing scope</Label>
                    <Input id="pkg-scope" value={sheetDraft.scope} onChange={(e) => setDraft((d) => d && { ...d, scope: e.target.value })} />
                  </div>
                  {/* Setup/teardown get their own row instead of sharing one cell. */}
                  <div className="grid grid-cols-1 gap-3 sm:col-span-2 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="pkg-setup">Setup (min)</Label>
                      <Input id="pkg-setup" type="number" value={sheetDraft.setup_minutes} onChange={(e) => setDraft((d) => d && { ...d, setup_minutes: e.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor="pkg-teardown">Teardown (min)</Label>
                      <Input id="pkg-teardown" type="number" value={sheetDraft.teardown_minutes} onChange={(e) => setDraft((d) => d && { ...d, teardown_minutes: e.target.value })} />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Lines</p>
                  {sheetDraft.lines.map((line, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2">
                      {line.kind === 'consumable' && (
                        <>
                          <select
                            aria-label={`Consumable ${i + 1} resource`}
                            value={line.resource_id}
                            onChange={(e) => {
                              const unit = resourceById.get(e.target.value)?.unit ?? 'each'
                              setLine(i, {
                                ...line,
                                resource_id: e.target.value,
                                qty_per_guest: { qty: qtyValue(line.qty_per_guest), unit },
                                ...(line.base_qty !== undefined ? { base_qty: { qty: qtyValue(line.base_qty), unit } } : {}),
                              })
                            }}
                            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                          >
                            <option value="">Pick a consumable…</option>
                            {consumables.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                          </select>
                          <Input
                            aria-label={`Consumable ${i + 1} qty per guest`}
                            type="number" step="0.01" className="w-24" placeholder="per guest"
                            value={qtyValue(line.qty_per_guest) || ''}
                            onChange={(e) => setLine(i, { ...line, qty_per_guest: { qty: Number(e.target.value), unit: lineUnit(line) } })}
                          />
                          <select
                            aria-label={`Consumable ${i + 1} unit`}
                            value={lineUnit(line)}
                            onChange={(e) => setLine(i, {
                              ...line,
                              qty_per_guest: { qty: qtyValue(line.qty_per_guest), unit: e.target.value },
                              ...(line.base_qty !== undefined ? { base_qty: { qty: qtyValue(line.base_qty), unit: e.target.value } } : {}),
                            })}
                            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                          >
                            {(resourceById.has(line.resource_id)
                              ? unitOptionsForResource(resourceById.get(line.resource_id)!)
                              : ['each']
                            ).map((u) => <option key={u} value={u}>{u}</option>)}
                          </select>
                          <span className="text-sm text-muted-foreground">× guests</span>
                          <Input
                            aria-label={`Consumable ${i + 1} base qty`}
                            type="number" step="0.01" className="w-20" placeholder="base"
                            value={line.base_qty !== undefined ? qtyValue(line.base_qty) : ''}
                            onChange={(e) => {
                              const v = e.target.value
                              const { base_qty: _drop, ...rest } = line
                              setLine(i, v === '' ? rest : { ...rest, base_qty: { qty: Number(v), unit: lineUnit(line) } })
                            }}
                          />
                        </>
                      )}
                      {line.kind === 'equipment' && (
                        <>
                          <select
                            aria-label={`Equipment ${i + 1} resource`}
                            value={line.resource_id}
                            onChange={(e) => setLine(i, { ...line, resource_id: e.target.value })}
                            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                          >
                            <option value="">Pick equipment…</option>
                            {equipment.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                          </select>
                          <Input
                            aria-label={`Equipment ${i + 1} qty`}
                            type="number" className="w-20"
                            value={line.qty || ''}
                            onChange={(e) => setLine(i, { ...line, qty: Number(e.target.value) })}
                          />
                        </>
                      )}
                      {line.kind === 'labor' && (
                        <>
                          <Input
                            aria-label={`Labor ${i + 1} role`}
                            placeholder="barista" className="w-40"
                            value={line.role}
                            onChange={(e) => setLine(i, { ...line, role: e.target.value })}
                          />
                          <Input
                            aria-label={`Labor ${i + 1} count`}
                            type="number" className="w-20"
                            value={line.count || ''}
                            onChange={(e) => setLine(i, { ...line, count: Number(e.target.value) })}
                          />
                          <span className="text-xs text-muted-foreground">recorded only — staffing is a later phase</span>
                        </>
                      )}
                      <Button variant="ghost" size="sm" aria-label={`Remove line ${i + 1}`}
                        onClick={() => setDraft((d) => d && { ...d, lines: d.lines.filter((_, idx) => idx !== i) })}>
                        ✕
                      </Button>
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm"
                      onClick={() => setDraft((d) => d && { ...d, lines: [...d.lines, { kind: 'consumable', resource_id: '', qty_per_guest: { qty: 0, unit: 'each' } }] })}>
                      Add consumable
                    </Button>
                    <Button variant="outline" size="sm"
                      onClick={() => setDraft((d) => d && { ...d, lines: [...d.lines, { kind: 'equipment', resource_id: '', qty: 1 }] })}>
                      Add equipment
                    </Button>
                    <Button variant="outline" size="sm"
                      onClick={() => setDraft((d) => d && { ...d, lines: [...d.lines, { kind: 'labor', role: '', count: 1 }] })}>
                      Add labor
                    </Button>
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-sm font-medium">Attached checklists</p>
                  <p className="text-xs text-muted-foreground">None selected = every template for your industry runs on events with this package.</p>
                  {templates.map((t) => (
                    <label key={t.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        aria-label={`Attach ${t.name}`}
                        checked={sheetDraft.checklist_template_ids.includes(t.id)}
                        onChange={(e) =>
                          setDraft((d) => d && {
                            ...d,
                            checklist_template_ids: e.target.checked
                              ? [...d.checklist_template_ids, t.id]
                              : d.checklist_template_ids.filter((id) => id !== t.id),
                          })
                        }
                      />
                      {t.name} <span className="text-muted-foreground">({t.phase})</span>
                    </label>
                  ))}
                </div>
              </SheetBody>

              <SheetFooter>
                <Button variant="outline" onClick={() => closeEditor(draft)} disabled={saving}>Cancel</Button>
                <Button onClick={handleSave} disabled={saving || !sheetDraft.name.trim() || !linesComplete(sheetDraft.lines)}>Save package</Button>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Always mounted, like both sibling tabs. Mounting it conditionally tore
          the Dialog out in the same commit that closed it, so Base UI never got
          to restore focus to the row's trigger and keyboard focus fell to
          <body>. `title` needs a null fallback now that the component outlives
          `pendingDelete`; it only ever paints during the close animation.
          `description` is the verbatim soft-delete warning either way. */}
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => { if (!open) setPendingDelete(null) }}
        title={pendingDelete ? `Delete “${pendingDelete.name}”?` : 'Delete package?'}
        description={DELETE_WARNING}
        confirmLabel="Delete"
        destructive
        pending={saving}
        onConfirm={() => { if (pendingDelete) handleDelete(pendingDelete) }}
      />
    </div>
  )
}
