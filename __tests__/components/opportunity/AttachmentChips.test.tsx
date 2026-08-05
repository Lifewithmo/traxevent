import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AttachmentChips } from '@/components/admin/opportunity/AttachmentChips'

describe('AttachmentChips', () => {
  it('renders a chip per attachment kind with counts', () => {
    render(<AttachmentChips
      proposals={[{ status: 'accepted' } as any]}
      invoices={[]}
      contracts={[]}
      vendors={[]}
    />)
    expect(screen.getByText(/Proposals/)).toBeInTheDocument()
    expect(screen.getByText(/1 accepted/)).toBeInTheDocument()
    expect(screen.getByText(/Invoices/)).toBeInTheDocument()
  })
})
