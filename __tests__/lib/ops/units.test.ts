import { describe, it, expect } from 'vitest'
import {
  convert, formatQuantity, normalizeUnit, unitDimension, resolveDimension,
  validateBridges, qtyValue, asQuantity, unitOptionsForResource, CANONICAL_UNIT,
} from '@/lib/ops/units'
import type { ConversionBridge } from '@/lib/types'

const lbToShot: ConversionBridge = {
  from: { qty: 1, unit: 'lb' }, to: { qty: 40, unit: 'shot' }, source: 'ai',
}

describe('normalizeUnit / unitDimension', () => {
  it('normalizes case and whitespace', () => {
    expect(normalizeUnit(' OZ ')).toBe('oz')
    expect(normalizeUnit('Gal')).toBe('gal')
  })
  it('maps universal units to dimensions; unknown units to null', () => {
    expect(unitDimension('oz')).toBe('weight')
    expect(unitDimension('fl-oz')).toBe('volume')
    expect(unitDimension('each')).toBe('count')
    expect(unitDimension('shot')).toBeNull()
  })
})

describe('convert — universal table', () => {
  it('converts within a dimension exactly', () => {
    expect(convert({ qty: 1, unit: 'gal' }, 'ml')).toEqual({ qty: 3785.411784, unit: 'ml' })
    expect(convert({ qty: 2, unit: 'lb' }, 'oz')?.qty).toBeCloseTo(32)
    expect(convert({ qty: 3, unit: 'dozen' }, 'each')?.qty).toBe(36)
  })
  it('round-trips without drift beyond float epsilon', () => {
    const there = convert({ qty: 7.3, unit: 'cup' }, 'gal')!
    const back = convert(there, 'cup')!
    expect(back.qty).toBeCloseTo(7.3, 10)
  })
  it('is identity for same unit', () => {
    expect(convert({ qty: 5, unit: 'oz' }, 'oz')).toEqual({ qty: 5, unit: 'oz' })
  })
  it('returns null across dimensions without a bridge', () => {
    expect(convert({ qty: 1, unit: 'lb' }, 'gal')).toBeNull()
  })
  it('returns null for unknown units without a bridge', () => {
    expect(convert({ qty: 1, unit: 'shot' }, 'oz')).toBeNull()
  })
})

describe('convert — bridges', () => {
  it('crosses dimensions through a bridge', () => {
    // 2 kg → g → lb → shot: 2000 / 453.59237 * 40 ≈ 176.37
    expect(convert({ qty: 2, unit: 'kg' }, 'shot', [lbToShot])?.qty).toBeCloseTo(176.37, 2)
  })
  it('traverses bridges in reverse', () => {
    // 80 shot → 2 lb
    expect(convert({ qty: 80, unit: 'shot' }, 'lb', [lbToShot])?.qty).toBeCloseTo(2)
  })
  it('normalizes bridge ratios (from.qty ≠ 1)', () => {
    const b: ConversionBridge = { from: { qty: 5, unit: 'lb' }, to: { qty: 1, unit: 'keg' }, source: 'ai' }
    expect(convert({ qty: 10, unit: 'lb' }, 'keg', [b])?.qty).toBeCloseTo(2)
  })
  it('chains custom units: keg → pint → fl-oz', () => {
    const kegToPint: ConversionBridge = { from: { qty: 1, unit: 'keg' }, to: { qty: 124, unit: 'pint' }, source: 'ai' }
    expect(convert({ qty: 1, unit: 'keg' }, 'fl-oz', [kegToPint])?.qty).toBeCloseTo(124 * 16)
  })
})

describe('formatQuantity', () => {
  it('renders the largest unit ≥ 1 within the hinted unit system', () => {
    expect(formatQuantity({ qty: 5678, unit: 'ml' }, 'gal')).toEqual({ qty: 1.5, unit: 'gal' })
    expect(formatQuantity({ qty: 2260.87, unit: 'g' }, 'oz')).toEqual({ qty: 4.98, unit: 'lb' })
  })
  it('stays in the input unit system without a hint', () => {
    expect(formatQuantity({ qty: 2260.87, unit: 'g' })).toEqual({ qty: 2.26, unit: 'kg' })
    expect(formatQuantity({ qty: 5678, unit: 'ml' })).toEqual({ qty: 5.68, unit: 'l' })
  })
  it('ignores a hint from a different dimension or a custom unit', () => {
    expect(formatQuantity({ qty: 2260.87, unit: 'g' }, 'gal')).toEqual({ qty: 2.26, unit: 'kg' })
    expect(formatQuantity({ qty: 2260.87, unit: 'g' }, 'shot')).toEqual({ qty: 2.26, unit: 'kg' })
  })
  it('falls back to the smallest unit below 1', () => {
    expect(formatQuantity({ qty: 0.5, unit: 'ml' })).toEqual({ qty: 0.5, unit: 'ml' })
  })
  it('count always renders as each — never dozens', () => {
    expect(formatQuantity({ qty: 150, unit: 'each' })).toEqual({ qty: 150, unit: 'each' })
    expect(formatQuantity({ qty: 2, unit: 'dozen' })).toEqual({ qty: 24, unit: 'each' })
  })
  it('leaves custom units as entered (rounded to 2dp)', () => {
    expect(formatQuantity({ qty: 40.333333, unit: 'shot' })).toEqual({ qty: 40.33, unit: 'shot' })
  })
})

describe('qtyValue / asQuantity (legacy bare numbers)', () => {
  it('reads bare numbers and Quantity objects', () => {
    expect(qtyValue(3)).toBe(3)
    expect(qtyValue({ qty: 2.5, unit: 'oz' })).toBe(2.5)
  })
  it('wraps bare numbers in the fallback unit', () => {
    expect(asQuantity(3, 'oz')).toEqual({ qty: 3, unit: 'oz' })
    expect(asQuantity({ qty: 1, unit: 'lb' }, 'oz')).toEqual({ qty: 1, unit: 'lb' })
  })
})

describe('resolveDimension', () => {
  it('prefers the stored dimension', () => {
    expect(resolveDimension({ dimension: 'volume', unit: 'oz' })).toBe('volume')
  })
  it('infers from a universal display unit', () => {
    expect(resolveDimension({ unit: 'oz' })).toBe('weight')
    expect(resolveDimension({ unit: 'gal' })).toBe('volume')
  })
  it('defaults to count', () => {
    expect(resolveDimension({ unit: 'bag' })).toBe('count')
    expect(resolveDimension({})).toBe('count')
  })
})

describe('validateBridges', () => {
  it('accepts cross-dimension and custom-unit bridges', () => {
    expect(() => validateBridges([lbToShot])).not.toThrow()
  })
  it('rejects non-positive or non-finite quantities', () => {
    expect(() => validateBridges([{ from: { qty: 0, unit: 'lb' }, to: { qty: 40, unit: 'shot' }, source: 'ai' }]))
      .toThrow('Conversion quantities must be positive')
    expect(() => validateBridges([{ from: { qty: 1, unit: 'lb' }, to: { qty: Infinity, unit: 'shot' }, source: 'ai' }]))
      .toThrow('Conversion quantities must be positive')
  })
  it('rejects bridges between two universal units of the same dimension', () => {
    expect(() => validateBridges([{ from: { qty: 1, unit: 'oz' }, to: { qty: 2, unit: 'lb' }, source: 'ai' }]))
      .toThrow('built-in')
  })
})

describe('unitOptionsForResource', () => {
  it('lists the display unit first, then dimension units, then bridge units', () => {
    const opts = unitOptionsForResource({ unit: 'oz', conversions: [lbToShot] })
    expect(opts[0]).toBe('oz')
    expect(opts).toContain('lb')
    expect(opts).toContain('kg')
    expect(opts).toContain('shot')
    expect(opts).not.toContain('gal')
  })
  it('falls back to count units for unitless resources', () => {
    expect(unitOptionsForResource({})).toEqual(['each', 'dozen'])
  })
})

describe('CANONICAL_UNIT', () => {
  it('is ml / g / each', () => {
    expect(CANONICAL_UNIT).toEqual({ volume: 'ml', weight: 'g', count: 'each' })
  })
})
