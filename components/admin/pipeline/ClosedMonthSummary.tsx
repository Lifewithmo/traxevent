import Link from 'next/link'
import type { closedThisMonth } from '@/lib/pipeline-view'

const money = (n: number) => `$${n.toLocaleString()}`

export function ClosedMonthSummary({
  orgSlug, monthly,
}: { orgSlug: string; monthly: ReturnType<typeof closedThisMonth> }) {
  return (
    <p className="text-sm text-muted-foreground">
      Won this month: {monthly.wonCount} · {money(monthly.wonValue)} — moved to{' '}
      <Link href={`/${orgSlug}/calendar`} className="underline underline-offset-4">Events</Link>
      {' '}· Lost: {monthly.lostCount} · {money(monthly.lostValue)} · archived
    </p>
  )
}
