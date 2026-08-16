import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }))
vi.mock('@/actions/notes', () => ({ createNote: vi.fn().mockResolvedValue({}) }))

import { ActivityTimeline } from '@/components/admin/opportunity/ActivityTimeline'
import type { ActivityEvent } from '@/lib/types'

describe('ActivityTimeline — new event kinds', () => {
  it('renders proposal/invoice/deposit events without falling back to the default icon', () => {
    const events: ActivityEvent[] = (['proposal', 'invoice', 'deposit'] as const).map((kind, i) => ({
      id: String(i), parent_type: 'customer', parent_id: 'c1', kind, summary: `${kind} event`, created_at: '2026-08-15T00:00:00.000Z',
    }))
    const { getByText } = render(<ActivityTimeline orgId="o" parentType="customer" parentId="c1" activity={events} />)
    expect(getByText('proposal event')).toBeInTheDocument()
    expect(getByText('invoice event')).toBeInTheDocument()
    expect(getByText('deposit event')).toBeInTheDocument()
  })
})
