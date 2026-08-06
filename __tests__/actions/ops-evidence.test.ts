import { describe, it, expect, vi, beforeEach } from 'vitest'

const saveSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const makePublicSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const publicUrlSpy = vi.hoisted(() => vi.fn().mockReturnValue('https://storage.googleapis.com/b/ops-evidence/x.jpg'))
const fileSpy = vi.hoisted(() => vi.fn().mockReturnValue({ save: saveSpy, makePublic: makePublicSpy, publicUrl: publicUrlSpy }))

vi.mock('@/lib/firebase-admin', () => ({
  adminBucket: { file: fileSpy },
}))
vi.mock('@/lib/auth/assert', () => ({
  assertEventPage: vi.fn().mockResolvedValue({ uid: 'u1', role: 'staff', event_access: {} }),
}))

import { assertEventPage } from '@/lib/auth/assert'
import { uploadEvidencePhoto } from '@/actions/ops-evidence'

function photoForm(name = 'espresso.jpg', type = 'image/jpeg', bytes = 1024): FormData {
  const fd = new FormData()
  fd.append('file', new File([new Uint8Array(bytes)], name, { type }))
  return fd
}

beforeEach(() => vi.clearAllMocks())

describe('uploadEvidencePhoto', () => {
  it('gates on the ops event page', async () => {
    await uploadEvidencePhoto('o1', 'e1', photoForm())
    expect(assertEventPage).toHaveBeenCalledWith('o1', 'e1', 'ops')
  })

  it('stores under ops-evidence/{org}/{event} and returns a public url', async () => {
    const { url } = await uploadEvidencePhoto('o1', 'e1', photoForm())
    expect(fileSpy.mock.calls[0][0]).toMatch(/^ops-evidence\/o1\/e1\/\d+-espresso\.jpg$/)
    expect(makePublicSpy).toHaveBeenCalled()
    expect(url).toBe('https://storage.googleapis.com/b/ops-evidence/x.jpg')
  })

  it('rejects non-images and oversized files', async () => {
    await expect(uploadEvidencePhoto('o1', 'e1', photoForm('a.pdf', 'application/pdf'))).rejects.toThrow('Only image uploads are allowed')
    await expect(uploadEvidencePhoto('o1', 'e1', photoForm('big.jpg', 'image/jpeg', 9 * 1024 * 1024))).rejects.toThrow('Photo must be under 8MB')
  })

  it('rejects a missing file', async () => {
    await expect(uploadEvidencePhoto('o1', 'e1', new FormData())).rejects.toThrow('No file provided')
  })
})
