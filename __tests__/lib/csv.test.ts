import { describe, it, expect } from 'vitest'
import { exportFamiliesCsv } from '@/lib/csv'
import type { FamilyCsvRow } from '@/lib/types'

const makeRow = (overrides: Partial<FamilyCsvRow> = {}): FamilyCsvRow => ({
  familyName: 'Chen, Lisa',
  email: 'lisa@example.com',
  phone: '555-1234',
  campers: 'Mia; Noah',
  status: 'pending',
  balance: '$350.00',
  submitted: '2025-05-12',
  ...overrides,
})

describe('exportFamiliesCsv', () => {
  it('includes the correct header row', () => {
    const csv = exportFamiliesCsv([])
    expect(csv.split('\n')[0]).toBe(
      'Family Name,Email,Phone,Campers,Status,Balance,Submitted'
    )
  })

  it('returns header only for empty input', () => {
    const csv = exportFamiliesCsv([])
    expect(csv).toBe('Family Name,Email,Phone,Campers,Status,Balance,Submitted')
  })

  it('produces one data row per family', () => {
    const csv = exportFamiliesCsv([makeRow(), makeRow({ familyName: 'Smith, Bob' })])
    expect(csv.split('\n')).toHaveLength(3)
  })

  it('wraps every field in double quotes', () => {
    const csv = exportFamiliesCsv([makeRow()])
    const dataLine = csv.split('\n')[1]
    // Split on field boundary (between closing quote + comma + opening quote)
    // then verify the outer quotes on first and last
    expect(dataLine.startsWith('"')).toBe(true)
    expect(dataLine.endsWith('"')).toBe(true)
    // Every field boundary should be ","
    const fieldBoundaries = dataLine.match(/","/g)
    expect(fieldBoundaries).toHaveLength(6) // 7 fields = 6 boundaries
  })

  it('escapes double quotes inside field values', () => {
    const csv = exportFamiliesCsv([makeRow({ familyName: 'O"Brien, Tim' })])
    expect(csv).toContain('"O""Brien, Tim"')
  })

  it('includes all seven columns in each row', () => {
    const csv = exportFamiliesCsv([makeRow()])
    const dataLine = csv.split('\n')[1]
    // Count top-level commas (between quoted fields)
    const cols = dataLine.split('","')
    expect(cols).toHaveLength(7)
  })
})
