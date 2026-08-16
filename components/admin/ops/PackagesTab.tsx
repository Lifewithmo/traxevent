'use client'

import { useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Menu, MenuTrigger, MenuContent, MenuItem } from '@/components/ui/menu'
import { StatusPill } from '@/components/ui/status-pill'
import { EmptyState } from '@/components/ui/empty-state'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { CatalogHealthRail, UNCOSTED_REASON_HELP } from '@/components/admin/ops/CatalogHealthRail'
import { createWorkPackage, updateWorkPackage, deleteWorkPackage } from '@/actions/work-packages'
import { formatMoney } from '@/lib/utils'
import { asQuantity, qtyValue, unitOptionsForResource } from '@/lib/ops/units'
import { computeCatalogCosting, type PackageCosting } from '@/lib/ops/catalog-costing'
import type { OpsResource, WorkPackage, WorkPackageLine, ChecklistTemplate } from '@/lib/types'

interface PackagesTabProps {
  orgId: string
  isAdmin: boolean
  packages: WorkPackage[]
  resources: OpsResource[]
  templates: ChecklistTemplate[]
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

/** Consumable materials at the package's declared capacity — NOT a cost and NOT a margin
 *  (labor carries no rate anywhere in the schema; equipment isn't consumed). See
 *  lib/ops/catalog-costing.ts. An uncosted package renders an em dash, never "$0.00". */
function MaterialsFigure({ c }: { c: PackageCosting }) {
  if (!c.costed) {
    return (
      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>Materials —</span>
        <span title={c.reason ? UNCOSTED_REASON_HELP[c.reason] : undefined}>
          <StatusPill tone="neutral">Not costed</StatusPill>
        </span>
      </div>
    )
  }
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      <span>Materials {formatMoney(c.materials)} · at {c.basis} guests · excludes labor</span>
      {c.gaps.length > 0 && (
        // costed with gaps: these ingredients HAVE a unit cost but no conversion
        // path to the line's unit, so they contribute nothing and the figure
        // understates. Never let that read as "cheap".
        <span title={`No unit conversion for ${c.gaps.join(', ')} — this figure understates the real materials.`}>
          <StatusPill tone="alert">{c.gaps.length} not costed</StatusPill>
        </span>
      )}
    </div>
  )
}

export function PackagesTab({ orgId, isAdmin, packages: initial, resources, templates, costing }: PackagesTabProps) {
  const [packages, setPackages] = useState(initial)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [pendingDelete, setPendingDelete] = useState<WorkPackage | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const resourceById = new Map(resources.map((r) => [r.id, r]))
  const consumables = resources.filter((r) => r.kind === 'consumable')
  const equipment = resources.filter((r) => r.kind !== 'consumable')

  const costingById = new Map(costing.map((c) => [c.id, c]))
  const initialById = new Map(initial.map((p) => [p.id, p]))

  // `costing` is derived server-side from the packages at page load. Anything
  // created or edited in this session is a NEW object (applyUpdate clones,
  // create appends), so referential identity cleanly separates "as the server
  // costed it" from "changed since" — recompute those locally with the same
  // pure module the server used rather than showing a stale figure.
  function costingFor(p: WorkPackage): PackageCosting {
    const server = initialById.get(p.id) === p ? costingById.get(p.id) : undefined
    return server ?? computeCatalogCosting([p], resources)[0]
  }
  const resolvedCosting = packages.map(costingFor)

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
      setDraft(null)
    } catch (err: unknown) {
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

  function edit(p: WorkPackage) {
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
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="min-w-0 flex-1 space-y-4">
        {error && <p className="text-sm text-destructive">{error}</p>}

        {packages.map((p) => (
          <Card key={p.id}>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="text-base">{p.name}</CardTitle>
                <MaterialsFigure c={costingFor(p)} />
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="font-semibold">{formatMoney(p.price)}</span>
                {p.max_guests !== undefined && <StatusPill tone="neutral">up to {p.max_guests} guests</StatusPill>}
                {isAdmin && (
                  <Menu>
                    <MenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${p.name}`} disabled={saving} />}>
                      <MoreHorizontal />
                    </MenuTrigger>
                    <MenuContent>
                      <MenuItem onClick={() => edit(p)}>Edit</MenuItem>
                      <MenuItem onClick={() => setPendingDelete(p)}>Delete</MenuItem>
                    </MenuContent>
                  </Menu>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {p.description && <p className="text-sm text-muted-foreground mb-2">{p.description}</p>}
              <ul className="text-sm text-foreground marker:text-muted-foreground list-disc pl-5">
                {p.lines.map((l, i) => <li key={i}>{lineSummary(l, resourceById)}{l.kind === 'labor' && ' (staffing later — recorded only)'}</li>)}
              </ul>
              {(p.checklist_template_ids?.length ?? 0) > 0 && (
                <p className="text-xs text-muted-foreground mt-2">
                  Checklists: {p.checklist_template_ids!.map((id) => templates.find((t) => t.id === id)?.name ?? id).join(', ')}
                </p>
              )}
            </CardContent>
          </Card>
        ))}

        {/* Exactly one "New package" affordance in either state: the empty state
            carries the CTA, otherwise the standalone button does. */}
        {packages.length === 0 && !draft && (
          <EmptyState
            title="No packages yet"
            description="Build your first offering — say an espresso bar priced for up to 100 guests."
            action={isAdmin ? <Button onClick={() => setDraft(EMPTY_DRAFT)}>New package</Button> : undefined}
          />
        )}

        {isAdmin && !draft && packages.length > 0 && (
          <Button onClick={() => setDraft(EMPTY_DRAFT)}>New package</Button>
        )}

        {isAdmin && draft && (
          <Card>
            <CardHeader><CardTitle className="text-base">{draft.id ? 'Edit package' : 'New package'}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="pkg-name">Name</Label>
                  <Input id="pkg-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="pkg-price">Price ($)</Label>
                  <Input id="pkg-price" type="number" step="0.01" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="pkg-guests">Max guests</Label>
                  <Input id="pkg-guests" type="number" value={draft.max_guests} onChange={(e) => setDraft({ ...draft, max_guests: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="pkg-desc">Description</Label>
                  <Input id="pkg-desc" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="pkg-scope">Customer-facing scope</Label>
                  <Input id="pkg-scope" value={draft.scope} onChange={(e) => setDraft({ ...draft, scope: e.target.value })} />
                </div>
                {/* Setup/teardown get their own row instead of sharing one cell. */}
                <div className="grid grid-cols-1 gap-3 sm:col-span-2 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="pkg-setup">Setup (min)</Label>
                    <Input id="pkg-setup" type="number" value={draft.setup_minutes} onChange={(e) => setDraft({ ...draft, setup_minutes: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="pkg-teardown">Teardown (min)</Label>
                    <Input id="pkg-teardown" type="number" value={draft.teardown_minutes} onChange={(e) => setDraft({ ...draft, teardown_minutes: e.target.value })} />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Lines</p>
                {draft.lines.map((line, i) => (
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
                      onClick={() => setDraft({ ...draft, lines: draft.lines.filter((_, idx) => idx !== i) })}>
                      ✕
                    </Button>
                  </div>
                ))}
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm"
                    onClick={() => setDraft({ ...draft, lines: [...draft.lines, { kind: 'consumable', resource_id: '', qty_per_guest: { qty: 0, unit: 'each' } }] })}>
                    Add consumable
                  </Button>
                  <Button variant="outline" size="sm"
                    onClick={() => setDraft({ ...draft, lines: [...draft.lines, { kind: 'equipment', resource_id: '', qty: 1 }] })}>
                    Add equipment
                  </Button>
                  <Button variant="outline" size="sm"
                    onClick={() => setDraft({ ...draft, lines: [...draft.lines, { kind: 'labor', role: '', count: 1 }] })}>
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
                      checked={draft.checklist_template_ids.includes(t.id)}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          checklist_template_ids: e.target.checked
                            ? [...draft.checklist_template_ids, t.id]
                            : draft.checklist_template_ids.filter((id) => id !== t.id),
                        })
                      }
                    />
                    {t.name} <span className="text-muted-foreground">({t.phase})</span>
                  </label>
                ))}
              </div>

              <div className="flex gap-2">
                <Button onClick={handleSave} disabled={saving || !draft.name.trim() || !linesComplete(draft.lines)}>Save package</Button>
                <Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {pendingDelete && (
          <ConfirmDialog
            open
            onOpenChange={(open) => { if (!open) setPendingDelete(null) }}
            title={`Delete “${pendingDelete.name}”?`}
            description={DELETE_WARNING}
            confirmLabel="Delete"
            destructive
            pending={saving}
            onConfirm={() => handleDelete(pendingDelete)}
          />
        )}
      </div>

      <CatalogHealthRail
        packages={packages}
        resources={resources}
        costing={resolvedCosting}
        className="w-full lg:w-72 lg:shrink-0"
      />
    </div>
  )
}
