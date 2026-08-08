import { describe, it, expect } from 'vitest'
import { parseOrgBranding, contrastRatio, readableTextOn, accentForTextOnWhite } from '@/lib/branding'

describe('parseOrgBranding', () => {
  it('accepts a full valid branding object and normalizes hex to lowercase', () => {
    expect(
      parseOrgBranding({
        display_name: '  BrewTrax Mobile  ',
        logo_url: 'https://storage.googleapis.com/x/logo.png',
        cover_image_url: 'https://storage.googleapis.com/x/cover.jpg',
        accent_color: '#1D4ED8',
        secondary_color: '#4b5563',
      })
    ).toEqual({
      display_name: 'BrewTrax Mobile',
      logo_url: 'https://storage.googleapis.com/x/logo.png',
      cover_image_url: 'https://storage.googleapis.com/x/cover.jpg',
      accent_color: '#1d4ed8',
      secondary_color: '#4b5563',
    })
  })

  it('omits empty and missing fields (never stores undefined)', () => {
    const out = parseOrgBranding({ display_name: '  ', accent_color: '#112233' })
    expect(out).toEqual({ accent_color: '#112233' })
    expect(Object.values(out).every((v) => v !== undefined)).toBe(true)
  })

  it('rejects malformed colors', () => {
    expect(() => parseOrgBranding({ accent_color: 'red' })).toThrow(/#rrggbb/i)
    expect(() => parseOrgBranding({ secondary_color: '#12345' })).toThrow(/#rrggbb/i)
    expect(() => parseOrgBranding({ accent_color: '#12345g' })).toThrow(/#rrggbb/i)
  })

  it('rejects non-https URLs', () => {
    expect(() => parseOrgBranding({ logo_url: 'http://x.com/a.png' })).toThrow(/https/i)
    expect(() => parseOrgBranding({ cover_image_url: 'javascript:alert(1)' })).toThrow(/https/i)
    expect(() => parseOrgBranding({ logo_url: 'not a url' })).toThrow(/https/i)
  })

  it('drops unknown fields and rejects non-object input', () => {
    expect(parseOrgBranding({ accent_color: '#112233', evil: 'x' })).toEqual({ accent_color: '#112233' })
    expect(() => parseOrgBranding(null)).toThrow()
    expect(() => parseOrgBranding('x')).toThrow()
  })
})

describe('contrastRatio', () => {
  it('is 21 for black on white and 1 for identical colors', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0)
    expect(contrastRatio('#ffffff', '#ffffff')).toBe(1)
  })

  it('is symmetric', () => {
    expect(contrastRatio('#1d4ed8', '#ffffff')).toBeCloseTo(contrastRatio('#ffffff', '#1d4ed8'), 5)
  })
})

describe('readableTextOn', () => {
  it('picks white on dark backgrounds and near-black on light ones', () => {
    expect(readableTextOn('#000000')).toBe('#ffffff')
    expect(readableTextOn('#1d4ed8')).toBe('#ffffff')
    expect(readableTextOn('#ffffff')).toBe('#111827')
    expect(readableTextOn('#ffff00')).toBe('#111827')
  })
})

describe('accentForTextOnWhite', () => {
  it('returns an already-AA accent unchanged', () => {
    expect(accentForTextOnWhite('#1d4ed8')).toBe('#1d4ed8')
  })

  it('darkens a failing accent until it meets AA against white', () => {
    const clamped = accentForTextOnWhite('#ff0000') // pure red is ~4.0:1
    expect(clamped).not.toBe('#ff0000')
    expect(contrastRatio(clamped, '#ffffff')).toBeGreaterThanOrEqual(4.5)
  })

  it('terminates even for white-on-white (worst case)', () => {
    expect(contrastRatio(accentForTextOnWhite('#ffffff'), '#ffffff')).toBeGreaterThanOrEqual(4.5)
  })
})
