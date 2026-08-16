'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EmptyState } from '@/components/ui/empty-state'
import { StatTile } from '@/components/ui/stat-tile'
import { StatusPill } from '@/components/ui/status-pill'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { checkInMember, checkOutMember } from '@/actions/checkins'
import type { CheckinRecord, EventMember } from '@/lib/types'

interface CheckinClientProps {
  orgId: string
  eventId: string
  orgSlug: string
  eventSlug: string
  date: string
  members: EventMember[]
  checkins: CheckinRecord[]
  guardianMode: boolean
  memberLabel: string
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
  const [checkins, setCheckins] = useState<CheckinRecord[]>(initialCheckins)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [checkoutTarget, setCheckoutTarget] = useState<{ member: EventMember; record: CheckinRecord } | null>(null)
  const [guardianName, setGuardianName] = useState('')

  // Last non-null target — keeps the dialog description stable while the close animation plays.
  const lastCheckoutTarget = useRef(checkoutTarget)
  if (checkoutTarget !== null) lastCheckoutTarget.current = checkoutTarget

  const byMember = new Map(checkins.map((c) => [c.member_id, c]))

  // Counts derived from the roster join so they always sum to members.length
  // (ignores any orphaned checkin records for members no longer on the roster).
  const rosterRecords = members.map((m) => byMember.get(m.member_id))
  const checkedIn = rosterRecords.filter((c) => c?.status === 'in').length
  const checkedOut = rosterRecords.filter((c) => c?.status === 'out').length
  const notIn = rosterRecords.filter((c) => !c).length

  function changeDate(newDate: string) {
    router.push(`/${orgSlug}/${eventSlug}/checkin?date=${newDate}`)
  }

  async function handleCheckIn(member: EventMember) {
    setBusyId(member.member_id)
    setError(null)
    try {
      const rec = await checkInMember(orgId, eventId, {
        date,
        memberId: member.member_id,
        familyId: member.family_id,
        memberName: `${member.first_name} ${member.last_name}`,
      })
      setCheckins((prev) => {
        const without = prev.filter((c) => c.member_id !== member.member_id)
        return [...without, rec]
      })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to check in')
    } finally {
      setBusyId(null)
    }
  }

  function requestCheckOut(member: EventMember, record: CheckinRecord) {
    if (guardianMode) {
      setGuardianName('')
      setCheckoutTarget({ member, record })
      return
    }
    performCheckOut(member, record, undefined)
  }

  async function performCheckOut(member: EventMember, record: CheckinRecord, guardian: string | undefined) {
    setBusyId(member.member_id)
    setError(null)
    try {
      await checkOutMember(orgId, eventId, record.id, guardian)
      setCheckins((prev) =>
        prev.map((c) =>
          c.id === record.id
            ? { ...c, status: 'out', checked_out_at: new Date().toISOString(), guardian_pickup_name: guardian }
            : c
        )
      )
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to check out')
    } finally {
      setBusyId(null)
    }
  }

  function confirmGuardianCheckOut() {
    if (!checkoutTarget) return
    const trimmed = guardianName.trim()
    if (!trimmed) return // a guardian name is required — mirror the prompt's no-empty-submit rule
    const { member, record } = checkoutTarget
    setCheckoutTarget(null)
    performCheckOut(member, record, trimmed)
  }

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div className="space-y-1">
          <Label htmlFor="date">Date</Label>
          <Input
            id="date"
            type="date"
            value={date}
            onChange={(e) => changeDate(e.target.value)}
            className="w-44"
          />
        </div>
        <Button
          variant="outline"
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

      <div className="grid gap-2.5 sm:grid-cols-3">
        <StatTile label="Checked in" value={String(checkedIn)} note="today" />
        <StatTile label="Checked out" value={String(checkedOut)} note="today" />
        <StatTile label="Not arrived" value={String(notIn)} note="today" />
      </div>

      <div aria-live="polite" aria-atomic="true">
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {members.length === 0 ? (
        <EmptyState title={`No ${memberLabel.toLowerCase()} registered for this event yet.`} />
      ) : (
        <div className="space-y-2">
          {members.map((member) => {
            const record = byMember.get(member.member_id)
            const status = record?.status
            const busy = busyId === member.member_id
            return (
              <Card key={member.member_id}>
                <CardContent className="py-3 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="font-medium">
                      {member.first_name} {member.last_name}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{member.family_name}</span>
                      {status === 'in' && <StatusPill tone="confirmed">Checked in</StatusPill>}
                      {status === 'out' && (
                        <StatusPill tone="neutral">
                          Out{record?.guardian_pickup_name ? ` · ${record.guardian_pickup_name}` : ''}
                        </StatusPill>
                      )}
                      {!status && <StatusPill tone="pending">Not arrived</StatusPill>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {record && status === 'in' ? (
                      <Button size="sm" variant="outline" onClick={() => requestCheckOut(member, record)} disabled={busy}>
                        {busy ? '…' : 'Check out'}
                      </Button>
                    ) : status === 'out' ? (
                      <Button size="sm" variant="outline" onClick={() => handleCheckIn(member)} disabled={busy}>
                        {busy ? '…' : 'Check in again'}
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => handleCheckIn(member)} disabled={busy}>
                        {busy ? '…' : 'Check in'}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={checkoutTarget !== null} onOpenChange={(open) => { if (!open) setCheckoutTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Who is picking up this child?</DialogTitle>
            <DialogDescription>
              A guardian name is required to check out
              {lastCheckoutTarget.current
                ? ` ${lastCheckoutTarget.current.member.first_name} ${lastCheckoutTarget.current.member.last_name}`
                : ' a child'}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="guardianName">Guardian name</Label>
            <Input
              id="guardianName"
              value={guardianName}
              onChange={(e) => setGuardianName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) confirmGuardianCheckOut() }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button onClick={confirmGuardianCheckOut} disabled={!guardianName.trim()}>
              Check out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
