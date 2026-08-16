import { render, screen } from '@testing-library/react'
import { it, expect } from 'vitest'
import { EmptyState } from '@/components/ui/empty-state'

it('renders title, description and an action slot', () => {
  render(<EmptyState title="No proposals yet" description="Send one to get started" action={<button>Draft one</button>} />)
  expect(screen.getByText('No proposals yet')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Draft one' })).toBeInTheDocument()
})
