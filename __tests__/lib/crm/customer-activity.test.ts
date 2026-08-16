import { describe, it, expect } from 'vitest'
import { mergeActivity } from '@/lib/crm/customer-activity'
import type { ActivityEvent } from '@/lib/types'

const ev = (id: string, at: string): ActivityEvent => ({ id, parent_type: 'opportunity', parent_id: 'L', kind: 'note', summary: id, created_at: at })

it('merges, de-dupes by id, and sorts newest first', () => {
  const out = mergeActivity([[ev('a', '2026-08-10T00:00:00Z'), ev('b', '2026-08-12T00:00:00Z')], [ev('b', '2026-08-12T00:00:00Z'), ev('c', '2026-08-14T00:00:00Z')]])
  expect(out.map((e) => e.id)).toEqual(['c', 'b', 'a'])
})
