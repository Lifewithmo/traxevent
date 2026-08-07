import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import type { WonUnscheduledItem } from '@/lib/today'

interface WonUnscheduledListProps {
  orgSlug: string
  items: WonUnscheduledItem[]
}

export function WonUnscheduledList({ orgSlug, items }: WonUnscheduledListProps) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Won, not scheduled</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Every won deal is scheduled.</p>
        ) : (
          items.map((item) => (
            <div key={item.leadId} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
              <Link href={`/${orgSlug}/leads/${item.leadId}`} className="min-w-0 flex-1 hover:underline">
                <span className="text-sm font-medium">{item.title}</span>
                {item.company && <span className="ml-2 text-xs text-muted-foreground">{item.company}</span>}
                <p className="text-xs text-muted-foreground">
                  {item.eventDate ?? 'No date set'}
                  {item.value !== undefined && ` · $${item.value.toLocaleString()}`}
                </p>
              </Link>
              <Link href={`/${orgSlug}/leads/${item.leadId}`} className={buttonVariants({ size: 'sm' })}>
                Convert to work
              </Link>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
