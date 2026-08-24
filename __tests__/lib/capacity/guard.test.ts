import { describe, it, expect } from 'vitest'
import { CapacityGuardError, isCapacityGuardError, capacityGuardMessage, CAPACITY_GUARD_CODE } from '@/lib/capacity/guard'

describe('CapacityGuardError', () => {
  it('carries the stable code and name', () => {
    const err = new CapacityGuardError('Kart 1 is already booked. Book this one too?')
    expect(err.code).toBe(CAPACITY_GUARD_CODE)
    expect(err.name).toBe('CapacityGuardError')
    expect(err).toBeInstanceOf(Error)
  })

  it('is detected by isCapacityGuardError as a real instance', () => {
    expect(isCapacityGuardError(new CapacityGuardError('over capacity'))).toBe(true)
  })

  it('capacityGuardMessage strips the detection marker from a real instance', () => {
    const err = new CapacityGuardError('Sep 30, 2026 is over capacity. Book this one too?')
    expect(capacityGuardMessage(err)).toBe('Sep 30, 2026 is over capacity. Book this one too?')
  })
})

describe('isCapacityGuardError across the server-action boundary', () => {
  // The class prototype and custom props may not survive serialization; the
  // message marker is the fallback signal. Cover all three shapes a caught value
  // can take on the client.
  it('detects by code when the property survives', () => {
    expect(isCapacityGuardError({ code: 'capacity_guard', message: 'x' })).toBe(true)
  })

  it('detects by name when only the name survives', () => {
    expect(isCapacityGuardError({ name: 'CapacityGuardError', message: 'x' })).toBe(true)
  })

  it('detects by the message marker when code and name are stripped', () => {
    // A plain Error reconstructed from the wire: name 'Error', no code, but the
    // marker-prefixed message crossed intact.
    const wire = { name: 'Error', message: '[capacity-guard] Kart 1 is already booked. Book this one too?' }
    expect(isCapacityGuardError(wire)).toBe(true)
    expect(capacityGuardMessage(wire)).toBe('Kart 1 is already booked. Book this one too?')
  })

  it('does not mistake an ordinary error for a guard rejection', () => {
    expect(isCapacityGuardError(new Error('Permission denied'))).toBe(false)
    expect(isCapacityGuardError({ code: 'other', message: 'nope' })).toBe(false)
    expect(isCapacityGuardError(null)).toBe(false)
    expect(isCapacityGuardError('a string')).toBe(false)
  })

  it('capacityGuardMessage returns an un-marked message unchanged', () => {
    expect(capacityGuardMessage({ code: 'capacity_guard', message: 'plain copy' })).toBe('plain copy')
  })
})
