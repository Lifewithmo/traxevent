'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { addDays } from '@/lib/opportunity-detail'

/**
 * YMD `days` business days after `baseYmd`, skipping Saturdays and Sundays.
 * Walked one calendar day at a time so a base that is itself a weekend rolls
 * forward correctly (Sat + 2 business days = Tuesday, not Monday).
 */
export function addBusinessDays(baseYmd: string, days: number): string {
  let cursor = baseYmd
  let added = 0
  while (added < days) {
    cursor = addDays(cursor, 1)
    const dow = new Date(`${cursor}T00:00:00.000Z`).getUTCDay()
    if (dow !== 0 && dow !== 6) added++
  }
  return cursor
}

/**
 * The default first follow-up: two business days out. "We'll follow up
 * Tuesday" is the promise an operator actually makes on a Friday call — a
 * naive +2 would land the task on Sunday, where it silently rots.
 */
export function defaultFollowUpYmd(todayYmd: string): string {
  return addBusinessDays(todayYmd, 2)
}

/**
 * The NEXT section's one row: an optional follow-up date that becomes a real
 * Task in the same server write as the lead (contract C2). Clearable — an
 * empty value means "no task", never a task with no date. The helper sentence
 * says out loud why the field exists, because a date field with no stated
 * consequence reads as bookkeeping and gets skipped.
 */
export function FollowUpField({
  value,
  onChange,
  inputRef,
}: {
  value: string
  onChange: (next: string) => void
  inputRef?: React.Ref<HTMLInputElement>
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor="leadFollowUp">Follow up by</Label>
      <Input
        ref={inputRef}
        id="leadFollowUp"
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby="leadFollowUp-help"
      />
      <p id="leadFollowUp-help" className="text-xs text-muted-foreground">
        Creates a task so this opportunity is born with a next step.
      </p>
    </div>
  )
}
