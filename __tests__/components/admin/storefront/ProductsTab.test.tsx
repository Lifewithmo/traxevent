import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const createProductSpy = vi.hoisted(() => vi.fn())
const updateProductSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const uploadPhotoSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ url: 'https://x/p.jpg' }))
vi.mock('@/actions/products', () => ({
  createProduct: createProductSpy, updateProduct: updateProductSpy, uploadProductPhoto: uploadPhotoSpy,
}))

import { ProductsTab } from '@/components/admin/storefront/ProductsTab'

const PRODUCTS = [
  { id: 'p1', name: 'Vanilla Latte', price: 5.5, active: true, created_at: 'x' },
  { id: 'p2', name: 'Old Special', price: 4, active: false, created_at: 'x' },
]

describe('ProductsTab', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists active products and marks archived ones', () => {
    render(<ProductsTab orgId="org-1" isAdmin products={PRODUCTS} />)
    expect(screen.getByText('Vanilla Latte')).toBeInTheDocument()
    expect(screen.getByText(/archived/i)).toBeInTheDocument()
  })

  it('creates a product from the form and shows it optimistically', async () => {
    createProductSpy.mockResolvedValue({ id: 'p3', name: 'Cold Brew', price: 4.5, active: true, created_at: 'x' })
    render(<ProductsTab orgId="org-1" isAdmin products={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /new product/i }))
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Cold Brew' } })
    fireEvent.change(screen.getByLabelText(/price/i), { target: { value: '4.5' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(screen.getByText('Cold Brew')).toBeInTheDocument())
    expect(createProductSpy).toHaveBeenCalledWith('org-1', expect.objectContaining({ name: 'Cold Brew', price: 4.5 }))
  })

  it('hides mutation controls for non-admins', () => {
    render(<ProductsTab orgId="org-1" isAdmin={false} products={PRODUCTS} />)
    expect(screen.queryByRole('button', { name: /new product/i })).not.toBeInTheDocument()
  })
})
