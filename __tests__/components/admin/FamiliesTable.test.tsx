import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { useState as useStateReact } from 'react'
import { FamiliesTable } from '@/components/admin/FamiliesTable'
import type { Family } from '@/lib/types'

const makeFam = (overrides: Partial<Family> = {}): Family => ({
  id: 'fam-1',
  org_id: 'org-1',
  event_id: 'camp-1',
  org_slug: 'acme',
  event_slug: 'summer-2025',
  event_name: 'Summer Camp',
  org_name: 'Acme',
  first_name: 'Lisa',
  last_name: 'Chen',
  email: 'lisa@example.com',
  phone: '555-1234',
  address: { street: '1 Main', city: 'SF', state: 'CA', zip: '94102' },
  emergency_contact: { name: 'David', phone: '555-5678', relationship: 'Spouse' },
  registration_status: 'pending',
  payment_status: 'unpaid',
  registrant_uid: null,
  pco_household_id: null,
  access_token: null,
  access_token_expires_at: null,
  created_at: '2025-05-12T10:00:00Z',
  updated_at: '2025-05-12T10:00:00Z',
  notes: [],
  ...overrides,
})

const families = [
  makeFam({ id: 'fam-1', first_name: 'Lisa', last_name: 'Chen', registration_status: 'pending' }),
  makeFam({ id: 'fam-2', first_name: 'Bob', last_name: 'Smith', registration_status: 'confirmed' }),
  makeFam({ id: 'fam-3', first_name: 'Maria', last_name: 'Garcia', email: 'maria@example.com', registration_status: 'waitlisted' }),
]

// Controlled wrapper so we can test state changes
function Wrapper({
  initialSearch = '',
  initialFilter = 'all',
}: {
  initialSearch?: string
  initialFilter?: string
}) {
  const [search, setSearch] = useStateReact(initialSearch)
  const [statusFilter, setStatusFilter] = useStateReact(initialFilter)
  const [selectedIds, setSelectedIds] = useStateReact<Set<string>>(new Set())
  const [selectedFamilyId, setSelectedFamilyId] = useStateReact<string | null>(null)

  return (
    <FamiliesTable
      families={families}
      search={search}
      onSearchChange={setSearch}
      statusFilter={statusFilter}
      onStatusFilterChange={setStatusFilter}
      selectedIds={selectedIds}
      onToggleRow={id =>
        setSelectedIds(prev => {
          const next = new Set(prev)
          next.has(id) ? next.delete(id) : next.add(id)
          return next
        })
      }
      onToggleAll={ids => setSelectedIds(new Set(ids))}
      onClearSelection={() => setSelectedIds(new Set())}
      selectedFamilyId={selectedFamilyId}
      onSelectFamily={setSelectedFamilyId}
      onBulkStatusChange={vi.fn()}
      onExport={vi.fn()}
    />
  )
}

describe('FamiliesTable', () => {
  it('renders all families by default', () => {
    render(<Wrapper />)
    expect(screen.getByText('Chen, Lisa')).toBeInTheDocument()
    expect(screen.getByText('Smith, Bob')).toBeInTheDocument()
    expect(screen.getByText('Garcia, Maria')).toBeInTheDocument()
  })

  it('filters rows by search text (name match)', async () => {
    render(<Wrapper />)
    const input = screen.getByPlaceholderText(/search/i)
    await userEvent.type(input, 'chen')
    expect(screen.getByText('Chen, Lisa')).toBeInTheDocument()
    expect(screen.queryByText('Smith, Bob')).not.toBeInTheDocument()
  })

  it('filters rows by search text (email match)', async () => {
    render(<Wrapper />)
    const input = screen.getByPlaceholderText(/search/i)
    await userEvent.type(input, 'maria@')
    expect(screen.getByText('Garcia, Maria')).toBeInTheDocument()
    expect(screen.queryByText('Chen, Lisa')).not.toBeInTheDocument()
  })

  it('shows only pending families when Pending filter is active', () => {
    render(<Wrapper initialFilter="pending" />)
    expect(screen.getByText('Chen, Lisa')).toBeInTheDocument()
    expect(screen.queryByText('Smith, Bob')).not.toBeInTheDocument()
  })

  it('shows empty state message when no families match search', async () => {
    render(<Wrapper />)
    await userEvent.type(screen.getByPlaceholderText(/search/i), 'zzznomatch')
    expect(screen.getByText(/no families match/i)).toBeInTheDocument()
  })

  it('toggles row selection when checkbox is clicked', async () => {
    render(<Wrapper />)
    const checkboxes = screen.getAllByRole('checkbox')
    // First checkbox is select-all; data checkboxes follow
    await userEvent.click(checkboxes[1])
    // BulkToolbar should appear showing "1 selected"
    expect(screen.getByText(/1 selected/i)).toBeInTheDocument()
  })

  it('calls onSelectFamily when a row is clicked', async () => {
    const onSelectFamily = vi.fn()
    render(
      <FamiliesTable
        families={families}
        search=""
        onSearchChange={vi.fn()}
        statusFilter="all"
        onStatusFilterChange={vi.fn()}
        selectedIds={new Set()}
        onToggleRow={vi.fn()}
        onToggleAll={vi.fn()}
        onClearSelection={vi.fn()}
        selectedFamilyId={null}
        onSelectFamily={onSelectFamily}
        onBulkStatusChange={vi.fn()}
        onExport={vi.fn()}
      />
    )
    await userEvent.click(screen.getByText('Chen, Lisa'))
    expect(onSelectFamily).toHaveBeenCalledWith('fam-1')
  })
})

/*
 * Phone card reflow (inc-3 S4) — STRUCTURAL assertions only. jsdom ignores
 * responsive visibility classes, so these tests pin the single-DOM discipline
 * the reflow depends on: one tree serves both the <sm card skin and the ≥sm
 * grid skin. Phone budget: find (search) → tap (card → slide-over) → decide →
 * next (slide-over Prev/Next, shipped) ≤ 5 touches, no horizontal pan.
 */
describe('FamiliesTable — phone card reflow (single DOM)', () => {
  const noopProps = {
    search: '',
    onSearchChange: vi.fn(),
    statusFilter: 'all',
    onStatusFilterChange: vi.fn(),
    selectedIds: new Set<string>(),
    onToggleRow: vi.fn(),
    onToggleAll: vi.fn(),
    onClearSelection: vi.fn(),
    selectedFamilyId: null,
    onSelectFamily: vi.fn(),
    onBulkStatusChange: vi.fn(),
    onExport: vi.fn(),
  }

  it('renders each family name in exactly ONE DOM node (no duplicated hidden/shown trees)', () => {
    render(<Wrapper />)
    expect(screen.getAllByText('Chen, Lisa')).toHaveLength(1)
    expect(screen.getAllByText('Smith, Bob')).toHaveLength(1)
    expect(screen.getAllByText('Garcia, Maria')).toHaveLength(1)
  })

  it('renders exactly one checkbox per family plus ONE shared select-all (bulk survives on phone)', () => {
    render(<Wrapper />)
    // 1 select-all + 3 rows; a duplicated card/grid tree would double this.
    expect(screen.getAllByRole('checkbox')).toHaveLength(families.length + 1)
    // The select-all is labeled for the base-width phone line.
    expect(
      screen.getByRole('checkbox', { name: 'Select all (3)' })
    ).toBeInTheDocument()
  })

  it('replaces the dead column-header row with a "Select all (n)" line that keeps bulk-confirm a 2-tap flow', async () => {
    render(<Wrapper />)
    // Tap 1: select all…
    await userEvent.click(screen.getByText('Select all (3)'))
    expect(screen.getByText(/3 selected/i)).toBeInTheDocument()
    // …tap 2: Confirm is right there in the toolbar, full label intact.
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument()
  })

  it('"Select all (n)" tracks the filtered count', async () => {
    render(<Wrapper />)
    await userEvent.type(screen.getByPlaceholderText(/search/i), 'chen')
    expect(screen.getByText('Select all (1)')).toBeInTheDocument()
  })

  it('shows the balance money-pill ONLY for positive balances — no dash noise, no Campers cell', () => {
    render(
      <FamiliesTable
        {...noopProps}
        families={[
          makeFam({ id: 'fam-owes', first_name: 'Owen', last_name: 'Zheng', amount_due: 120, amount_paid: 50 }),
          makeFam({ id: 'fam-paid', first_name: 'Paula', last_name: 'Iverson', amount_due: 80, amount_paid: 80 }),
          makeFam({ id: 'fam-none', first_name: 'Nia', last_name: 'Okafor' }),
        ]}
      />
    )
    // Check-in's money-pill idiom, once, for the family that owes.
    expect(screen.getAllByText('$70 due')).toHaveLength(1)
    // Settled / no-amount families get NO chip and NO '—' placeholder…
    expect(screen.queryByText('—')).not.toBeInTheDocument()
    expect(screen.queryByText(/\$0/)).not.toBeInTheDocument()
    // …and the refuted Campers column stays dead.
    expect(screen.queryByText(/campers/i)).not.toBeInTheDocument()
  })

  it('keeps fractional balances honest in the pill (check-in fmtMoney parity)', () => {
    render(
      <FamiliesTable
        {...noopProps}
        families={[
          makeFam({ id: 'fam-frac', first_name: 'Faye', last_name: 'Quinn', amount_due: 1243.5, amount_paid: 0 }),
        ]}
      />
    )
    expect(screen.getByText('$1,243.50 due')).toBeInTheDocument()
  })

  it('row checkbox toggles selection without opening the slide-over; row tap still opens it (separate targets)', async () => {
    const onSelectFamily = vi.fn()
    const onToggleRow = vi.fn()
    render(
      <FamiliesTable
        {...noopProps}
        families={families}
        onSelectFamily={onSelectFamily}
        onToggleRow={onToggleRow}
      />
    )
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Chen, Lisa' }))
    expect(onToggleRow).toHaveBeenCalledWith('fam-1')
    expect(onSelectFamily).not.toHaveBeenCalled()
    await userEvent.click(screen.getByText('Chen, Lisa'))
    expect(onSelectFamily).toHaveBeenCalledWith('fam-1')
  })

  // D8 (inc-1 44px hard gate): the ~24px checkbox beside a row-tap was a
  // mis-tap hazard — the wrong action (slide-over vs select) on a thumb miss.
  it('wraps the row checkbox in a 44px hit area (kit size-11) that toggles selection and never navigates', async () => {
    const onSelectFamily = vi.fn()
    const onToggleRow = vi.fn()
    render(
      <FamiliesTable
        {...noopProps}
        families={families}
        onSelectFamily={onSelectFamily}
        onToggleRow={onToggleRow}
      />
    )
    const checkbox = screen.getByRole('checkbox', { name: 'Select Chen, Lisa' })
    const hitArea = checkbox.closest('label')
    expect(hitArea).not.toBeNull()
    // The kit's touch square (Button "icon-touch" parity): 44px both
    // dimensions below sm; `sm:contents` dissolves it so the desktop grid
    // sees the checkbox itself — unchanged.
    expect(hitArea!.className).toMatch(/\bsize-11\b/)
    expect(hitArea!.className).toMatch(/\bsm:contents\b/)
    // A hit-area tap toggles selection only — it must never fall through to
    // the row navigation.
    await userEvent.click(hitArea!)
    expect(onToggleRow).toHaveBeenCalledWith('fam-1')
    expect(onSelectFamily).not.toHaveBeenCalled()
  })

  it('BulkToolbar keeps every action label when selection is active (wraps at 375, never truncates)', async () => {
    render(<Wrapper />)
    await userEvent.click(screen.getByText('Select all (3)'))
    for (const label of ['Confirm', 'Waitlist', 'Cancel', 'Export selected', 'Clear selection']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
  })
})
