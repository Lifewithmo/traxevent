'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { checkInMember, checkOutMember } from '@/actions/checkins'
import type { CheckinRecord, EventMember } from '@/lib/types'

interface CheckinClientProps {
  orgId: string
  campId: string
  orgSlug: string
  campSlug: string
  date: string
  members: EventMember[]
  checkins: CheckinRecord[]
  guardianMode: boolean
  memberLabel: string
}

export function CheckinClient({
  orgId,
  campId,
  orgSlug,
  campSlug,
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

  const byMember = new Map(checkins.map((c) => [c.member_id, c]))

  // Counts derived from the roster join so they always sum to members.length
  // (ignores any orphaned checkin records for members no longer on the roster).
  const rosterRecords = members.map((m) => byMember.get(m.member_id))
  const checkedIn = rosterRecords.filter((c) => c?.status === 'in').length
  const checkedOut = rosterRecords.filter((c) => c?.status === 'out').length
  const notIn = rosterRecords.filter((c) => !c).length

  function changeDate(newDate: string) {
    router.push(`/${orgSlug}/${campSlug}/checkin?date=${newDate}`)
  }

  async function handleCheckIn(member: EventMember) {
    setBusyId(member.member_id)
    setError(null)
    try {
      const rec = await checkInMember(orgId, campId, {
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

  async function handleCheckOut(member: EventMember, record: CheckinRecord) {
    let guardianName: string | undefined
    if (guardianMode) {
      const entered = window.prompt('Who is picking up this child? Enter guardian name:')
      if (entered === null) return // cancelled
      const trimmed = entered.trim()
      if (!trimmed) {
        setError('A guardian name is required to check out a child.')
        return
      }
      guardianName = trimmed
    }
    setBusyId(member.member_id)
    setError(null)
    try {
      await checkOutMember(orgId, campId, record.id, guardianName)
      setCheckins((prev) =>
        prev.map((c) =>
          c.id === record.id
            ? { ...c, status: 'out', checked_out_at: new Date().toISOString(), guardian_pickup_name: guardianName }
            : c
        )
      )
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to check out')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="p-6 max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Check-in</h1>
        <a
          href={`/${orgSlug}/${campSlug}/checkin/manifest?date=${date}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-muted-foreground underline"
        >
          Print manifest
        </a>
      </div>

      <div className="flex items-end gap-4">
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
        <div className="flex gap-2 pb-1">
          <Badge variant="default">{checkedIn} in</Badge>
          <Badge variant="secondary">{checkedOut} out</Badge>
          <Badge variant="outline">{notIn} not arrived</Badge>
        </div>
      </div>

      <div aria-live="polite" aria-atomic="true">
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {members.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No {memberLabel.toLowerCase()} registered for this event yet.
        </p>
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
                      {status === 'in' && <Badge variant="default" className="text-xs">Checked in</Badge>}
                      {status === 'out' && (
                        <Badge variant="secondary" className="text-xs">
                          Out{record?.guardian_pickup_name ? ` · ${record.guardian_pickup_name}` : ''}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {record && status === 'in' ? (
                      <Button size="sm" variant="outline" onClick={() => handleCheckOut(member, record)} disabled={busy}>
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
    </div>
  )
}
