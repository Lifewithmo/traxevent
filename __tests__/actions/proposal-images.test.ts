import { describe, it, expect, vi, beforeEach } from 'vitest'

const save = vi.hoisted(() => vi.fn())
const file = vi.hoisted(() => vi.fn().mockReturnValue({ save }))

vi.mock('@/lib/firebase-admin', () => ({ adminBucket: { file, name: 'test-bucket' } }))
vi.mock('@/lib/auth/assert', () => ({ assertOrgAdmin: vi.fn() }))

import { uploadProposalImage } from '@/actions/proposal-images'
import { assertOrgAdmin } from '@/lib/auth/assert'

function fd(f: unknown): FormData {
  const form = new FormData()
  if (f) form.set('file', f as Blob)
  return form
}

beforeEach(() => vi.clearAllMocks())

describe('uploadProposalImage', () => {
  it('uploads an image and returns a tokenized download url', async () => {
    const png = new File([new Uint8Array([1, 2, 3])], 'my photo.png', { type: 'image/png' })
    const res = await uploadProposalImage('o1', 'p1', fd(png))
    expect(assertOrgAdmin).toHaveBeenCalledWith('o1')
    const path = file.mock.calls[0][0] as string
    expect(path).toMatch(/^proposal-images\/o1\/p1\/\d+-my_photo\.png$/)
    const token = save.mock.calls[0][1].metadata.metadata.firebaseStorageDownloadTokens
    expect(token).toMatch(/^[0-9a-f-]{36}$/)
    expect(res.url).toBe(
      `https://firebasestorage.googleapis.com/v0/b/test-bucket/o/${encodeURIComponent(path)}?alt=media&token=${token}`,
    )
  })

  it('rejects a non-image file', async () => {
    const txt = new File(['x'], 'a.txt', { type: 'text/plain' })
    await expect(uploadProposalImage('o1', 'p1', fd(txt))).rejects.toThrow(/image/i)
    expect(save).not.toHaveBeenCalled()
  })

  it('rejects a file over 8MB', async () => {
    const big = new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'b.png', { type: 'image/png' })
    await expect(uploadProposalImage('o1', 'p1', fd(big))).rejects.toThrow(/8MB/i)
  })

  it('rejects a missing file', async () => {
    await expect(uploadProposalImage('o1', 'p1', fd(null))).rejects.toThrow(/no file/i)
  })
})
