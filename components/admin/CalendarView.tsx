import { Badge } from '@/components/ui/badge'
import type { CalendarItem } from '@/lib/calendar'

// v1: a chronological agenda grouped by month. A full month-grid (calendar
// squares) view is a future enhancement.
interface MonthGroup {
  label: string
  items: CalendarItem[]
}

function groupByMonth(items: CalendarItem[]): MonthGroup[] {
  const groups: MonthGroup[] = []
  for (const item of items) {
    const label = new Date(item.date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    const last = groups[groups.length - 1]
    if (last && last.label === label) {
      last.items.push(item)
    } else {
      groups.push({ label, items: [item] })
    }
  }
  return groups
}

function formatDay(date: string): string {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function CalendarView({ items }: { items: CalendarItem[] }) {
  const groups = groupByMonth(items)

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">Calendar</h1>

      {groups.length === 0 ? (
        <p className="text-muted-foreground">Nothing scheduled yet.</p>
      ) : (
        groups.map((group) => (
          <div key={group.label} className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{group.label}</h2>
            <div className="bg-card rounded-lg border divide-y">
              {group.items.map((item) => (
                <a
                  key={`${item.kind}-${item.id}`}
                  href={item.href}
                  className="flex items-center gap-4 px-4 py-3 hover:bg-muted/50"
                >
                  <span className="w-16 shrink-0 text-sm text-muted-foreground">{formatDay(item.date)}</span>
                  <span className="flex-1 font-medium">{item.title}</span>
                  <Badge variant="secondary">{item.kind === 'event' ? 'Event' : 'Lead'}</Badge>
                </a>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
