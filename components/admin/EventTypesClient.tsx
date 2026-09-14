'use client'

import { useId, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { MoreHorizontal } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusPill } from '@/components/ui/status-pill'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Menu, MenuTrigger, MenuContent, MenuItem } from '@/components/ui/menu'
import {
  createEventTypeProfile,
  renameEventTypeProfile,
  mergeEventTypeProfiles,
  deleteEventTypeProfile,
  adoptEventTypesFromHistory,
} from '@/actions/event-type-profiles'
import { updateEventTypeProfiles } from '@/actions/capacity-config'
import type { EventTypeUsage } from '@/lib/crm/event-type-admin'
import type { EventTypeProfile } from '@/lib/types'

/*
 * Settings → Event types (event types inc 1, spec §5a).
 *
 * Composition (screen-composition skill):
 * - Job: keep the list of job types TRUE to the operator's actual business —
 *   adopt what history already proves, fix drift, keep the capacity policy
 *   attached to every type.
 * - Deciding value: the count of unadopted historical types. When it is > 0
 *   the adopt-from-history zone is the focal element with ONE primary action;
 *   at 0 the page rests on the canonical list.
 * - Order: drift to fix (adopt) → the canonical list (name → policy → usage →
 *   lifecycle) → the default-rule hint, persistent and last.
 * - Containers: the adopt zone is one bordered container (a PROPOSAL, visually
 *   distinct from the canon); list rows are the migrated Card size="sm" row
 *   idiom; the hint is a borderless tinted bar. Three weights, no card stack.
 *
 * Lifecycle routing (T1's contract): rename → renameEventTypeProfile (lead
 * backfill lives server-side; a whole-array save here would silently detach
 * history — the exact defect this increment kills). Toggle / reorder /
 * archive → whole-array updateEventTypeProfiles (order IS the display order).
 * Merge / delete / adopt → their dedicated guarded actions. Everything
 * mutating optimistically snapshots and rolls back; errors land in the ONE
 * aria-live region.
 */

interface KindLabels {
  /** Singular operator noun for the mobile kind, e.g. "cart". */
  mobileOne: string
  /** Singular operator noun for the venue kind, e.g. "room". */
  venueOne: string
}

interface EventTypesClientProps {
  orgId: string
  orgSlug: string
  initialProfiles: EventTypeProfile[]
  usage: EventTypeUsage
  kindLabels: KindLabels
}

interface AdoptRow {
  name: string
  count: number
  checked: boolean
  needsMobile: boolean
  needsVenue: boolean
}

/** Inference prefill (spec §5a): always a mobile unit; a venue when the
 *  majority of that type's history was on-site. */
function deriveAdoptRows(usage: EventTypeUsage): AdoptRow[] {
  return usage.unadopted.map((u) => ({
    name: u.name,
    count: u.count,
    checked: true,
    needsMobile: true,
    needsVenue: u.onsiteMajority,
  }))
}

function jobsLabel(n: number): string {
  if (n === 0) return 'No jobs'
  return n === 1 ? '1 job' : `${n} jobs`
}

const norm = (s: string) => s.trim().toLowerCase()

export function EventTypesClient({
  orgId,
  orgSlug,
  initialProfiles,
  usage,
  kindLabels,
}: EventTypesClientProps) {
  const router = useRouter()
  const [profiles, setProfiles] = useState<EventTypeProfile[]>(initialProfiles)
  const [adopt, setAdopt] = useState<AdoptRow[]>(() => deriveAdoptRows(usage))
  const [adding, setAdding] = useState(false)
  /** Which write is in flight — a profile's row key, or 'add'. Scopes the
   *  disable to the affected row/control instead of freezing the whole page. */
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [adoptBusy, setAdoptBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [adoptReceipt, setAdoptReceipt] = useState<{ created: number; adopted: number } | null>(null)
  const [pendingMerge, setPendingMerge] = useState<{ from: EventTypeProfile; into: EventTypeProfile } | null>(null)
  const [pendingDelete, setPendingDelete] = useState<EventTypeProfile | null>(null)
  const listHeadingId = useId()
  const adoptHeadingId = useId()

  // Fresh server props (after router.refresh()) replace the optimistic local
  // copies — the documented reset-state-from-props idiom, so adopted types
  // arrive with their real server-assigned ids.
  const [prevProps, setPrevProps] = useState({ initialProfiles, usage })
  if (prevProps.initialProfiles !== initialProfiles || prevProps.usage !== usage) {
    setPrevProps({ initialProfiles, usage })
    setProfiles(initialProfiles)
    setAdopt(deriveAdoptRows(usage))
  }

  const { mobileOne, venueOne } = kindLabels
  const checkedCount = adopt.filter((a) => a.checked).length

  /** The write lock. Every profile mutation stays SERIALIZED — the server
   *  contract is whole-array replace, and each op's optimistic snapshot/
   *  rollback assumes no interleaving — but only the row or control named by
   *  `key` disables while one is in flight. A click elsewhere during the
   *  (sub-second) flight is dropped before any optimistic update, so nothing
   *  moves that was never sent; the user's very next click goes through.
   *  Ref, not state: two clicks in one tick must both see the claim. */
  const savingRef = useRef(false)

  const rowKey = (p: EventTypeProfile): string => p.id ?? `legacy:${p.name}`

  /** Claim the lock for `key`; false means another write is in flight. */
  function begin(key: string): boolean {
    if (savingRef.current) return false
    savingRef.current = true
    setSavingKey(key)
    setError(null)
    return true
  }

  function end() {
    savingRef.current = false
    setSavingKey(null)
  }

  async function run(key: string, action: () => Promise<void>) {
    if (!begin(key)) {
      // The per-row scope leaves other rows' controls live while a write is in
      // flight — a dropped action (a confirmed Delete especially) must say so,
      // never vanish.
      setError('Still saving another change — try again in a moment.')
      return
    }
    try {
      await action()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.')
    } finally {
      end()
    }
  }

  /** A legacy entry saved before ids existed gains one through the idempotent
   *  create (which matches case-insensitively and never alters its policy). */
  async function ensureId(p: EventTypeProfile): Promise<string> {
    if (p.id) return p.id
    const revived = await createEventTypeProfile(orgId, {
      name: p.name,
      needsMobile: p.needsMobile,
      needsVenue: p.needsVenue,
    })
    return revived.id!
  }

  /** Whole-array persistence for order/policy/archive — optimistic w/ rollback,
   *  the disable scoped to the row that changed (`key`). The optimistic write
   *  happens INSIDE the locked action, so a click dropped by the lock moves
   *  nothing on screen it never sent. */
  async function saveProfiles(next: EventTypeProfile[], key: string) {
    await run(key, async () => {
      const prev = profiles
      setProfiles(next)
      try {
        await updateEventTypeProfiles(orgId, next)
        // Server-side, a whole-array save mints ids for legacy id-less entries —
        // refresh (matching rename/add/merge/adopt) so the reset-from-props
        // idiom pulls them back in, instead of re-minting on every toggle.
        router.refresh()
      } catch (err) {
        setProfiles(prev)
        throw err
      }
    })
  }

  function toggleKind(index: number, key: 'needsMobile' | 'needsVenue') {
    void saveProfiles(
      profiles.map((p, i) => (i === index ? { ...p, [key]: !p[key] } : p)),
      rowKey(profiles[index]),
    )
  }

  function toggleArchived(index: number) {
    void saveProfiles(
      profiles.map((p, i) => (i === index ? { ...p, archived: !p.archived } : p)),
      rowKey(profiles[index]),
    )
  }

  function move(index: number, delta: -1 | 1) {
    const target = index + delta
    if (target < 0 || target >= profiles.length) return
    const next = [...profiles]
    ;[next[index], next[target]] = [next[target], next[index]]
    void saveProfiles(next, rowKey(profiles[index]))
  }

  async function handleRename(index: number, rawName: string) {
    const target = profiles[index]
    const name = rawName.trim()
    if (!name || name === target.name) return
    await run(rowKey(target), async () => {
      const prev = profiles
      setProfiles(profiles.map((p, i) => (i === index ? { ...p, name } : p)))
      try {
        const id = await ensureId(target)
        await renameEventTypeProfile(orgId, id, name)
        setProfiles((cur) => cur.map((p, i) => (i === index ? { ...p, id } : p)))
        // The backfill may have adopted name-matching history — re-read usage.
        router.refresh()
      } catch (err) {
        setProfiles(prev)
        throw err
      }
    })
  }

  async function handleAdd(input: { name: string; needsMobile: boolean; needsVenue: boolean }) {
    const key = norm(input.name)
    if (profiles.some((p) => norm(p.name) === key)) {
      setError(`“${input.name}” is already on the list.`)
      return
    }
    await run('add', async () => {
      const created = await createEventTypeProfile(orgId, input)
      setProfiles((cur) => [...cur, created])
      setAdding(false)
      // A new profile may claim name-matching history from the unadopted pool.
      router.refresh()
    })
  }

  async function handleMerge(from: EventTypeProfile, into: EventTypeProfile) {
    await run(rowKey(from), async () => {
      const prev = profiles
      setProfiles(profiles.filter((p) => p !== from))
      try {
        const fromId = await ensureId(from)
        await mergeEventTypeProfiles(orgId, fromId, into.id!)
        router.refresh()
      } catch (err) {
        setProfiles(prev)
        throw err
      }
    })
  }

  async function handleDelete(target: EventTypeProfile) {
    await run(rowKey(target), async () => {
      const prev = profiles
      setProfiles(profiles.filter((p) => p !== target))
      try {
        const id = await ensureId(target)
        // Guard-as-return-value: an in-use type comes back {ok:false} with the
        // SERVER-verified count (this page's count can be stale), never a throw.
        const result = await deleteEventTypeProfile(orgId, id)
        if (!result.ok) {
          setProfiles(prev)
          setError(
            `Still in use — ${jobsLabel(result.usage).toLowerCase()} reference it. Archive or merge instead.`,
          )
          return
        }
      } catch (err) {
        setProfiles(prev)
        throw err
      }
    })
  }

  async function handleAdopt() {
    const entries = adopt
      .filter((a) => a.checked)
      .map(({ name, needsMobile, needsVenue }) => ({ name, needsMobile, needsVenue }))
    if (entries.length === 0) return
    setAdoptBusy(true)
    setError(null)
    try {
      const receipt = await adoptEventTypesFromHistory(orgId, entries)
      setAdoptReceipt(receipt)
      setAdopt((cur) => cur.filter((a) => !a.checked))
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.')
    } finally {
      setAdoptBusy(false)
    }
  }

  function setAdoptRow(name: string, patch: Partial<AdoptRow>) {
    setAdopt((cur) => cur.map((a) => (a.name === name ? { ...a, ...patch } : a)))
  }

  const mergeCount = pendingMerge?.from.id ? usage.byProfileId[pendingMerge.from.id] ?? 0 : null
  const trulyEmpty = profiles.length === 0 && adopt.length === 0

  return (
    <div className="max-w-2xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Event types</h1>
        <p className="text-sm text-muted-foreground">
          The kinds of jobs you take. Every picker — New Opportunity, the public form, the
          editors — reads this list, and each type carries its capacity policy.
        </p>
      </header>

      <div aria-live="polite" aria-atomic="true">
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {adoptReceipt && (
        <p
          role="status"
          className="rounded-lg bg-[var(--status-confirmed-bg)] px-3 py-2 text-sm font-medium text-[var(--status-confirmed-fg)]"
        >
          {adoptReceipt.created} event type{adoptReceipt.created === 1 ? '' : 's'} created —{' '}
          {adoptReceipt.adopted} job{adoptReceipt.adopted === 1 ? '' : 's'} classified.
        </p>
      )}

      {adopt.length > 0 && (
        <section
          aria-labelledby={adoptHeadingId}
          className="space-y-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10"
        >
          <div className="space-y-1">
            <h2
              id={adoptHeadingId}
              className="text-sm font-semibold uppercase tracking-[.04em] text-muted-foreground"
            >
              From your history
            </h2>
            <p className="text-base text-foreground">
              <span className="text-2xl font-bold tabular-nums">{adopt.length}</span>{' '}
              type{adopt.length === 1 ? '' : 's'} your past jobs already use{' '}
              {adopt.length === 1 ? 'is' : 'are'}n&apos;t on the list — adopt{' '}
              {adopt.length === 1 ? 'it' : 'them'} so that history keeps its policy through any
              rename.
            </p>
          </div>

          <ul className="divide-y divide-border/60">
            {adopt.map((a) => (
              <li key={a.name} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
                <label className="flex min-w-0 flex-1 basis-44 cursor-pointer items-center gap-2.5 text-sm font-medium">
                  <input
                    type="checkbox"
                    className="size-4 shrink-0 accent-[var(--primary)]"
                    checked={a.checked}
                    disabled={adoptBusy}
                    aria-label={`Adopt ${a.name}`}
                    onChange={(e) => setAdoptRow(a.name, { checked: e.target.checked })}
                  />
                  <span className="truncate">{a.name}</span>
                  <span className="whitespace-nowrap text-xs font-normal tabular-nums text-muted-foreground">
                    {jobsLabel(a.count)}
                  </span>
                </label>
                <div className="flex items-center gap-1.5">
                  <KindTogglePill
                    pressed={a.needsMobile}
                    label={mobileOne}
                    ariaLabel={`${a.name} — needs ${mobileOne}`}
                    disabled={adoptBusy}
                    onToggle={() => setAdoptRow(a.name, { needsMobile: !a.needsMobile })}
                  />
                  <KindTogglePill
                    pressed={a.needsVenue}
                    label={venueOne}
                    ariaLabel={`${a.name} — needs ${venueOne}`}
                    disabled={adoptBusy}
                    onToggle={() => setAdoptRow(a.name, { needsVenue: !a.needsVenue })}
                  />
                </div>
              </li>
            ))}
          </ul>

          <Button onClick={() => void handleAdopt()} disabled={adoptBusy || checkedCount === 0}>
            {adoptBusy
              ? 'Creating…'
              : `Create ${checkedCount} event type${checkedCount === 1 ? '' : 's'}`}
          </Button>
        </section>
      )}

      {trulyEmpty && !adding ? (
        <Card>
          <CardContent className="py-2">
            <EmptyState
              title="No event types yet"
              description="Name the kinds of jobs you take — every picker and the capacity radar read this list."
              action={
                <Button onClick={() => { setAdding(true); setError(null) }}>
                  Add your first event type
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <section className="space-y-3" aria-labelledby={listHeadingId}>
          <div className="flex items-center justify-between gap-2">
            <h2
              id={listHeadingId}
              className="text-sm font-semibold uppercase tracking-[.04em] text-muted-foreground"
            >
              On your list
              {profiles.length > 0 && (
                <span className="ml-1.5 font-normal tabular-nums">({profiles.length})</span>
              )}
            </h2>
            {!adding && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setAdding(true); setError(null) }}
              >
                Add event type
              </Button>
            )}
          </div>

          {adding && (
            <Card>
              <CardContent className="py-3">
                <AddEventTypeForm
                  mobileOne={mobileOne}
                  venueOne={venueOne}
                  saving={savingKey === 'add'}
                  onAdd={(input) => void handleAdd(input)}
                  onCancel={() => setAdding(false)}
                />
              </CardContent>
            </Card>
          )}

          {profiles.length === 0 && !trulyEmpty && !adding && (
            <p className="text-sm text-muted-foreground">
              Nothing on the list yet — adopt from your history above, or add one by hand.
            </p>
          )}

          {profiles.length > 0 && (
            <div className="space-y-3">
              {profiles.map((p, i) => (
                <EventTypeRow
                  // Name participates in the key so a rolled-back optimistic
                  // rename remounts the row with the reverted name.
                  key={`${p.id ?? 'legacy'}-${p.name}`}
                  profile={p}
                  first={i === 0}
                  last={i === profiles.length - 1}
                  jobs={p.id ? jobsLabel(usage.byProfileId[p.id] ?? 0) : null}
                  inUse={p.id ? (usage.byProfileId[p.id] ?? 0) > 0 : false}
                  mergeTargets={profiles.filter((t) => t !== p && t.id && !t.archived)}
                  mobileOne={mobileOne}
                  venueOne={venueOne}
                  // Scoped: only the row whose write is in flight disables
                  // (writes stay serialized in `run`, so unrelated rows'
                  // menus and pills never lock).
                  saving={savingKey === rowKey(p)}
                  onRename={(name) => void handleRename(i, name)}
                  onToggle={(key) => toggleKind(i, key)}
                  onToggleArchived={() => toggleArchived(i)}
                  onMove={(delta) => move(i, delta)}
                  onRequestMerge={(into) => setPendingMerge({ from: p, into })}
                  onRequestDelete={() => setPendingDelete(p)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
        Types not on this list use the default — a {mobileOne} always, a {venueOne} when
        on-site. A listed type consumes exactly the kinds you switch on, using the resources
        set up in{' '}
        <Link
          href={`/${orgSlug}/capacity`}
          className="font-medium text-foreground underline underline-offset-2"
        >
          Resources &amp; capacity
        </Link>
        .
      </p>

      <ConfirmDialog
        open={pendingMerge !== null}
        onOpenChange={(open) => { if (!open) setPendingMerge(null) }}
        title={`Merge “${pendingMerge?.from.name}” into “${pendingMerge?.into.name}”?`}
        description={
          mergeCount === null
            ? `Its jobs will be reclassified as “${pendingMerge?.into.name}”. This cannot be undone.`
            : `${mergeCount} ${mergeCount === 1 ? 'opportunity' : 'opportunities'} will be reclassified as “${pendingMerge?.into.name}”. This cannot be undone.`
        }
        confirmLabel="Merge"
        destructive
        onConfirm={() => {
          const merge = pendingMerge
          setPendingMerge(null)
          if (merge) void handleMerge(merge.from, merge.into)
        }}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => { if (!open) setPendingDelete(null) }}
        title={`Delete “${pendingDelete?.name}”?`}
        description="It has no jobs, so nothing is reclassified. This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          const target = pendingDelete
          setPendingDelete(null)
          if (target) void handleDelete(target)
        }}
      />
    </div>
  )
}

/** A single needs-{kind} toggle pill — the weekday-pill idiom, AA status tokens.
 *  (Migrated verbatim from the retired CapacityUnitsClient profiles section.) */
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

/** One event type: inline-editable name, policy pills, usage, lifecycle menu. */
function EventTypeRow({
  profile,
  first,
  last,
  jobs,
  inUse,
  mergeTargets,
  mobileOne,
  venueOne,
  saving,
  onRename,
  onToggle,
  onToggleArchived,
  onMove,
  onRequestMerge,
  onRequestDelete,
}: {
  profile: EventTypeProfile
  first: boolean
  last: boolean
  /** Display label for the usage count; null for a legacy id-less entry (unknowable). */
  jobs: string | null
  inUse: boolean
  mergeTargets: EventTypeProfile[]
  mobileOne: string
  venueOne: string
  saving: boolean
  onRename: (name: string) => void
  onToggle: (key: 'needsMobile' | 'needsVenue') => void
  onToggleArchived: () => void
  onMove: (delta: -1 | 1) => void
  onRequestMerge: (into: EventTypeProfile) => void
  onRequestDelete: () => void
}) {
  const [name, setName] = useState(profile.name)
  const nameId = useId()
  const deleteHintId = useId()

  function commitName() {
    const trimmed = name.trim()
    if (!trimmed) { setName(profile.name); return }
    if (trimmed !== profile.name) onRename(trimmed)
  }

  return (
    <Card size="sm" className={profile.archived ? 'opacity-70' : undefined}>
      <CardContent className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
        <div className="min-w-0 flex-1 basis-40">
          <Label htmlFor={nameId} className="sr-only">{profile.name} — event type name</Label>
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
          {profile.archived && <StatusPill tone="neutral">Archived</StatusPill>}
          {jobs !== null && (
            <span className="min-w-12 text-right text-xs tabular-nums text-muted-foreground">
              {jobs}
            </span>
          )}
          <Menu>
            <MenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`${profile.name} — actions`}
                  disabled={saving}
                />
              }
            >
              <MoreHorizontal />
            </MenuTrigger>
            <MenuContent className="min-w-48">
              <MenuItem disabled={first} onClick={() => onMove(-1)}>Move up</MenuItem>
              <MenuItem disabled={last} onClick={() => onMove(1)}>Move down</MenuItem>
              <div role="presentation" className="my-1 h-px bg-border" />
              <MenuItem onClick={onToggleArchived}>
                {profile.archived ? 'Restore' : 'Archive'}
              </MenuItem>
              {mergeTargets.length > 0 && (
                <>
                  <div role="presentation" className="my-1 h-px bg-border" />
                  {mergeTargets.map((t) => (
                    <MenuItem key={t.id} onClick={() => onRequestMerge(t)}>
                      Merge into “{t.name}”
                    </MenuItem>
                  ))}
                </>
              )}
              <div role="presentation" className="my-1 h-px bg-border" />
              <MenuItem
                className="text-destructive"
                disabled={inUse}
                aria-describedby={inUse ? deleteHintId : undefined}
                onClick={onRequestDelete}
              >
                Delete
              </MenuItem>
              {inUse && (
                // Inline, not a title tooltip: visible to touch and keyboard
                // users, and reaching AT through the item's aria-describedby.
                <p id={deleteHintId} className="px-2 pb-1 pt-0.5 text-xs text-muted-foreground">
                  In use — archive or merge instead
                </p>
              )}
            </MenuContent>
          </Menu>
        </div>
      </CardContent>
    </Card>
  )
}

/** The add form: name + two kind toggles + Add/Cancel. (Migrated from the
 *  retired CapacityUnitsClient section; now submits through the create action
 *  so the new entry comes back with its server-assigned id.) */
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
  onAdd: (input: { name: string; needsMobile: boolean; needsVenue: boolean }) => void
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
