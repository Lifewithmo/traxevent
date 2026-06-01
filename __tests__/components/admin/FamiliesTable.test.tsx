import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { useState as useStateReact } from 'react'
import { FamiliesTable } from '@/components/admin/FamiliesTable'
import type { Family } from '@/lib/types'

const makeFam = (overrides: Partial<Family> = {}): Family => ({
  id: 'fam-1',
  org_id: 'org-1',
  camp_id: 'camp-1',
  org_slug: 'acme',
  camp_slug: 'summer-2025',
  camp_name: 'Summer Camp',
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
