import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { WonUnscheduledItem } from '@/lib/today'

interface WonUnscheduledListProps {
  orgSlug: string
  items: WonUnscheduledItem[]
}

// Matches NeedsAttentionList/WaitingList's row structure: the date/value text
// sits outside the <Link> so it doesn't bleed into the link's accessible
// name, and each row has exactly one navigational target (both the row and a
// separate "Convert to work" button pointed at the same href, giving two tab
// stops to one destination).
export function WonUnscheduledList({ orgSlug, items }: WonUnscheduledListProps) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Won, not scheduled</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Every won deal is scheduled.</p>
        ) : (
          items.map((item) => (
            <div key={item.leadId} className="rounded-md border border-border px-3 py-2">
              <Link href={`/${orgSlug}/leads/${item.leadId}`} className="hover:underline">
                <span className="text-sm font-medium">{item.title}</span>
                {item.company && <span className="ml-2 text-xs text-muted-foreground">{item.company}</span>}
              </Link>
              <p className="text-xs text-muted-foreground">
                {item.eventDate ?? 'No date set'}
                {item.value !== undefined && ` · $${item.value.toLocaleString()}`}
              </p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
