'use client'

// The job: find this family and check them in before the line grows.
//
// Deciding value: the searched family's rows and their in/out state. Everything
// else — date, print, counts — is quiet chrome around the search → row → tap
// loop. Sticky search on top, one inline summary line (no tile stack), family-
// grouped rows with 44px targets, and no silent optimism: every custody write
// shows pending → confirmed → failed-with-retry, and every confirmed write gets
// an ~8s undo the server verifies (still the latest action?) and reverses from
// its own history — the client only ever sends an operation reference.

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusPill } from '@/components/ui/status-pill'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
  checkInMember,
  checkInFamily,
  checkOutMember,
  checkOutFamily,
  undoCheckinChanges,
} from '@/actions/checkins'
import type {
  CheckinRosterMember,
  CheckinUndoChange,
  CustodyCheckinRecord,
} from '@/actions/checkins'

interface CheckinClientProps {
  orgId: string
  eventId: string
  orgSlug: string
  eventSlug: string
  date: string
  members: CheckinRosterMember[]
  checkins: CustodyCheckinRecord[]
  guardianMode: boolean
  memberLabel: string
}

type RowPhase =
  | { kind: 'pending' }
  | { kind: 'failed'; retry: () => void }

interface FamilyGroup {
  family_id: string
  family_name: string
  balance_due: number
  registering_parent: string
  emergency_contact_name: string
  members: CheckinRosterMember[]
}

interface CheckoutTarget {
  member: CheckinRosterMember
  record: CustodyCheckinRecord
}

interface CheckoutIntent {
  /** 'family' = header check-out-all: every listed sibling is in scope, no toggle. */
  kind: 'single' | 'family'
  group: FamilyGroup
  primary: CheckoutTarget
  siblings: CheckoutTarget[]
}

interface UndoState {
  label: string
  changes: CheckinUndoChange[]
  failed?: boolean
  /** The server rejected the undo because the record changed on another station. Informational — no retry. */
  stale?: boolean
}

/**
 * Undo references: (recordId, latest server-stamped history-entry id) per
 * record the action wrote. The server restores from its OWN history — no
 * record data ever travels back from the client.
 */
function undoChangesOf(records: CustodyCheckinRecord[]): CheckinUndoChange[] {
  return records.flatMap((r) => {
    const last = r.history?.[r.history.length - 1]
    return last?.id ? [{ recordId: r.id, entryId: last.id }] : []
  })
}

function fmtTime(iso?: string): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function fmtMoney(n: number): string {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })
}

export function CheckinClient({
  orgId,
  eventId,
  orgSlug,
  eventSlug,
  date,
  members,
  checkins: initialCheckins,
  guardianMode,
  memberLabel,
}: CheckinClientProps) {
  const router = useRouter()
  const [isNavigating, startNavigation] = useTransition()
  const [checkins, setCheckins] = useState<CustodyCheckinRecord[]>(initialCheckins)
  const [rowPhase, setRowPhase] = useState<Record<string, RowPhase>>({})
  const [search, setSearch] = useState('')
  const [undo, setUndo] = useState<UndoState | null>(null)
  const [undoBusy, setUndoBusy] = useState(false)
  const [checkoutIntent, setCheckoutIntent] = useState<CheckoutIntent | null>(null)
  const [familyOutConfirm, setFamilyOutConfirm] = useState<{ group: FamilyGroup; targets: CheckoutTarget[] } | null>(null)
  const [dateSwitchConfirm, setDateSwitchConfirm] = useState<string | null>(null)
  const [guardianName, setGuardianName] = useState('')
  const [guardianPick, setGuardianPick] = useState<string | null>(null)
  const [includeSiblings, setIncludeSiblings] = useState(false)

  // Keeps the dialog copy stable while the close animation plays.
  const lastIntent = useRef(checkoutIntent)
  if (checkoutIntent !== null) lastIntent.current = checkoutIntent

  const byMember = useMemo(
    () => new Map(checkins.map((c) => [c.member_id, c])),
    [checkins]
  )

  // Counts derived from the roster join so they always sum to members.length
  // (ignores orphaned checkin records for members no longer on the roster).
  const rosterRecords = members.map((m) => byMember.get(m.member_id))
  const checkedIn = rosterRecords.filter((c) => c?.status === 'in').length
  const checkedOut = rosterRecords.filter((c) => c?.status === 'out').length
  const expected = rosterRecords.filter((c) => !c).length
  const failedCount = Object.values(rowPhase).filter((p) => p.kind === 'failed').length

  // Members arrive pre-sorted by family then name (server-side); grouping just
  // folds the flat list back into family sections in that order.
  const families = useMemo(() => {
    const byId = new Map<string, FamilyGroup>()
    const groups: FamilyGroup[] = []
    for (const m of members) {
      let g = byId.get(m.family_id)
      if (!g) {
        g = {
          family_id: m.family_id,
          family_name: m.family_name,
          balance_due: m.family_balance_due,
          registering_parent: m.registering_parent,
          emergency_contact_name: m.emergency_contact_name,
          members: [],
        }
        byId.set(m.family_id, g)
        groups.push(g)
      }
      g.members.push(m)
    }
    return groups
  }, [members])

  const query = search.trim().toLowerCase()
  const searching = query.length >= 2
  const visibleFamilies = useMemo(() => {
    if (!searching) return families
    return families.filter(
      (f) =>
        f.family_name.toLowerCase().includes(query) ||
        f.members.some((m) => `${m.first_name} ${m.last_name}`.toLowerCase().includes(query))
    )
  }, [families, searching, query])

  // ~8s undo window; a failed undo pins the snackbar until retried or dismissed.
  useEffect(() => {
    if (!undo || undo.failed || undoBusy) return
    const t = setTimeout(() => setUndo(null), 8000)
    return () => clearTimeout(t)
  }, [undo, undoBusy])

  function navigateToDate(newDate: string) {
    // page.tsx keys this component by date, so navigation resets all local state.
    startNavigation(() => router.push(`/${orgSlug}/${eventSlug}/checkin?date=${newDate}`))
  }

  function changeDate(newDate: string) {
    if (!newDate || newDate === date) return
    // The date-keyed remount discards in-flight saves, failed-write retries, and
    // any open undo window — never silently. Confirm before leaving that state.
    const pendingCount = Object.values(rowPhase).filter((p) => p.kind === 'pending').length
    if (pendingCount > 0 || failedCount > 0 || undo !== null) {
      setDateSwitchConfirm(newDate)
      return
    }
    navigateToDate(newDate)
  }

  function setPhases(ids: string[], phase: RowPhase | null) {
    setRowPhase((prev) => {
      const next = { ...prev }
      for (const id of ids) {
        if (phase) next[id] = phase
        else delete next[id]
      }
      return next
    })
  }

  function isPendingAny(ids: string[]) {
    return ids.some((id) => rowPhase[id]?.kind === 'pending')
  }

  function applyRecords(records: CustodyCheckinRecord[]) {
    setCheckins((prev) => {
      const byId = new Map(prev.map((c) => [c.id, c]))
      for (const r of records) byId.set(r.id, r)
      return [...byId.values()]
    })
  }

  async function runCheckIn(ms: CheckinRosterMember[]) {
    const ids = ms.map((m) => m.member_id)
    if (ms.length === 0 || isPendingAny(ids)) return
    setPhases(ids, { kind: 'pending' })
    try {
      const records =
        ms.length === 1
          ? [
              await checkInMember(orgId, eventId, {
                date,
                memberId: ms[0].member_id,
                familyId: ms[0].family_id,
                memberName: `${ms[0].first_name} ${ms[0].last_name}`,
              }),
            ]
          : await checkInFamily(orgId, eventId, {
              date,
              familyId: ms[0].family_id,
              members: ms.map((m) => ({
                memberId: m.member_id,
                memberName: `${m.first_name} ${m.last_name}`,
              })),
            })
      applyRecords(records)
      setPhases(ids, null)
      const changes = undoChangesOf(records)
      if (changes.length > 0) {
        setUndo({
          label:
            ms.length === 1
              ? `${ms[0].first_name} checked in`
              : `${ms[0].family_name} — ${ms.length} checked in`,
          changes,
        })
      }
    } catch {
      setPhases(ids, { kind: 'failed', retry: () => runCheckIn(ms) })
    }
  }

  async function runCheckOut(targets: CheckoutTarget[], guardian: string | undefined, unlisted: boolean) {
    const ids = targets.map((t) => t.member.member_id)
    if (targets.length === 0 || isPendingAny(ids)) return
    setPhases(ids, { kind: 'pending' })
    try {
      const records =
        targets.length === 1
          ? [
              await checkOutMember(orgId, eventId, targets[0].record.id, guardian, {
                unlistedGuardian: unlisted,
              }),
            ]
          : await checkOutFamily(orgId, eventId, {
              recordIds: targets.map((t) => t.record.id),
              guardianPickupName: guardian,
              unlistedGuardian: unlisted,
            })
      applyRecords(records)
      setPhases(ids, null)
      const changes = undoChangesOf(records)
      if (changes.length > 0) {
        setUndo({
          label:
            targets.length === 1
              ? `${targets[0].member.first_name} checked out`
              : `${targets[0].member.family_name} — ${targets.length} checked out`,
          changes,
        })
      }
    } catch {
      setPhases(ids, { kind: 'failed', retry: () => runCheckOut(targets, guardian, unlisted) })
    }
  }

  function inTargets(group: FamilyGroup): CheckoutTarget[] {
    return group.members
      .map((m) => ({ member: m, record: byMember.get(m.member_id) }))
      .filter((t): t is CheckoutTarget => t.record?.status === 'in')
  }

  function openGuardianDialog(intent: CheckoutIntent) {
    setGuardianName('')
    setGuardianPick(null)
    setIncludeSiblings(false)
    setCheckoutIntent(intent)
  }

  function requestCheckOut(member: CheckinRosterMember, record: CustodyCheckinRecord, group: FamilyGroup) {
    if (!guardianMode) {
      runCheckOut([{ member, record }], undefined, false)
      return
    }
    const siblings = inTargets(group).filter((t) => t.member.member_id !== member.member_id)
    openGuardianDialog({ kind: 'single', group, primary: { member, record }, siblings })
  }

  function requestFamilyCheckOut(group: FamilyGroup) {
    const targets = inTargets(group)
    if (targets.length === 0) return
    if (!guardianMode) {
      // Still ONE explicit confirmation for the bulk action.
      setFamilyOutConfirm({ group, targets })
      return
    }
    openGuardianDialog({ kind: 'family', group, primary: targets[0], siblings: targets.slice(1) })
  }

  async function handleUndo() {
    if (!undo || undoBusy || undo.stale) return
    setUndoBusy(true)
    try {
      const result = await undoCheckinChanges(orgId, eventId, undo.changes)
      // Both arms return the server's authoritative records: the restored state
      // when the undo applied, the CURRENT state when another station wrote in
      // between (nothing was undone) — either way, reconcile the rows to it.
      setCheckins((prev) => {
        const byId = new Map(prev.map((c) => [c.id, c]))
        undo.changes.forEach((ch, i) => {
          const rec = result.records[i]
          if (rec) byId.set(ch.recordId, rec)
          else byId.delete(ch.recordId)
        })
        return [...byId.values()]
      })
      if (result.ok) setUndo(null)
      else setUndo({ label: 'Record changed on another device — undo cancelled', changes: [], stale: true })
    } catch {
      setUndo((u) => (u ? { ...u, failed: true } : u))
    } finally {
      setUndoBusy(false)
    }
  }

  // ---- Guardian dialog derived state -------------------------------------
  const intent = checkoutIntent ?? lastIntent.current
  const quickPicks = intent
    ? [
        { name: intent.group.registering_parent, role: 'parent' },
        { name: intent.group.emergency_contact_name, role: 'emergency contact' },
      ].filter((p, i, arr) => p.name && arr.findIndex((q) => q.name === p.name) === i)
    : []
  const dialogTargets = intent
    ? intent.kind === 'family' || includeSiblings
      ? [intent.primary, ...intent.siblings]
      : [intent.primary]
    : []
  const trimmedGuardian = guardianName.trim()
  // Free-typed name that matches no listed adult → logged as an exception.
  const guardianUnlisted =
    trimmedGuardian.length > 0 &&
    !quickPicks.some((p) => p.name.toLowerCase() === trimmedGuardian.toLowerCase())

  function confirmGuardianCheckOut() {
    if (!checkoutIntent || !trimmedGuardian) return
    const targets = dialogTargets
    const unlisted = guardianUnlisted
    setCheckoutIntent(null)
    runCheckOut(targets, trimmedGuardian, unlisted)
  }

  // ---- Rendering ----------------------------------------------------------

  function renderMemberRow(m: CheckinRosterMember, group: FamilyGroup) {
    const record = byMember.get(m.member_id)
    const status = record?.status
    const phase = rowPhase[m.member_id]
    const missingForms = m.missing_form_names.length

    let action: React.ReactNode
    if (phase?.kind === 'pending') {
      action = (
        <Button size="touch" variant="outline" className="min-w-28" disabled aria-busy>
          Saving…
        </Button>
      )
    } else if (phase?.kind === 'failed') {
      action = (
        <Button size="touch" variant="destructive" className="min-w-28" onClick={phase.retry}>
          Retry
        </Button>
      )
    } else if (record && status === 'in') {
      action = (
        <Button size="touch" variant="outline" className="min-w-28" onClick={() => requestCheckOut(m, record, group)}>
          Check out
        </Button>
      )
    } else if (record && status === 'out') {
      action = (
        <Button size="touch" variant="outline" className="min-w-28" onClick={() => runCheckIn([m])}>
          Check in again
        </Button>
      )
    } else {
      action = (
        <Button size="touch" className="min-w-28" onClick={() => runCheckIn([m])}>
          Check in
        </Button>
      )
    }

    return (
      <div key={m.member_id} className="flex items-center justify-between gap-3 px-3 py-2">
        <div className="min-w-0 space-y-1">
          <p className="leading-tight font-medium">
            {m.first_name} {m.last_name}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {m.allergy_text && (
              <StatusPill tone="alert" className="max-w-52 overflow-hidden">
                <span className="min-w-0 truncate">{m.allergy_text}</span>
              </StatusPill>
            )}
            {missingForms > 0 && (
              <StatusPill tone="pending">
                {missingForms === 1 ? `${m.missing_form_names[0]} missing` : `${missingForms} forms missing`}
              </StatusPill>
            )}
            {status === 'in' && (
              <StatusPill tone="confirmed">In {fmtTime(record?.checked_in_at)}</StatusPill>
            )}
            {status === 'out' && (
              <StatusPill tone="neutral">
                Out {fmtTime(record?.checked_out_at)}
                {record?.guardian_pickup_name ? ` · ${record.guardian_pickup_name}` : ''}
              </StatusPill>
            )}
            {!status && <span className="text-xs text-muted-foreground">Not arrived</span>}
            {phase?.kind === 'failed' && (
              <span className="text-xs font-medium text-destructive">Didn&apos;t save</span>
            )}
          </div>
        </div>
        <div className="shrink-0">{action}</div>
      </div>
    )
  }

  function renderFamilyHeader(g: FamilyGroup) {
    const notIn = g.members.filter((m) => byMember.get(m.member_id)?.status !== 'in')
    const inCount = g.members.length - notIn.length
    const ids = g.members.map((m) => m.member_id)
    const bulkPending = isPendingAny(ids)

    let bulk: React.ReactNode = null
    if (notIn.length >= 2) {
      bulk = (
        <Button size="touch" disabled={bulkPending} onClick={() => runCheckIn(notIn)}>
          {bulkPending ? 'Saving…' : `Check in all (${notIn.length})`}
        </Button>
      )
    } else if (inCount >= 2) {
      bulk = (
        <Button size="touch" variant="outline" disabled={bulkPending} onClick={() => requestFamilyCheckOut(g)}>
          {bulkPending ? 'Saving…' : 'Check out all'}
        </Button>
      )
    }

    return (
      <div className="flex items-center justify-between gap-2 bg-muted/40 px-3 py-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <p className="text-sm font-semibold">{g.family_name}</p>
          {g.balance_due > 0 && <StatusPill tone="alert">${fmtMoney(g.balance_due)} due</StatusPill>}
        </div>
        {bulk}
      </div>
    )
  }

  const intentNames = dialogTargets.map((t) => t.member.first_name).join(', ')

  return (
    <div className="p-5 pb-24 space-y-3">
      {/* Utility row — scrolls away; the sticky search below is the working surface. */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Label htmlFor="date" className="text-xs text-muted-foreground">
            Date
          </Label>
          <Input
            id="date"
            type="date"
            value={date}
            onChange={(e) => changeDate(e.target.value)}
            className="h-9 w-40"
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          render={
            <a
              href={`/${orgSlug}/${eventSlug}/checkin/manifest?date=${date}`}
              target="_blank"
              rel="noopener noreferrer"
            />
          }
        >
          Print manifest
        </Button>
      </div>

      {/* Sticky search + one-line summary (B3: no tile stack above the roster).
          z-20 + solid bg: the event spine header is sticky top-0 z-10 in the same
          scroll container, so on scroll this bar docks OVER it — under line
          pressure the working surface wins the top edge, not the identity. */}
      <div className="sticky top-0 z-20 -mx-5 space-y-1.5 border-b bg-background px-5 pt-1.5 pb-2">
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          enterKeyHint="search"
          aria-label="Search the roster"
          placeholder={`Find ${memberLabel.toLowerCase()} or family…`}
          className="h-11 text-base"
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground" aria-live="polite" aria-atomic="true">
            <span className="font-semibold text-foreground">{checkedIn} in</span> · {checkedOut} out ·{' '}
            {expected} expected
          </p>
          {failedCount > 0 && (
            <StatusPill tone="alert">
              {failedCount} didn&apos;t save
            </StatusPill>
          )}
        </div>
      </div>

      {members.length === 0 ? (
        <EmptyState
          title={`No ${memberLabel.toLowerCase()} registered for this event yet.`}
          description={`${memberLabel} appear here the moment a family registers — share the registration link to fill this list.`}
        />
      ) : visibleFamilies.length === 0 ? (
        <div className="space-y-2 rounded-xl border border-dashed px-4 py-8 text-center">
          <p className="text-sm font-medium">No name matching &ldquo;{search.trim()}&rdquo;</p>
          <p className="text-xs text-muted-foreground">
            Search matches first names, last names, and family names.
          </p>
          <Button variant="outline" size="touch" onClick={() => setSearch('')}>
            Show everyone
          </Button>
        </div>
      ) : (
        <div aria-busy={isNavigating} className={cn('space-y-3', isNavigating && 'opacity-60')}>
          {searching && (
            <p className="text-xs text-muted-foreground">
              {visibleFamilies.length === 1
                ? '1 family matches'
                : `${visibleFamilies.length} families match`}{' '}
              ·{' '}
              <button type="button" className="underline underline-offset-2" onClick={() => setSearch('')}>
                Clear
              </button>
            </p>
          )}
          <div className="overflow-hidden rounded-xl border bg-card">
            {visibleFamilies.map((g, i) => (
              <div key={g.family_id} className={cn(i > 0 && 'border-t')}>
                {renderFamilyHeader(g)}
                <div className="divide-y divide-border/60">
                  {g.members.map((m) => renderMemberRow(m, g))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Guardian capture. Keyboard-safe: top-anchored on phones (never centered
          under the keyboard), and the quick-pick chips take initial focus so the
          keyboard doesn't pop until the operator chooses to type. */}
      <Dialog
        open={checkoutIntent !== null}
        onOpenChange={(open) => {
          if (!open) setCheckoutIntent(null)
        }}
      >
        <DialogContent className="top-4 translate-y-0 max-h-[calc(100dvh-2rem)] overflow-y-auto sm:top-1/2 sm:-translate-y-1/2">
          <DialogHeader>
            <DialogTitle>Who is picking up?</DialogTitle>
            <DialogDescription>
              {dialogTargets.length > 1
                ? `One guardian name covers ${intentNames || 'everyone listed'}.`
                : `Required for ${intentNames || 'this child'}’s custody record.`}
            </DialogDescription>
          </DialogHeader>
          {quickPicks.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {quickPicks.map((p) => (
                <Button
                  key={p.name}
                  type="button"
                  size="touch"
                  variant={guardianPick === p.name ? 'default' : 'outline'}
                  aria-pressed={guardianPick === p.name}
                  onClick={() => {
                    setGuardianPick(p.name)
                    setGuardianName(p.name)
                  }}
                >
                  {p.name}
                  <span className={cn('text-xs', guardianPick === p.name ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                    · {p.role}
                  </span>
                </Button>
              ))}
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="guardianName">{quickPicks.length > 0 ? 'Someone else' : 'Guardian name'}</Label>
            <Input
              id="guardianName"
              value={guardianName}
              enterKeyHint="done"
              onChange={(e) => {
                setGuardianName(e.target.value)
                if (guardianPick && e.target.value !== guardianPick) setGuardianPick(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) confirmGuardianCheckOut()
              }}
            />
            {guardianUnlisted && (
              <p className="text-xs text-[var(--status-alert-fg)]">
                Not one of the listed adults — this pickup will be logged as an exception.
              </p>
            )}
          </div>
          {intent?.kind === 'single' && intent.siblings.length > 0 && (
            <Button
              type="button"
              size="touch"
              variant={includeSiblings ? 'default' : 'outline'}
              aria-pressed={includeSiblings}
              className="h-auto min-h-11 w-full justify-start text-left whitespace-normal"
              onClick={() => setIncludeSiblings((v) => !v)}
            >
              Also check out {intent.siblings.map((s) => s.member.first_name).join(', ')}
            </Button>
          )}
          <DialogFooter>
            <DialogClose render={<Button variant="ghost" size="touch" />}>Cancel</DialogClose>
            <Button size="touch" onClick={confirmGuardianCheckOut} disabled={!trimmedGuardian}>
              {dialogTargets.length > 1 ? `Check out ${dialogTargets.length}` : 'Check out'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Date switch discards row phases and the undo window (the page keys this
          component by date) — when any of that is live, it needs an explicit OK. */}
      <ConfirmDialog
        open={dateSwitchConfirm !== null}
        onOpenChange={(open) => {
          if (!open) setDateSwitchConfirm(null)
        }}
        title="Switch date?"
        description="Saves are still in flight, failed, or undoable. Switching dates resets this screen and discards that state."
        confirmLabel="Switch date"
        onConfirm={() => {
          if (dateSwitchConfirm) navigateToDate(dateSwitchConfirm)
        }}
      />

      {/* Non-guardian orgs still get ONE explicit confirmation on bulk checkout. */}
      <ConfirmDialog
        open={familyOutConfirm !== null}
        onOpenChange={(open) => {
          if (!open) setFamilyOutConfirm(null)
        }}
        title={`Check out ${familyOutConfirm?.targets.length ?? 0} ${memberLabel.toLowerCase()}?`}
        description={
          familyOutConfirm
            ? `${familyOutConfirm.targets.map((t) => t.member.first_name).join(', ')} will be marked out.`
            : undefined
        }
        confirmLabel={`Check out ${familyOutConfirm?.targets.length ?? 0}`}
        onConfirm={() => {
          if (familyOutConfirm) runCheckOut(familyOutConfirm.targets, undefined, false)
        }}
      />

      {/* Undo snackbar — custody-safe: the server verifies the action is still
          the latest entry and restores from its own history, never a client
          snapshot; a stale undo is cancelled, not forced. */}
      {undo && (
        <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
          <div
            className="flex max-w-full items-center gap-1 rounded-full bg-foreground py-1 pr-1 pl-4 text-background shadow-lg"
            role="status"
            aria-live="polite"
          >
            <p className="min-w-0 truncate text-sm">
              {undo.failed ? 'Undo didn’t reach the server' : undo.label}
            </p>
            {!undo.stale && (
              <Button
                size="touch"
                variant="ghost"
                className="rounded-full px-4 font-semibold text-background hover:bg-background/15 hover:text-background"
                disabled={undoBusy}
                onClick={handleUndo}
              >
                {undoBusy ? 'Undoing…' : undo.failed ? 'Retry' : 'Undo'}
              </Button>
            )}
            {(undo.failed || undo.stale) && (
              <Button
                size="touch"
                variant="ghost"
                className="rounded-full px-4 text-background/80 hover:bg-background/15 hover:text-background"
                onClick={() => setUndo(null)}
              >
                Dismiss
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
