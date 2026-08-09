import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AttachmentChips } from '@/components/admin/opportunity/AttachmentChips'
import { attachmentChips } from '@/lib/opportunity-detail'
import type { Proposal } from '@/lib/types'

describe('AttachmentChips', () => {
  it('renders a chip per attachment kind with counts', () => {
    const chips = attachmentChips({
      tasks: [],
      today: '2026-08-07',
      proposals: [{ status: 'accepted' } as Partial<Proposal> as Proposal],
      invoices: [],
      contracts: [],
      vendors: [],
    })
    render(<AttachmentChips chips={chips} selected="task" onSelect={vi.fn()} />)
    expect(screen.getByText(/Proposals/)).toBeInTheDocument()
    expect(screen.getByText(/1 accepted/)).toBeInTheDocument()
    expect(screen.getByText(/Invoices/)).toBeInTheDocument()
  })
})
