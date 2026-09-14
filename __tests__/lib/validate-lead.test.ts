import { describe, it, expect } from 'vitest'
import { validateLeadFields, firstLeadFieldError } from '@/lib/crm/validate'

/*
  Shared lead-field validation (increment: New Opportunity). ONE rule set for
  every door a lead comes through — the public intake form and the operator's
  New-opportunity form — so the operator path can never accept less than the
  public path does. The messages are byte-for-byte the strings the intake form
  has always thrown; intake behavior must not change by sharing.
*/

describe('validateLeadFields', () => {
  it('returns an empty object when everything is absent and nothing is required', () => {
    expect(validateLeadFields({})).toEqual({})
  })

  it('accepts a fully-populated valid submission', () => {
    expect(
      validateLeadFields(
        {
          name: 'Ada Lovelace',
          email: 'ada@example.com',
          phone: '555-1234',
          event_type: 'Wedding',
          event_date: '2026-10-10',
          guest_count: 120,
          estimated_value: 4500,
          notes: 'Looking forward to it',
        },
        { requireName: true, requireEmail: true }
      )
    ).toEqual({})
  })

  describe('name', () => {
    it('requires a name when requireName is set', () => {
      expect(validateLeadFields({}, { requireName: true }).name).toBe('Please enter your name.')
      expect(validateLeadFields({ name: '   ' }, { requireName: true }).name).toBe(
        'Please enter your name.'
      )
    })

    it('does not require a name by default', () => {
      expect(validateLeadFields({}).name).toBeUndefined()
    })

    it('rejects a name over 200 chars even when not required', () => {
      expect(validateLeadFields({ name: 'x'.repeat(201) }).name).toBe('Please enter your name.')
    })

    it('accepts a trimmed name of exactly 200 chars', () => {
      expect(validateLeadFields({ name: `  ${'x'.repeat(200)}  ` }, { requireName: true })).toEqual({})
    })
  })

  describe('email', () => {
    it('requires a valid email when requireEmail is set', () => {
      expect(validateLeadFields({}, { requireEmail: true }).email).toBe(
        'Please enter a valid email address.'
      )
    })

    it('is optional by default but validated when present', () => {
      expect(validateLeadFields({}).email).toBeUndefined()
      expect(validateLeadFields({ email: '' }).email).toBeUndefined()
      expect(validateLeadFields({ email: 'not-an-email' }).email).toBe(
        'Please enter a valid email address.'
      )
      expect(validateLeadFields({ email: 'has space@example.com' }).email).toBe(
        'Please enter a valid email address.'
      )
    })

    it('rejects an email over 200 chars', () => {
      expect(validateLeadFields({ email: `${'x'.repeat(195)}@ex.com` }).email).toBe(
        'Please enter a valid email address.'
      )
    })

    it('accepts a normal address', () => {
      expect(validateLeadFields({ email: 'Ada@Example.com' })).toEqual({})
    })
  })

  describe('phone and event_type length caps', () => {
    it('rejects each over 200 chars', () => {
      expect(validateLeadFields({ phone: 'x'.repeat(201) }).phone).toBe(
        'That submission looks too long.'
      )
      expect(validateLeadFields({ event_type: 'x'.repeat(201) }).event_type).toBe(
        'That submission looks too long.'
      )
    })

    it('accepts each at exactly 200 chars', () => {
      expect(validateLeadFields({ phone: 'x'.repeat(200), event_type: 'x'.repeat(200) })).toEqual({})
    })
  })

  describe('notes', () => {
    it('rejects notes over 2000 chars', () => {
      expect(validateLeadFields({ notes: 'x'.repeat(2001) }).notes).toBe(
        'Please keep your message under 2000 characters.'
      )
    })

    it('accepts notes at exactly 2000 chars', () => {
      expect(validateLeadFields({ notes: 'x'.repeat(2000) })).toEqual({})
    })
  })

  describe('event_date', () => {
    it('rejects a non-ISO date', () => {
      expect(validateLeadFields({ event_date: '10/10/2026' }).event_date).toBe(
        'Please pick a valid event date.'
      )
    })

    it('treats an empty/whitespace date as absent', () => {
      expect(validateLeadFields({ event_date: '' })).toEqual({})
      expect(validateLeadFields({ event_date: '   ' })).toEqual({})
    })

    it('a PAST date is valid — the client warns, the operator may back-log', () => {
      expect(validateLeadFields({ event_date: '2000-01-01' })).toEqual({})
    })

    it('accepts a well-formed future date', () => {
      expect(validateLeadFields({ event_date: '2026-10-10' })).toEqual({})
    })
  })

  describe('guest_count', () => {
    it('rejects non-integers and out-of-range values', () => {
      for (const bad of [3.5, -1, 100001, NaN]) {
        expect(validateLeadFields({ guest_count: bad }).guest_count).toBe(
          'Please enter a valid guest count.'
        )
      }
    })

    it('accepts the bounds and absence', () => {
      expect(validateLeadFields({ guest_count: 0 })).toEqual({})
      expect(validateLeadFields({ guest_count: 100000 })).toEqual({})
      expect(validateLeadFields({})).toEqual({})
    })
  })

  describe('estimated_value', () => {
    it('rejects non-finite and out-of-range values', () => {
      for (const bad of [NaN, Infinity, -5, 100_000_001]) {
        expect(validateLeadFields({ estimated_value: bad }).estimated_value).toBe(
          'Please enter a valid estimated value.'
        )
      }
    })

    it('accepts the bounds (decimals allowed) and absence', () => {
      expect(validateLeadFields({ estimated_value: 0 })).toEqual({})
      expect(validateLeadFields({ estimated_value: 1234.56 })).toEqual({})
      expect(validateLeadFields({ estimated_value: 100_000_000 })).toEqual({})
    })
  })

  /*
    The follow-up pair rides the SAME rule set as everything else (the module's
    one-rule-set claim): createLead used to write follow_up_date/follow_up_title
    straight through with no validation at all, so a malformed date became a
    task no due-date query would ever surface.
  */
  describe('follow_up_date', () => {
    it('rejects a non-ISO date', () => {
      expect(validateLeadFields({ follow_up_date: '16/09/2026' }).follow_up_date).toBe(
        'Please pick a valid follow-up date.'
      )
    })

    it('treats an empty/whitespace date as absent (empty ⇒ no task)', () => {
      expect(validateLeadFields({ follow_up_date: '' })).toEqual({})
      expect(validateLeadFields({ follow_up_date: '   ' })).toEqual({})
    })

    it('accepts a well-formed date, past included — same tense rule as event_date', () => {
      expect(validateLeadFields({ follow_up_date: '2026-09-16' })).toEqual({})
      expect(validateLeadFields({ follow_up_date: '2000-01-01' })).toEqual({})
    })
  })

  describe('follow_up_title', () => {
    it('rejects a title over 200 chars (trimmed)', () => {
      expect(validateLeadFields({ follow_up_title: 'x'.repeat(201) }).follow_up_title).toBe(
        'That submission looks too long.'
      )
    })

    it('accepts exactly 200 chars after trimming, and absence', () => {
      expect(validateLeadFields({ follow_up_title: `  ${'x'.repeat(200)}  ` })).toEqual({})
      expect(validateLeadFields({})).toEqual({})
    })
  })

  it('reports every invalid field at once, keyed per field', () => {
    const errors = validateLeadFields(
      { email: 'nope', event_date: 'soon', guest_count: -2 },
      { requireName: true }
    )
    expect(Object.keys(errors).sort()).toEqual(['email', 'event_date', 'guest_count', 'name'])
  })
})

describe('firstLeadFieldError', () => {
  it('returns undefined for a clean result', () => {
    expect(firstLeadFieldError({})).toBeUndefined()
  })

  it('follows the historical intake throw order (name before guest_count)', () => {
    const errors = validateLeadFields({ guest_count: -1 }, { requireName: true })
    expect(firstLeadFieldError(errors)).toBe('Please enter your name.')
  })

  it('returns the only error when a single field is invalid', () => {
    expect(firstLeadFieldError(validateLeadFields({ event_date: 'bogus' }))).toBe(
      'Please pick a valid event date.'
    )
  })
})
