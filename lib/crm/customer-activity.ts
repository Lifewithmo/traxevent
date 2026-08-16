import type { ActivityEvent } from '@/lib/types'

export function mergeActivity(lists: ActivityEvent[][]): ActivityEvent[] {
  const byId = new Map<string, ActivityEvent>()
  for (const list of lists) for (const e of list) byId.set(e.id, e)
  return [...byId.values()].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))
}
