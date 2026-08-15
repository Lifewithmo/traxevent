import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InvoiceCatalogPicker } from '@/components/admin/InvoiceCatalogPicker'

const listWorkPackagesMock = vi.hoisted(() => vi.fn(async () => [] as unknown[]))
const createWorkPackageMock = vi.hoisted(() => vi.fn())
vi.mock('@/actions/work-packages', () => ({
  listWorkPackages: () => listWorkPackagesMock(),
  createWorkPackage: (...args: unknown[]) => createWorkPackageMock(...args),
}))

// The picker is mounted once by the editor and toggled via `open`, never unmounted —
// so these tests drive `open` on a persistent instance rather than remounting, which
// is what makes the entry-cache behavior observable.
function Harness({ onPick = vi.fn() }: { onPick?: (item: unknown) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>open picker</button>
      <InvoiceCatalogPicker orgId="org1" open={open} onOpenChange={setOpen} onPick={onPick} />
    </>
  )
}

describe('InvoiceCatalogPicker', () => {
  beforeEach(() => {
    listWorkPackagesMock.mockClear()
    listWorkPackagesMock.mockResolvedValue([])
    createWorkPackageMock.mockClear()
  })

  it('labels the search field rather than relying on the placeholder', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: /open picker/i }))
    expect(await screen.findByLabelText(/search catalog/i)).toBeInTheDocument()
  })

  it('announces a load failure inside a live region', async () => {
    const user = userEvent.setup()
    listWorkPackagesMock.mockRejectedValueOnce(new Error('catalog unavailable'))
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: /open picker/i }))
    const msg = await screen.findByText(/catalog unavailable/i)
    expect(msg.closest('[aria-live="polite"]')).not.toBeNull()
  })

  it('adds a created item to the cache, so reopening does not offer to create it again', async () => {
    const user = userEvent.setup()
    createWorkPackageMock.mockResolvedValueOnce({ id: 'wp1', name: 'Bar setup', price: 250 })
    const onPick = vi.fn()
    render(<Harness onPick={onPick} />)

    await user.click(screen.getByRole('button', { name: /open picker/i }))
    await user.type(await screen.findByLabelText(/search catalog/i), 'Bar setup')
    await user.click(screen.getByRole('button', { name: /create .*bar setup.* as a catalog item/i }))
    await user.type(screen.getByLabelText(/^price$/i), '250')
    await user.click(screen.getByRole('button', { name: /create & add/i }))

    expect(createWorkPackageMock).toHaveBeenCalledTimes(1)
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Bar setup', unit_price: 250 }),
    )

    // Reopen and search the same name. Before the cache fix the stale `entries`
    // array still had no match, so the operator was offered "Create …" a second
    // time — writing a duplicate work package.
    await user.click(screen.getByRole('button', { name: /open picker/i }))
    await user.type(await screen.findByLabelText(/search catalog/i), 'Bar setup')
    expect(screen.queryByRole('button', { name: /create .*bar setup.* as a catalog item/i })).toBeNull()
    expect(screen.getByRole('button', { name: /bar setup/i })).toBeInTheDocument()
  })

  it('offers a one-off line when nothing matches', async () => {
    const user = userEvent.setup()
    const onPick = vi.fn()
    render(<Harness onPick={onPick} />)
    await user.click(screen.getByRole('button', { name: /open picker/i }))
    await user.type(await screen.findByLabelText(/search catalog/i), 'Ad hoc thing')
    await user.click(screen.getByRole('button', { name: /add .*ad hoc thing.* as a one-off line/i }))
    expect(onPick).toHaveBeenCalledWith({ description: 'Ad hoc thing', unit_price: 0 })
  })
})
