import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// app/api/cron — the hourly tick. The guard is the whole point: FAIL CLOSED
// with the env UNSET (B1 — an explicit check, never compare-to-undefined
// equality), 401 on a wrong/missing header, and the observable summary is
// both returned and logged on success. Per-org isolation lives inside
// runEveningSend (covered in __tests__/lib/ops/evening-send.test.ts); here we
// pin that the route passes the summary through untouched.

const runEveningSendSpy = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ orgs_scanned: 3, sent: 1, skipped: 2, errors: 0 }),
)
vi.mock('@/lib/ops/evening-send', () => ({ runEveningSend: runEveningSendSpy }))

import { GET } from '@/app/api/cron/route'

function request(auth?: string): Request {
  return new Request('https://traxevent.com/api/cron', {
    headers: auth ? { authorization: auth } : {},
  })
}

const ORIGINAL_SECRET = process.env.CRON_SECRET

beforeEach(() => {
  vi.clearAllMocks()
  runEveningSendSpy.mockResolvedValue({ orgs_scanned: 3, sent: 1, skipped: 2, errors: 0 })
  process.env.CRON_SECRET = 'shh-hourly'
})

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = ORIGINAL_SECRET
})

describe('CRON_SECRET guard', () => {
  it('FAILS CLOSED when the env var is UNSET — even a matching "Bearer undefined" header is rejected', async () => {
    delete process.env.CRON_SECRET
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    // The header a naive `auth === `Bearer ${process.env.CRON_SECRET}`` would accept:
    const res = await GET(request('Bearer undefined'))
    errorSpy.mockRestore()
    expect(res.status).toBe(503)
    expect(runEveningSendSpy).not.toHaveBeenCalled()
  })

  it('fails closed on an EMPTY secret too', async () => {
    process.env.CRON_SECRET = ''
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await GET(request('Bearer '))
    errorSpy.mockRestore()
    expect(res.status).toBe(503)
    expect(runEveningSendSpy).not.toHaveBeenCalled()
  })

  it('rejects a missing authorization header', async () => {
    const res = await GET(request())
    expect(res.status).toBe(401)
    expect(runEveningSendSpy).not.toHaveBeenCalled()
  })

  it('rejects a wrong secret', async () => {
    const res = await GET(request('Bearer wrong'))
    expect(res.status).toBe(401)
    expect(runEveningSendSpy).not.toHaveBeenCalled()
  })
})

describe('the tick', () => {
  it('runs with the right secret and returns + logs the per-run summary', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const res = await GET(request('Bearer shh-hourly'))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ orgs_scanned: 3, sent: 1, skipped: 2, errors: 0 })
    expect(logSpy).toHaveBeenCalledWith(
      '[cron] evening-send',
      JSON.stringify({ orgs_scanned: 3, sent: 1, skipped: 2, errors: 0 }),
    )
    logSpy.mockRestore()
  })

  it('a broken tick (enumeration failure) is a loud 500, never a silent 200', async () => {
    runEveningSendSpy.mockRejectedValueOnce(new Error('orgs enumeration failed'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await GET(request('Bearer shh-hourly'))
    errorSpy.mockRestore()
    expect(res.status).toBe(500)
  })
})
