import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { CalendarAttentionRail } from '@/components/admin/calendar/CalendarAttentionRail'
import type { CalendarItem } from '@/lib/calendar'
import type { AttentionEntry, AttentionGroup, AttentionReason } from '@/lib/calendar-week'

// Same UTC-midnight idiom the rail uses, so the assertion survives whatever
// locale the test runner's ICU defaults to.
const dayLabel = (ymd: string) =>
  new Date(`${ymd}T00:00:00.000Z`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })

function entry(
  reason: AttentionReason,
  overdue: boolean,
  item: Partial<CalendarItem> & Pick<CalendarItem, 'id' | 'title' | 'date'>
): AttentionEntry {
  return {
    reason,
    overdue,
    item: { kind: 'task', href: `/acme/leads/${item.id}`, ...item } as CalendarItem,
  }
}

const groups: AttentionGroup[] = [
  {
    key: 'blocker',
    label: 'Blocking a booked event',
    entries: [
      entry('blocker', true, {
        id: 'doc1',
        title: 'Liquor licence expires',
        date: '2026-08-12',
        kind: 'compliance',
        href: '/acme/compliance',
        detail: 'blocks Smith Wedding',
        blocker: true,
      }),
    ],
  },
  {
    key: 'overdue',
    label: 'Past due',
    entries: [entry('overdue', true, { id: 't1', title: 'Send the final headcount', date: '2026-08-10' })],
  },
  {
    key: 'money',
    label: 'Money owed',
    entries: [
      entry('money', false, {
        id: 'inv1',
        title: 'Invoice 1042',
        date: '2026-08-20',
        kind: 'invoice_due',
        href: '/acme/leads/l9',
        amount: 1250,
      }),
    ],
  },
  {
    key: 'unbooked',
    label: 'Not booked yet',
    entries: [
      entry('unbooked', false, {
        id: 'l4',
        title: 'Harbor Gala hold',
        date: '2026-08-22',
        kind: 'lead',
        tentative: true,
      }),
    ],
  },
]

describe('CalendarAttentionRail', () => {
  it('renders a section per group, in the order given, with its label', () => {
    render(<CalendarAttentionRail groups={groups} />)
    // Group labels are sub-headings; "Past due" is also a pill, so scope by role.
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(headings).toEqual(groups.map((g) => g.label))
    expect(screen.getByRole('heading', { level: 2 }).textContent).toContain('Needs attention')
  })

  it('shows the total entry count in the heading, pluralised', () => {
    render(<CalendarAttentionRail groups={groups} />)
    expect(screen.getByText('4 items · next 30 days')).toBeInTheDocument()
  })

  it('shows a singular count for one entry and no count at all when empty', () => {
    const { unmount } = render(<CalendarAttentionRail groups={[groups[0]]} />)
    expect(screen.getByText('1 item · next 30 days')).toBeInTheDocument()
    unmount()

    render(<CalendarAttentionRail groups={[]} />)
    expect(screen.queryByText(/\d+ items?/)).not.toBeInTheDocument()
  })

  it('links each entry title to the item href', () => {
    render(<CalendarAttentionRail groups={groups} />)
    expect(screen.getByText('Liquor licence expires').closest('a')).toHaveAttribute('href', '/acme/compliance')
    expect(screen.getByText('Invoice 1042').closest('a')).toHaveAttribute('href', '/acme/leads/l9')
    expect(screen.getByText('Harbor Gala hold').closest('a')).toHaveAttribute('href', '/acme/leads/l4')
  })

  it('renders the detail line under the title', () => {
    render(<CalendarAttentionRail groups={groups} />)
    expect(screen.getByText('blocks Smith Wedding')).toBeInTheDocument()
  })

  it('maps each reason to its own status pill', () => {
    render(<CalendarAttentionRail groups={groups} />)
    expect(screen.getByText('Blocking')).toBeInTheDocument()
    expect(screen.getByText('Past due', { selector: '[data-slot="status-pill"]' })).toBeInTheDocument()
    expect(screen.getByText('Owed')).toBeInTheDocument()
    expect(screen.getByText('Hold')).toBeInTheDocument()
  })

  it('renders money only for entries that carry an amount', () => {
    render(<CalendarAttentionRail groups={groups} />)
    const amount = screen.getByText('$1,250')
    expect(amount).toBeInTheDocument()
    expect(amount.className).toContain('text-[var(--money-green)]')
    expect(screen.queryByText(/^\$/, { selector: 'span.tabular-nums' })).toBe(amount)
  })

  it('styles an overdue entry’s date as destructive and a future one as muted', () => {
    render(<CalendarAttentionRail groups={groups} />)
    expect(screen.getByText(dayLabel('2026-08-12')).className).toContain('text-destructive')
    expect(screen.getByText(dayLabel('2026-08-20')).className).toContain('text-muted-foreground')
  })

  // The red date exists to say "late" for rows whose pill says something else.
  // A row already pilled "Past due" must NOT double up — without this the
  // `reason !== 'overdue'` guard could be deleted and every other test would pass.
  it('leaves the date muted when the pill already says Past due', () => {
    render(<CalendarAttentionRail groups={groups} />)
    expect(screen.getByText(dayLabel('2026-08-10')).className).toContain('text-muted-foreground')
    expect(screen.getByText(dayLabel('2026-08-10')).className).not.toContain('text-destructive')
  })

  it('names the rail landmark so it is reachable by landmark navigation', () => {
    render(<CalendarAttentionRail groups={groups} />)
    expect(screen.getByRole('complementary', { name: /Needs attention/ })).toBeInTheDocument()
  })

  it('caps a group at previewLimit and says how many are hidden', () => {
    const many: AttentionGroup = {
      key: 'money',
      label: 'Money owed',
      entries: Array.from({ length: 6 }, (_, i) =>
        entry('money', false, {
          id: `inv${i}`,
          title: `Invoice ${i}`,
          date: '2026-08-20',
          kind: 'invoice_due',
          href: `/acme/leads/l${i}`,
        })
      ),
    }
    render(<CalendarAttentionRail groups={[many]} />)
    expect(screen.getByText('Invoice 3')).toBeInTheDocument()
    expect(screen.queryByText('Invoice 4')).not.toBeInTheDocument()
    expect(screen.getByText('+2 more')).toBeInTheDocument()
  })

  it('shows no “more” line when the group fits inside previewLimit', () => {
    render(<CalendarAttentionRail groups={groups} />)
    expect(screen.queryByText(/more$/)).not.toBeInTheDocument()
  })

  it('honours a custom previewLimit', () => {
    const two: AttentionGroup = {
      key: 'overdue',
      label: 'Past due',
      entries: [
        entry('overdue', true, { id: 'a', title: 'Task A', date: '2026-08-01' }),
        entry('overdue', true, { id: 'b', title: 'Task B', date: '2026-08-02' }),
      ],
    }
    render(<CalendarAttentionRail groups={[two]} previewLimit={1} />)
    expect(screen.getByText('Task A')).toBeInTheDocument()
    expect(screen.queryByText('Task B')).not.toBeInTheDocument()
    expect(screen.getByText('+1 more')).toBeInTheDocument()
  })

  // "+N more" was dead text: it announced hidden work with no way to reach it.
  it('turns “+N more” into a link when the caller supplies a destination', () => {
    const two: AttentionGroup = {
      key: 'overdue',
      label: 'Past due',
      entries: [
        entry('overdue', true, { id: 'a', title: 'Task A', date: '2026-08-01' }),
        entry('overdue', true, { id: 'b', title: 'Task B', date: '2026-08-02' }),
      ],
    }
    render(
      <CalendarAttentionRail groups={[two]} previewLimit={1} moreHref="/acme/calendar?week=2026-08-10&view=agenda" />
    )
    expect(screen.getByRole('link', { name: /\+1 more/ })).toHaveAttribute(
      'href',
      '/acme/calendar?week=2026-08-10&view=agenda'
    )
  })

  it('shows the good empty state, with no call to action, when nothing needs attention', () => {
    render(<CalendarAttentionRail groups={[]} />)
    expect(screen.getByText('Nothing needs attention')).toBeInTheDocument()
    expect(
      screen.getByText('Blockers, past-due work, money owed and unbooked holds land here.')
    ).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
