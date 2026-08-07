import { describe, it, expect, vi, beforeEach } from 'vitest'

const save = vi.hoisted(() => vi.fn())
const makePublic = vi.hoisted(() => vi.fn())
const publicUrl = vi.hoisted(() => vi.fn().mockReturnValue('https://storage/logo.png'))
const file = vi.hoisted(() => vi.fn().mockReturnValue({ save, makePublic, publicUrl }))

vi.mock('@/lib/firebase-admin', () => ({ adminBucket: { file } }))
vi.mock('@/lib/auth/assert', () => ({ assertOrgAdmin: vi.fn() }))

import { uploadOrgAsset } from '@/actions/org-assets'
import { assertOrgAdmin } from '@/lib/auth/assert'

function fd(f: unknown): FormData {
  const form = new FormData()
  if (f) form.set('file', f as Blob)
  return form
}

beforeEach(() => vi.clearAllMocks())

describe('uploadOrgAsset', () => {
  it('uploads an org logo to an org-scoped path and returns its public url', async () => {
    const png = new File([new Uint8Array([1, 2, 3])], 'my logo.png', { type: 'image/png' })
    const res = await uploadOrgAsset('o1', 'logo', fd(png))
    expect(assertOrgAdmin).toHaveBeenCalledWith('o1')
    expect(file.mock.calls[0][0]).toMatch(/^org-assets\/o1\/logo\/\d+-my_logo\.png$/)
    expect(makePublic).toHaveBeenCalled()
    expect(res).toEqual({ url: 'https://storage/logo.png' })
  })

  it('scopes cover uploads under the cover kind', async () => {
    const jpg = new File([new Uint8Array([1])], 'hero.jpg', { type: 'image/jpeg' })
    await uploadOrgAsset('o1', 'cover', fd(jpg))
    expect(file.mock.calls[0][0]).toMatch(/^org-assets\/o1\/cover\//)
  })

  it('rejects an unknown asset kind', async () => {
    const png = new File([new Uint8Array([1])], 'a.png', { type: 'image/png' })
    await expect(uploadOrgAsset('o1', 'banner' as never, fd(png))).rejects.toThrow(/kind/i)
    expect(save).not.toHaveBeenCalled()
  })

  it('rejects a non-image file', async () => {
    const txt = new File(['x'], 'a.txt', { type: 'text/plain' })
    await expect(uploadOrgAsset('o1', 'logo', fd(txt))).rejects.toThrow(/image/i)
    expect(save).not.toHaveBeenCalled()
  })

  it('rejects a file over 8MB', async () => {
    const big = new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'b.png', { type: 'image/png' })
    await expect(uploadOrgAsset('o1', 'logo', fd(big))).rejects.toThrow(/8MB/i)
  })

  it('rejects a missing file', async () => {
    await expect(uploadOrgAsset('o1', 'logo', fd(null))).rejects.toThrow(/no file/i)
  })
})
