import { describe, it, expect } from 'vitest'
import { parseOnboardRows } from '@/lib/bulk-onboard'

describe('parseOnboardRows', () => {
  it('parses "Name, email" lines', () => {
    const rows = parseOnboardRows('First Baptist, pastor@fb.org\nGrace Chapel, admin@grace.org')
    expect(rows).toEqual([
      { orgName: 'First Baptist', adminEmail: 'pastor@fb.org' },
      { orgName: 'Grace Chapel', adminEmail: 'admin@grace.org' },
    ])
  })

  it('trims whitespace and ignores blank lines', () => {
    const rows = parseOnboardRows('  First Baptist ,  pastor@fb.org  \n\n')
    expect(rows).toEqual([{ orgName: 'First Baptist', adminEmail: 'pastor@fb.org' }])
  })

  it('flags rows with a missing field or invalid email', () => {
    const rows = parseOnboardRows('No Email Church\nBad Email, not-an-email\nOK, a@b.co')
    expect(rows[0]).toMatchObject({ orgName: 'No Email Church', error: expect.any(String) })
    expect(rows[1]).toMatchObject({ orgName: 'Bad Email', adminEmail: 'not-an-email', error: expect.any(String) })
    expect(rows[2]).toEqual({ orgName: 'OK', adminEmail: 'a@b.co' })
  })

  it('treats the last comma-separated token as the email (org names may contain commas)', () => {
    const rows = parseOnboardRows('St. John, Vianney, office@stjv.org')
    expect(rows).toEqual([{ orgName: 'St. John, Vianney', adminEmail: 'office@stjv.org' }])
  })
})
