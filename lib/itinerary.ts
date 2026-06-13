import type { ItineraryItem } from '@/lib/types'

export interface ItineraryDay {
  day: string
  items: ItineraryItem[]
}

// Groups items by day (chronological), each day's items sorted by start_time then sort_order.
export function groupItineraryByDay(items: ItineraryItem[]): ItineraryDay[] {
  const byDay = new Map<string, ItineraryItem[]>()
  for (const it of items) {
    const list = byDay.get(it.day) ?? []
    list.push(it)
    byDay.set(it.day, list)
  }

  const days = [...byDay.keys()].sort()
  return days.map((day) => {
    const dayItems = [...(byDay.get(day) ?? [])].sort((a, b) => {
      if (a.start_time !== b.start_time) return a.start_time < b.start_time ? -1 : 1
      return a.sort_order - b.sort_order
    })
    return { day, items: dayItems }
  })
}

// Formats 'HH:MM' (24h) as a 12-hour time with am/pm. Returns '' for blank input.
export function formatTime(hhmm: string): string {
  if (!hhmm) return ''
  const [hStr, mStr] = hhmm.split(':')
  const h = Number(hStr)
  const m = mStr ?? '00'
  const period = h < 12 ? 'AM' : 'PM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${m} ${period}`
}
