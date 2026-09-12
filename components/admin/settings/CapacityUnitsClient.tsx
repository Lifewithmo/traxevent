'use client'

import { useId, useState, type KeyboardEvent, type ReactNode } from 'react'
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
import {
  updateServiceableDays,
  updateResourceLabels,
  updateEventTypeProfiles,
} from '@/actions/capacity-config'
import { updateOpsBuffers } from '@/actions/ops-buffers'
import { kindLabel } from '@/lib/capacity/labels'
import { PACK_MINUTES, DRIVE_MINUTES, MAX_BUFFER_MINUTES } from '@/lib/event-ui'
import type { CapacityBlockout, CapacityUnit, CapacityUnitKind, Org } from '@/lib/types'

interface CapacityUnitsClientProps {
  orgId: string
  initialUnits: CapacityUnit[]
  /** The org's saved working-days pattern; absent ⇒ all 7 weekdays, no closures. */
  initialServiceableDays?: Org['serviceable_days']
  /** The org's saved kind vocabulary; absent per-kind ⇒ neutral defaults. */
  initialResourceLabels?: Org['resource_labels']
  /** The org's saved per-event-type resource profiles; absent ⇒ the default rule. */
  initialEventTypeProfiles?: Org['event_type_profiles']
  /** The org's saved pack/drive buffers; absent per-field ⇒ the 45m/30m constants. */
  initialOpsBuffers?: Org['ops_buffers']
  /** True for orgs below the business tier — render the upsell, not the editor. */
  locked?: boolean
}

type EventTypeProfile = NonNullable<Org['event_type_profiles']>[number]

interface GroupMeta {
  kind: CapacityUnitKind
  /** Category title, e.g. "Serving units" / "Carts". */
  title: string
  /** Singular noun, e.g. "serving unit" / "cart". */
  one: string
  /** Plural noun, e.g. "serving units" / "carts". */
  many: string
  addLabel: string
  placeholder: string
}

const GROUP_KINDS: CapacityUnitKind[] = ['mobile', 'venue']

const KIND_PLACEHOLDER: Record<CapacityUnitKind, string> = {
  mobile: 'e.g. Kart 1',
  venue: 'e.g. Room #1',
}

const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6]

const WEEKDAYS: { index: number; letter: string; name: string }[] = [
  { index: 0, letter: 'S', name: 'Sunday' },
  { index: 1, letter: 'M', name: 'Monday' },
  { index: 2, letter: 'T', name: 'Tuesday' },
  { index: 3, letter: 'W', name: 'Wednesday' },
  { index: 4, letter: 'T', name: 'Thursday' },
  { index: 5, letter: 'F', name: 'Friday' },
  { index: 6, letter: 'S', name: 'Saturday' },
]

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Category title from the plural noun: "serving units" → "Serving units". */
function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function metaFor(kind: CapacityUnitKind, labels: Org['resource_labels']): GroupMeta {
  const one = kindLabel({ resource_labels: labels }, kind, 1)
  const many = kindLabel({ resource_labels: labels }, kind, 2)
  return {
    kind,
    one,
    many,
    title: titleCase(many),
    addLabel: `Add ${one}`,
    placeholder: KIND_PLACEHOLDER[kind],
  }
}

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

export function CapacityUnitsClient({
  orgId,
  initialUnits,
  initialServiceableDays,
  initialResourceLabels,
  initialEventTypeProfiles,
  initialOpsBuffers,
  locked = false,
}: CapacityUnitsClientProps) {
  const [units, setUnits] = useState<CapacityUnit[]>(initialUnits)
  const [weekdays, setWeekdays] = useState<number[]>(
    initialServiceableDays?.weekdays ?? ALL_WEEKDAYS,
  )
  const [closures, setClosures] = useState<CapacityBlockout[]>(
    initialServiceableDays?.closures ?? [],
  )
  const [labels, setLabels] = useState<NonNullable<Org['resource_labels']>>(
    initialResourceLabels ?? {},
  )
  const [profiles, setProfiles] = useState<EventTypeProfile[]>(
    initialEventTypeProfiles ?? [],
  )
  const [addingProfile, setAddingProfile] = useState(false)
  const [addingClosure, setAddingClosure] = useState(false)
  const [addingKind, setAddingKind] = useState<CapacityUnitKind | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<CapacityUnit | null>(null)
  const openHeadingId = useId()

  // Pack/drive buffers are org-level day-of timing (job briefs + run sheets),
  // NOT part of the business-tier multi-resource feature — so the section stays
  // reachable on the locked upsell page and in the no-units-yet state alike.
  if (locked) {
    return (
      <LockedPanel>
        <OpsBuffersSection orgId={orgId} initialBuffers={initialOpsBuffers} />
      </LockedPanel>
    )
  }

  const mobileCount = units.filter((u) => u.kind === 'mobile' && u.active).length
  const venueCount = units.filter((u) => u.kind === 'venue' && u.active).length
  // On-site is capped by BOTH: every event needs a serving unit, and an on-site
  // one also needs a room. So the true on-site ceiling is the smaller of the two
  // — with 2 carts and 5 rooms you can still only serve 2 events, all on-site.
  const onSiteCount = Math.min(mobileCount, venueCount)

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

  // --- Serviceable days (weekly pattern + closures) ---------------------------
  // Both keys are always written together: the action replaces the whole
  // `serviceable_days` scalar, so omitting one would wipe it.
  async function saveServiceable(nextWeekdays: number[], nextClosures: CapacityBlockout[]) {
    const prevW = weekdays
    const prevC = closures
    setWeekdays(nextWeekdays)
    setClosures(nextClosures)
    await run(async () => {
      try {
        await updateServiceableDays(orgId, { weekdays: nextWeekdays, closures: nextClosures })
      } catch (err) {
        setWeekdays(prevW)
        setClosures(prevC)
        throw err
      }
    })
  }

  function toggleWeekday(index: number) {
    const next = weekdays.includes(index)
      ? weekdays.filter((d) => d !== index)
      : [...weekdays, index].sort((a, b) => a - b)
    void saveServiceable(next, closures)
  }

  function addClosure(b: CapacityBlockout) {
    setAddingClosure(false)
    void saveServiceable(weekdays, [...closures, b])
  }

  function removeClosure(index: number) {
    void saveServiceable(weekdays, closures.filter((_, i) => i !== index))
  }

  // --- Resource labels (operator vocabulary) ----------------------------------
  // The action replaces the whole `resource_labels` scalar, so we always send
  // the full merged map (every kind that has an override).
  async function saveLabel(kind: CapacityUnitKind, value: { one: string; many: string }) {
    const prev = labels
    const next: NonNullable<Org['resource_labels']> = { ...labels, [kind]: value }
    setLabels(next)
    await run(async () => {
      try {
        await updateResourceLabels(orgId, next)
      } catch (err) {
        setLabels(prev)
        throw err
      }
    })
  }

  // --- Event-type resource profiles -------------------------------------------
  // The action replaces the whole `event_type_profiles` scalar, so every save
  // sends the full array. Optimistic with rollback, mirroring saveLabel.
  async function saveProfiles(next: EventTypeProfile[]) {
    const prev = profiles
    setProfiles(next)
    await run(async () => {
      try {
        await updateEventTypeProfiles(orgId, next)
      } catch (err) {
        setProfiles(prev)
        throw err
      }
    })
  }

  function addProfile(p: EventTypeProfile) {
    setAddingProfile(false)
    void saveProfiles([...profiles, p])
  }

  function renameProfile(index: number, name: string) {
    const trimmed = name.trim()
    // Empty name is invalid (the action rejects it); the row reverts locally.
    if (!trimmed || trimmed === profiles[index]?.name) return
    void saveProfiles(profiles.map((p, i) => (i === index ? { ...p, name: trimmed } : p)))
  }

  function toggleProfileKind(index: number, key: 'needsMobile' | 'needsVenue') {
    void saveProfiles(
      profiles.map((p, i) => (i === index ? { ...p, [key]: !p[key] } : p)),
    )
  }

  function removeProfile(index: number) {
    void saveProfiles(profiles.filter((_, i) => i !== index))
  }

  const everyDayClosed = weekdays.length === 0
  const mobileMany = kindLabel({ resource_labels: labels }, 'mobile', 2)
  const venueMany = kindLabel({ resource_labels: labels }, 'venue', 2)
  const mobileOne = kindLabel({ resource_labels: labels }, 'mobile', 1)
  const venueOne = kindLabel({ resource_labels: labels }, 'venue', 1)

  return (
    <div className="max-w-2xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Resources &amp; capacity</h1>
        <p className="text-sm text-muted-foreground">
          Tell the pipeline how many {mobileMany} and {venueMany} you run, and which days you work, so
          it only warns you when a day is truly overbooked — not just busy.
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
              description={`Add your first ${metaFor('mobile', labels).one} — the pipeline uses this to know when you're overbooked.`}
              action={
                addingKind === 'mobile' ? null : (
                  <Button onClick={() => { setAddingKind('mobile'); setError(null) }}>
                    Add your first {metaFor('mobile', labels).one}
                  </Button>
                )
              }
            />
            {addingKind === 'mobile' && (
              <div className="mx-auto mt-1 max-w-sm pb-4">
                <AddUnitForm
                  meta={metaFor('mobile', labels)}
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
            <span className="font-semibold tabular-nums">{onSiteCount}</span> of them on-site.
          </p>

          {/* When you're open — weekly working pattern + closures. */}
          <section className="space-y-3" aria-labelledby={openHeadingId}>
            <div className="space-y-1">
              <h2
                id={openHeadingId}
                className="text-sm font-semibold uppercase tracking-[.04em] text-muted-foreground"
              >
                When you&apos;re open
              </h2>
              <p className="text-sm text-muted-foreground">
                The days you work. The outlook counts open capacity only on these days.
              </p>
            </div>

            <div role="group" aria-label="Days of the week you're open" className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((w) => {
                const on = weekdays.includes(w.index)
                return (
                  <button
                    key={w.index}
                    type="button"
                    aria-pressed={on}
                    aria-label={w.name}
                    disabled={saving}
                    onClick={() => toggleWeekday(w.index)}
                    className={
                      'grid size-9 place-items-center rounded-full text-sm font-semibold outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 motion-reduce:transition-none ' +
                      (on
                        ? 'bg-[var(--status-confirmed-bg)] text-[var(--status-confirmed-fg)]'
                        : 'bg-[var(--status-neutral-bg)] text-[var(--status-neutral-fg)]')
                    }
                  >
                    <span aria-hidden="true">{w.letter}</span>
                  </button>
                )
              })}
            </div>

            {everyDayClosed && (
              <p
                role="status"
                className="rounded-lg bg-[var(--status-pending-bg)] px-3 py-2 text-sm font-medium text-[var(--status-pending-fg)]"
              >
                You&apos;ve marked every day closed — the outlook will show no capacity.
              </p>
            )}

            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Closures</p>
              {closures.length > 0 && (
                <ul className="flex flex-wrap gap-1.5">
                  {closures.map((c, i) => {
                    const label = formatBlockoutRange(c.start, c.end)
                    return (
                      <li key={`${c.start}-${c.end}-${i}`} className={CHIP_CLASS}>
                        <span>
                          {label}
                          {c.note ? <span className="text-muted-foreground"> · {c.note}</span> : null}
                        </span>
                        <button
                          type="button"
                          aria-label={`Remove closure ${label}`}
                          disabled={saving}
                          onClick={() => removeClosure(i)}
                          className="grid size-4 place-items-center rounded-full text-current outline-none hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
                        >
                          <span aria-hidden="true" className="text-[13px] leading-none">×</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}

              {addingClosure ? (
                <BlockoutForm
                  saving={saving}
                  submitLabel="Add closure"
                  notePlaceholder="Holiday"
                  onAdd={addClosure}
                  onCancel={() => setAddingClosure(false)}
                />
              ) : (
                <Button
                  size="xs"
                  variant="ghost"
                  className="text-muted-foreground"
                  disabled={saving}
                  onClick={() => setAddingClosure(true)}
                >
                  + Add closure
                </Button>
              )}
            </div>
          </section>

          {GROUP_KINDS.map((kind) => {
            const meta = metaFor(kind, labels)
            const groupUnits = units.filter((u) => u.kind === meta.kind)
            return (
              <section
                key={meta.kind}
                role="group"
                aria-label={meta.title}
                className="space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <CategoryLabelHeader
                    kind={meta.kind}
                    title={meta.title}
                    one={meta.one}
                    many={meta.many}
                    count={groupUnits.length}
                    saving={saving}
                    onSave={saveLabel}
                  />
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
                    No {meta.many} yet.
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

          {/* Event types — which kinds a named type consumes (0/1 each). An
              unlisted type falls back to leadRequirement's default rule, so the
              hint below is required: an empty list = today's behavior, stated. */}
          <section className="space-y-3" aria-label="Event types">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-[.04em] text-muted-foreground">
                Event types
                {profiles.length > 0 && (
                  <span className="ml-1.5 font-normal tabular-nums">({profiles.length})</span>
                )}
              </h2>
              {!addingProfile && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setAddingProfile(true); setError(null) }}
                >
                  Add event type
                </Button>
              )}
            </div>

            <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              Types not listed use the default — a {mobileOne} always, a {venueOne} when on-site.
              A listed type overrides that: it consumes exactly the kinds you switch on.
            </p>

            {addingProfile && (
              <Card>
                <CardContent className="py-3">
                  <AddEventTypeForm
                    mobileOne={mobileOne}
                    venueOne={venueOne}
                    saving={saving}
                    onAdd={addProfile}
                    onCancel={() => setAddingProfile(false)}
                  />
                </CardContent>
              </Card>
            )}

            {profiles.length > 0 && (
              <div className="space-y-3">
                {profiles.map((p, i) => (
                  <EventTypeRow
                    key={`${p.name}-${i}`}
                    profile={p}
                    mobileOne={mobileOne}
                    venueOne={venueOne}
                    saving={saving}
                    onRename={(name) => renameProfile(i, name)}
                    onToggle={(key) => toggleProfileKind(i, key)}
                    onRemove={() => removeProfile(i)}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <OpsBuffersSection orgId={orgId} initialBuffers={initialOpsBuffers} />

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

// --- Day-of timing (org-default pack/drive buffers) ---------------------------

/** '' ⇒ cleared (fall back to the constant); else a whole 1..MAX_BUFFER_MINUTES minutes.
 *  The ceiling is the SHARED lib/event-ui constant the server action enforces —
 *  never a local literal, so the pre-flight check cannot drift from the action. */
function parseBufferField(raw: string): { ok: true; value?: number } | { ok: false } {
  const trimmed = raw.trim()
  if (!trimmed) return { ok: true }
  const n = Number(trimmed)
  if (!Number.isInteger(n) || n <= 0 || n > MAX_BUFFER_MINUTES) return { ok: false }
  return { ok: true, value: n }
}

/**
 * The two org-level buffer inputs behind the back-planned "Pack by / Leave by"
 * chips. Self-contained (own saving/error state) so it renders identically on
 * the locked upsell page, the empty state, and the full editor. Commits on
 * blur/Enter like the unit-name inputs; Escape reverts. The action replaces
 * the whole `ops_buffers` scalar, so both fields are always sent together and
 * a blank field clears its key (⇒ the 45m/30m constants).
 */
function OpsBuffersSection({
  orgId,
  initialBuffers,
}: {
  orgId: string
  initialBuffers?: Org['ops_buffers']
}) {
  const [savedBuffers, setSavedBuffers] = useState<NonNullable<Org['ops_buffers']>>({
    ...(initialBuffers?.pack_minutes !== undefined ? { pack_minutes: initialBuffers.pack_minutes } : {}),
    ...(initialBuffers?.drive_minutes !== undefined ? { drive_minutes: initialBuffers.drive_minutes } : {}),
  })
  const [pack, setPack] = useState(
    initialBuffers?.pack_minutes !== undefined ? String(initialBuffers.pack_minutes) : '',
  )
  const [drive, setDrive] = useState(
    initialBuffers?.drive_minutes !== undefined ? String(initialBuffers.drive_minutes) : '',
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const uid = useId()

  function revert() {
    setPack(savedBuffers.pack_minutes !== undefined ? String(savedBuffers.pack_minutes) : '')
    setDrive(savedBuffers.drive_minutes !== undefined ? String(savedBuffers.drive_minutes) : '')
    setError(null)
  }

  async function commit() {
    const packParsed = parseBufferField(pack)
    const driveParsed = parseBufferField(drive)
    if (!packParsed.ok || !driveParsed.ok) {
      setError(`Minutes must be a whole number between 1 and ${MAX_BUFFER_MINUTES} — or blank for the default.`)
      return
    }
    const next: NonNullable<Org['ops_buffers']> = {
      ...(packParsed.value !== undefined ? { pack_minutes: packParsed.value } : {}),
      ...(driveParsed.value !== undefined ? { drive_minutes: driveParsed.value } : {}),
    }
    if (
      next.pack_minutes === savedBuffers.pack_minutes &&
      next.drive_minutes === savedBuffers.drive_minutes
    ) {
      setError(null)
      return
    }
    setSaving(true)
    setError(null)
    try {
      await updateOpsBuffers(orgId, next)
      setSavedBuffers(next)
    } catch (err: unknown) {
      revert()
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.')
    } finally {
      setSaving(false)
    }
  }

  const fieldKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur() }
    if (e.key === 'Escape') { e.preventDefault(); revert() }
  }

  return (
    <section className="space-y-3" aria-labelledby={`${uid}-heading`}>
      <div className="space-y-1">
        <h2
          id={`${uid}-heading`}
          className="text-sm font-semibold uppercase tracking-[.04em] text-muted-foreground"
        >
          Day-of timing
        </h2>
        <p className="text-sm text-muted-foreground">
          Behind &quot;Pack by / Leave by&quot; on job briefs and run sheets — leave blank for the{' '}
          {PACK_MINUTES}m/{DRIVE_MINUTES}m defaults.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor={`${uid}-pack`} className="text-xs">Pack time (minutes)</Label>
          <Input
            id={`${uid}-pack`}
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_BUFFER_MINUTES}
            value={pack}
            placeholder={String(PACK_MINUTES)}
            disabled={saving}
            className="max-w-40"
            onChange={(e) => setPack(e.target.value)}
            onBlur={() => void commit()}
            onKeyDown={fieldKeyDown}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${uid}-drive`} className="text-xs">Drive time (minutes)</Label>
          <Input
            id={`${uid}-drive`}
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_BUFFER_MINUTES}
            value={drive}
            placeholder={String(DRIVE_MINUTES)}
            disabled={saving}
            className="max-w-40"
            onChange={(e) => setDrive(e.target.value)}
            onBlur={() => void commit()}
            onKeyDown={fieldKeyDown}
          />
        </div>
      </div>

      <div aria-live="polite" aria-atomic="true">
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </section>
  )
}

/** Inline-editable category label (the "Serving units" / "Rooms" group header). */
function CategoryLabelHeader({
  kind,
  title,
  one,
  many,
  count,
  saving,
  onSave,
}: {
  kind: CapacityUnitKind
  title: string
  one: string
  many: string
  count: number
  saving: boolean
  onSave: (kind: CapacityUnitKind, value: { one: string; many: string }) => void
}) {
  const [editing, setEditing] = useState(false)
  const [singular, setSingular] = useState(one)
  const [plural, setPlural] = useState(many)
  const uid = useId()

  function begin() {
    setSingular(one)
    setPlural(many)
    setEditing(true)
  }

  function commit() {
    const s = singular.trim()
    const p = plural.trim()
    if (!s || !p) { setSingular(one); setPlural(many); setEditing(false); return }
    if (s !== one || p !== many) onSave(kind, { one: s, many: p })
    setEditing(false)
  }

  function cancel() {
    setSingular(one)
    setPlural(many)
    setEditing(false)
  }

  if (editing) {
    return (
      <div
        className="flex flex-wrap items-end gap-2"
        // Commit when focus leaves the whole editor (blur to outside) — save on blur.
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) commit()
        }}
      >
        <div className="space-y-1">
          <Label htmlFor={`${uid}-one`} className="text-xs">Singular</Label>
          <Input
            id={`${uid}-one`}
            value={singular}
            autoFocus
            className="h-8 max-w-36"
            onChange={(e) => setSingular(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commit() }
              if (e.key === 'Escape') { e.preventDefault(); cancel() }
            }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${uid}-many`} className="text-xs">Plural</Label>
          <Input
            id={`${uid}-many`}
            value={plural}
            className="h-8 max-w-36"
            onChange={(e) => setPlural(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commit() }
              if (e.key === 'Escape') { e.preventDefault(); cancel() }
            }}
          />
        </div>
        <Button size="sm" onClick={commit} disabled={saving}>Save</Button>
        <Button size="sm" variant="ghost" onClick={cancel}>Cancel</Button>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={begin}
      aria-label={`Rename ${title} category`}
      className="group inline-flex items-center gap-1.5 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <h2 className="text-sm font-semibold uppercase tracking-[.04em] text-muted-foreground">
        {title}
        {count > 0 && (
          <span className="ml-1.5 font-normal tabular-nums">({count})</span>
        )}
      </h2>
      <PencilIcon />
    </button>
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
      <Label htmlFor={inputId}>New {meta.one} name</Label>
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
            <Label htmlFor={nameId} className="sr-only">{meta.one} name</Label>
            <Input
              id={nameId}
              value={name}
              aria-label={`${unit.name} — ${meta.one} name`}
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
              aria-label={`${unit.name} — ${unit.active ? 'active' : 'retired'}`}
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

/** A single needs-{kind} toggle pill — the weekday-pill idiom, AA status tokens. */
function KindTogglePill({
  pressed,
  label,
  ariaLabel,
  disabled,
  onToggle,
}: {
  pressed: boolean
  label: string
  ariaLabel: string
  disabled?: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onToggle}
      className={
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 motion-reduce:transition-none ' +
        (pressed
          ? 'bg-[var(--status-confirmed-bg)] text-[var(--status-confirmed-fg)]'
          : 'bg-[var(--status-neutral-bg)] text-[var(--status-neutral-fg)]')
      }
    >
      <span aria-hidden="true" className="text-current">{pressed ? '✓' : '+'}</span>
      needs {label}
    </button>
  )
}

/** An existing event-type profile: inline-editable name + two kind toggles + remove. */
function EventTypeRow({
  profile,
  mobileOne,
  venueOne,
  saving,
  onRename,
  onToggle,
  onRemove,
}: {
  profile: EventTypeProfile
  mobileOne: string
  venueOne: string
  saving: boolean
  onRename: (name: string) => void
  onToggle: (key: 'needsMobile' | 'needsVenue') => void
  onRemove: () => void
}) {
  const [name, setName] = useState(profile.name)
  const nameId = useId()

  function commitName() {
    const trimmed = name.trim()
    if (!trimmed) { setName(profile.name); return }
    if (trimmed !== profile.name) onRename(trimmed)
  }

  return (
    <Card size="sm">
      <CardContent className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
        <div className="min-w-0 flex-1 basis-40">
          <Label htmlFor={nameId} className="sr-only">Event type name</Label>
          <Input
            id={nameId}
            value={name}
            aria-label={`${profile.name} — event type name`}
            className="h-8 max-w-56 font-medium"
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur() }
              if (e.key === 'Escape') { setName(profile.name); (e.target as HTMLInputElement).blur() }
            }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <KindTogglePill
            pressed={profile.needsMobile}
            label={mobileOne}
            ariaLabel={`${profile.name} — needs ${mobileOne}`}
            disabled={saving}
            onToggle={() => onToggle('needsMobile')}
          />
          <KindTogglePill
            pressed={profile.needsVenue}
            label={venueOne}
            ariaLabel={`${profile.name} — needs ${venueOne}`}
            disabled={saving}
            onToggle={() => onToggle('needsVenue')}
          />
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`Remove event type ${profile.name}`}
            disabled={saving}
            onClick={onRemove}
          >
            <TrashIcon />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

/** The add-a-profile form: name + two kind toggles + Add/Cancel. */
function AddEventTypeForm({
  mobileOne,
  venueOne,
  saving,
  onAdd,
  onCancel,
}: {
  mobileOne: string
  venueOne: string
  saving: boolean
  onAdd: (p: EventTypeProfile) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [needsMobile, setNeedsMobile] = useState(true)
  const [needsVenue, setNeedsVenue] = useState(false)
  const inputId = useId()

  function submit() {
    const trimmed = name.trim()
    if (!trimmed) return
    onAdd({ name: trimmed, needsMobile, needsVenue })
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>Event type name</Label>
      <Input
        id={inputId}
        value={name}
        autoFocus
        placeholder="e.g. Wedding"
        className="max-w-56"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); submit() }
          if (e.key === 'Escape') onCancel()
        }}
      />
      <div className="flex flex-wrap items-center gap-1.5">
        <KindTogglePill
          pressed={needsMobile}
          label={mobileOne}
          ariaLabel={`needs ${mobileOne}`}
          onToggle={() => setNeedsMobile((v) => !v)}
        />
        <KindTogglePill
          pressed={needsVenue}
          label={venueOne}
          ariaLabel={`needs ${venueOne}`}
          onToggle={() => setNeedsVenue((v) => !v)}
        />
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={submit} disabled={saving || !name.trim()}>
          {saving ? 'Saving…' : 'Add'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  )
}

function BlockoutForm({
  saving,
  submitLabel = 'Add block-out',
  notePlaceholder = 'maintenance',
  onAdd,
  onCancel,
}: {
  saving: boolean
  submitLabel?: string
  notePlaceholder?: string
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
          <Input id={`${uid}-note`} value={note} placeholder={notePlaceholder} className="max-w-44" onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      {err && <p className="text-xs text-destructive" aria-live="polite">{err}</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={submit} disabled={saving || !start || !end}>{submitLabel}</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  )
}

function LockedPanel({ children }: { children?: ReactNode }) {
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

      {children}
    </div>
  )
}

function PencilIcon() {
  return (
    <svg
      className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
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
