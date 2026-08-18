'use client'

import { useId, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EmptyState } from '@/components/ui/empty-state'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  createCapacityUnit,
  updateCapacityUnit,
  deleteCapacityUnit,
} from '@/actions/capacity'
import type { CapacityBlockout, CapacityUnit, CapacityUnitKind } from '@/lib/types'

interface CapacityUnitsClientProps {
  orgId: string
  initialUnits: CapacityUnit[]
  /** True for orgs below the business tier — render the upsell, not the editor. */
  locked?: boolean
}

interface GroupMeta {
  kind: CapacityUnitKind
  title: string
  noun: string
  addLabel: string
  placeholder: string
}

const GROUPS: GroupMeta[] = [
  { kind: 'mobile', title: 'Serving units', noun: 'serving unit', addLabel: 'Add serving unit', placeholder: 'e.g. Kart 1' },
  { kind: 'venue', title: 'Rooms', noun: 'room', addLabel: 'Add room', placeholder: 'e.g. Room #1' },
]

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Parse an ISO ymd string without the UTC-midnight timezone shift `new Date(str)` introduces. */
function parseYmd(s: string): { y: number; m: number; d: number } | null {
  const parts = s.split('-')
  if (parts.length !== 3) return null
  const [y, m, d] = parts.map(Number)
  if (!y || !m || !d) return null
  return { y, m, d }
}

/** "Aug 20", "Aug 20–22", or "Aug 30 – Sep 2". */
export function formatBlockoutRange(start: string, end: string): string {
  const a = parseYmd(start)
  const b = parseYmd(end)
  if (!a || !b) return `${start} – ${end}`
  const left = `${MONTHS[a.m - 1]} ${a.d}`
  if (a.y === b.y && a.m === b.m && a.d === b.d) return left
  if (a.y === b.y && a.m === b.m) return `${left}–${b.d}`
  return `${left} – ${MONTHS[b.m - 1]} ${b.d}`
}

const CHIP_CLASS =
  'inline-flex w-fit max-w-full items-center gap-1.5 whitespace-normal rounded-full bg-[var(--status-neutral-bg)] py-0.5 pl-2.5 pr-1 text-xs font-medium text-[var(--status-neutral-fg)]'

export function CapacityUnitsClient({ orgId, initialUnits, locked = false }: CapacityUnitsClientProps) {
  const [units, setUnits] = useState<CapacityUnit[]>(initialUnits)
  const [addingKind, setAddingKind] = useState<CapacityUnitKind | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<CapacityUnit | null>(null)

  if (locked) return <LockedPanel />

  const mobileCount = units.filter((u) => u.kind === 'mobile' && u.active).length
  const venueCount = units.filter((u) => u.kind === 'venue' && u.active).length

  async function run(action: () => Promise<void>) {
    setSaving(true)
    setError(null)
    try {
      await action()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleAdd(kind: CapacityUnitKind, name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    await run(async () => {
      const created = await createCapacityUnit(orgId, { name: trimmed, kind })
      setUnits((prev) => [...prev, created])
      setAddingKind(null)
    })
  }

  async function handleRename(id: string, name: string) {
    const prev = units
    setUnits((u) => u.map((x) => (x.id === id ? { ...x, name } : x)))
    await run(async () => {
      try {
        await updateCapacityUnit(orgId, id, { name })
      } catch (err) {
        setUnits(prev)
        throw err
      }
    })
  }

  async function handleToggleActive(id: string, active: boolean) {
    const prev = units
    setUnits((u) => u.map((x) => (x.id === id ? { ...x, active } : x)))
    await run(async () => {
      try {
        await updateCapacityUnit(orgId, id, { active })
      } catch (err) {
        setUnits(prev)
        throw err
      }
    })
  }

  async function handleBlockoutsChange(id: string, blockouts: CapacityBlockout[]) {
    const prev = units
    setUnits((u) => u.map((x) => (x.id === id ? { ...x, blockouts } : x)))
    await run(async () => {
      try {
        await updateCapacityUnit(orgId, id, { blockouts })
      } catch (err) {
        setUnits(prev)
        throw err
      }
    })
  }

  async function handleDelete(id: string) {
    const prev = units
    setUnits((u) => u.filter((x) => x.id !== id))
    await run(async () => {
      try {
        await deleteCapacityUnit(orgId, id)
      } catch (err) {
        setUnits(prev)
        throw err
      }
    })
  }

  return (
    <div className="max-w-2xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Resources &amp; capacity</h1>
        <p className="text-sm text-muted-foreground">
          Tell the pipeline how many carts and rooms you run, so it only warns you when a day is truly
          overbooked — not just busy.
        </p>
      </header>

      <div aria-live="polite" aria-atomic="true">
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {units.length === 0 ? (
        <Card>
          <CardContent className="py-2">
            <EmptyState
              title="No capacity units yet"
              description="Add your first cart — the pipeline uses this to know when you're overbooked."
              action={
                addingKind === 'mobile' ? null : (
                  <Button onClick={() => { setAddingKind('mobile'); setError(null) }}>
                    Add your first serving unit
                  </Button>
                )
              }
            />
            {addingKind === 'mobile' && (
              <div className="mx-auto mt-1 max-w-sm pb-4">
                <AddUnitForm
                  meta={GROUPS[0]}
                  saving={saving}
                  onSave={(name) => handleAdd('mobile', name)}
                  onCancel={() => setAddingKind(null)}
                />
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <p
            className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-foreground"
            data-slot="capacity-summary"
          >
            You can serve up to{' '}
            <span className="font-semibold tabular-nums">{mobileCount}</span>{' '}
            event{mobileCount === 1 ? '' : 's'} a day —{' '}
            <span className="font-semibold tabular-nums">{venueCount}</span> of them on-site.
          </p>

          {GROUPS.map((meta) => {
            const groupUnits = units.filter((u) => u.kind === meta.kind)
            return (
              <section
                key={meta.kind}
                role="group"
                aria-label={meta.title}
                className="space-y-3"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-[.04em] text-muted-foreground">
                    {meta.title}
                    {groupUnits.length > 0 && (
                      <span className="ml-1.5 font-normal tabular-nums">({groupUnits.length})</span>
                    )}
                  </h2>
                  {addingKind !== meta.kind && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setAddingKind(meta.kind); setError(null) }}
                    >
                      {meta.addLabel}
                    </Button>
                  )}
                </div>

                {addingKind === meta.kind && (
                  <Card>
                    <CardContent className="py-3">
                      <AddUnitForm
                        meta={meta}
                        saving={saving}
                        onSave={(name) => handleAdd(meta.kind, name)}
                        onCancel={() => setAddingKind(null)}
                      />
                    </CardContent>
                  </Card>
                )}

                {groupUnits.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No {meta.noun}s yet.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {groupUnits.map((u) => (
                      <UnitRow
                        key={u.id}
                        unit={u}
                        meta={meta}
                        saving={saving}
                        onRename={handleRename}
                        onToggleActive={handleToggleActive}
                        onBlockoutsChange={handleBlockoutsChange}
                        onRequestDelete={() => setPendingDelete(u)}
                      />
                    ))}
                  </div>
                )}
              </section>
            )
          })}
        </>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => { if (!open) setPendingDelete(null) }}
        title={`Delete ${pendingDelete?.name ?? 'this unit'}?`}
        description="This removes it from capacity planning. To keep its history but stop counting it, retire it instead."
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          const id = pendingDelete?.id
          setPendingDelete(null)
          if (id) void handleDelete(id)
        }}
      />
    </div>
  )
}

function AddUnitForm({
  meta,
  saving,
  onSave,
  onCancel,
}: {
  meta: GroupMeta
  saving: boolean
  onSave: (name: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const inputId = `add-${meta.kind}-name`

  function submit() {
    if (!name.trim()) return
    onSave(name)
    setName('')
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>New {meta.noun} name</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id={inputId}
          value={name}
          autoFocus
          placeholder={meta.placeholder}
          className="max-w-56"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); submit() }
            if (e.key === 'Escape') onCancel()
          }}
        />
        <Button onClick={submit} disabled={saving || !name.trim()}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  )
}

function UnitRow({
  unit,
  meta,
  saving,
  onRename,
  onToggleActive,
  onBlockoutsChange,
  onRequestDelete,
}: {
  unit: CapacityUnit
  meta: GroupMeta
  saving: boolean
  onRename: (id: string, name: string) => void
  onToggleActive: (id: string, active: boolean) => void
  onBlockoutsChange: (id: string, blockouts: CapacityBlockout[]) => void
  onRequestDelete: () => void
}) {
  const [name, setName] = useState(unit.name)
  const [addingBlockout, setAddingBlockout] = useState(false)

  function commitName() {
    const trimmed = name.trim()
    if (!trimmed) { setName(unit.name); return }
    if (trimmed !== unit.name) onRename(unit.id, trimmed)
  }

  function addBlockout(b: CapacityBlockout) {
    onBlockoutsChange(unit.id, [...unit.blockouts, b])
    setAddingBlockout(false)
  }

  function removeBlockout(index: number) {
    onBlockoutsChange(unit.id, unit.blockouts.filter((_, i) => i !== index))
  }

  const nameId = `unit-${unit.id}-name`

  return (
    <Card size="sm" className={unit.active ? undefined : 'opacity-70'}>
      <CardContent className="space-y-3 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            <Label htmlFor={nameId} className="sr-only">{meta.noun} name</Label>
            <Input
              id={nameId}
              value={name}
              aria-label={`${meta.noun} name`}
              className="h-8 max-w-56 font-medium"
              onChange={(e) => setName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur() }
                if (e.key === 'Escape') { setName(unit.name); (e.target as HTMLInputElement).blur() }
              }}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              role="switch"
              aria-checked={unit.active}
              disabled={saving}
              onClick={() => onToggleActive(unit.id, !unit.active)}
              className={
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 motion-reduce:transition-none ' +
                (unit.active
                  ? 'bg-[var(--status-confirmed-bg)] text-[var(--status-confirmed-fg)]'
                  : 'bg-[var(--status-neutral-bg)] text-[var(--status-neutral-fg)]')
              }
            >
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full bg-current"
              />
              {unit.active ? 'Active' : 'Retired'}
            </button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`Delete ${unit.name}`}
              disabled={saving}
              onClick={onRequestDelete}
            >
              <TrashIcon />
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          {unit.blockouts.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {unit.blockouts.map((b, i) => {
                const label = formatBlockoutRange(b.start, b.end)
                return (
                  <li key={`${b.start}-${b.end}-${i}`} className={CHIP_CLASS}>
                    <span>
                      {label}
                      {b.note ? <span className="text-muted-foreground"> · {b.note}</span> : null}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove block-out ${label}`}
                      disabled={saving}
                      onClick={() => removeBlockout(i)}
                      className="grid size-4 place-items-center rounded-full text-current outline-none hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
                    >
                      <span aria-hidden="true" className="text-[13px] leading-none">×</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {addingBlockout ? (
            <BlockoutForm
              saving={saving}
              onAdd={addBlockout}
              onCancel={() => setAddingBlockout(false)}
            />
          ) : (
            <Button
              size="xs"
              variant="ghost"
              className="text-muted-foreground"
              disabled={saving}
              onClick={() => setAddingBlockout(true)}
            >
              + Add block-out
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function BlockoutForm({
  saving,
  onAdd,
  onCancel,
}: {
  saving: boolean
  onAdd: (b: CapacityBlockout) => void
  onCancel: () => void
}) {
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [note, setNote] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const uid = useId()

  function submit() {
    if (!start || !end) { setErr('Pick a start and end date.'); return }
    if (start > end) { setErr('The start date must be on or before the end date.'); return }
    onAdd({ start, end, ...(note.trim() ? { note: note.trim() } : {}) })
  }

  return (
    <div className="space-y-2 rounded-lg border border-border p-2.5">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor={`${uid}-start`} className="text-xs">From</Label>
          <Input id={`${uid}-start`} type="date" value={start} className="max-w-40" onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${uid}-end`} className="text-xs">To</Label>
          <Input id={`${uid}-end`} type="date" value={end} className="max-w-40" onChange={(e) => setEnd(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${uid}-note`} className="text-xs">Note (optional)</Label>
          <Input id={`${uid}-note`} value={note} placeholder="maintenance" className="max-w-44" onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      {err && <p className="text-xs text-destructive" aria-live="polite">{err}</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={submit} disabled={saving || !start || !end}>Add block-out</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  )
}

function LockedPanel() {
  return (
    <div className="max-w-2xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Resources &amp; capacity</h1>
        <p className="text-sm text-muted-foreground">
          Model more than one cart or room so the pipeline knows your true daily ceiling.
        </p>
      </header>

      <Card>
        <CardContent className="space-y-4 py-5">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--status-pending-bg)] px-2.5 py-1 text-xs font-medium text-[var(--status-pending-fg)]">
            Business plan
          </span>
          <div className="space-y-2">
            <h2 className="text-base font-semibold">Multiple carts &amp; rooms is a Business-plan feature</h2>
            <p className="text-sm text-muted-foreground">
              On the Business plan you can list every serving unit and room you run, set block-out dates
              when one is unavailable, and mark a booking on-site. The pipeline then warns you only when a
              day genuinely exceeds your capacity — three carts means three Saturday events is fine, a fourth
              is the flag.
            </p>
          </div>
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            <li>• Count each cart and room toward a real daily ceiling</li>
            <li>• Block out maintenance or held dates per unit</li>
            <li>• Catch on-site overbooking a free cart would otherwise hide</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  )
}
