import { describe, it, expect } from 'vitest'
import { parseDatePhrase, formatLongDate, relativeDayLabel } from '@/lib/date-phrase'

// A Saturday, deliberately: the weekday rules ("next sat" on a Saturday) only
// show their edges when today IS the weekday being asked for.
const TODAY = '2026-08-22'

const ymd = (input: string, today = TODAY) => parseDatePhrase(input, today)?.ymd ?? null

describe('parseDatePhrase', () => {
  it('the fixture "today" really is a Saturday (the weekday edges depend on it)', () => {
    expect(new Date(`${TODAY}T00:00:00.000Z`).getUTCDay()).toBe(6)
  })

  it('trims and is case-insensitive', () => {
    expect(ymd('  Tomorrow  ')).toBe('2026-08-23')
    expect(ymd('SEP 13')).toBe('2026-09-13')
  })

  // ── the full acceptance table ────────────────────────────────────────────
  const accepts: Array<[input: string, expected: string, form: string, assumedYear: boolean]> = [
    // keywords
    ['today', '2026-08-22', 'keyword', false],
    ['TOMORROW', '2026-08-23', 'keyword', false],
    ['yesterday', '2026-08-21', 'keyword', false],

    // ISO
    ['2026-09-13', '2026-09-13', 'iso', false],
    ['2024-02-29', '2024-02-29', 'iso', false],
    ['2026-9-13', '2026-09-13', 'iso', false],
    ['1999-12-31', '1999-12-31', 'iso', false],

    // M/D — no year, next occurrence on or after today
    ['9/13', '2026-09-13', 'numeric', true],
    ['09/13', '2026-09-13', 'numeric', true],
    ['8/22', '2026-08-22', 'numeric', true],
    ['8/21', '2027-08-21', 'numeric', true],
    ['1/5', '2027-01-05', 'numeric', true],
    ['12/31', '2026-12-31', 'numeric', true],
    ['2/29', '2028-02-29', 'numeric', true],

    // M/D/YY and M/D/YYYY
    ['9/13/27', '2027-09-13', 'numeric', false],
    ['9/13/2027', '2027-09-13', 'numeric', false],
    ['1/5/26', '2026-01-05', 'numeric', false],
    ['2/29/28', '2028-02-29', 'numeric', false],

    // month name first
    ['se 13', '2026-09-13', 'month-name', true],
    ['ap 5', '2027-04-05', 'month-name', true],
    ['sep 13', '2026-09-13', 'month-name', true],
    ['Sep 13', '2026-09-13', 'month-name', true],
    ['sept 13', '2026-09-13', 'month-name', true],
    ['sep. 13', '2026-09-13', 'month-name', true],
    ['september 13', '2026-09-13', 'month-name', true],
    ['September 13, 2027', '2027-09-13', 'month-name', false],
    ['sep 13 2027', '2027-09-13', 'month-name', false],
    ['sep 13th', '2026-09-13', 'month-name', true],
    ['mar 1st', '2027-03-01', 'month-name', true],
    ['may 3', '2027-05-03', 'month-name', true],
    ['jan 1', '2027-01-01', 'month-name', true],

    // day first
    ['13 sep', '2026-09-13', 'month-name', true],
    ['13 september', '2026-09-13', 'month-name', true],
    ['13th september 2027', '2027-09-13', 'month-name', false],
    ['1 jan', '2027-01-01', 'month-name', true],
    ['29 feb', '2028-02-29', 'month-name', true],

    // weekdays (today is Saturday 2026-08-22)
    ['next sat', '2026-08-29', 'weekday', false],
    ['next saturday', '2026-08-29', 'weekday', false],
    ['next sun', '2026-08-23', 'weekday', false],
    ['next fri', '2026-08-28', 'weekday', false],
    ['NEXT Tue', '2026-08-25', 'weekday', false],
    ['coming mon', '2026-08-24', 'weekday', false],
    ['this sat', '2026-08-22', 'weekday', false],
    ['this sun', '2026-08-23', 'weekday', false],
    ['last sat', '2026-08-15', 'weekday', false],
    ['last fri', '2026-08-21', 'weekday', false],
    ['next thurs', '2026-08-27', 'weekday', false],
    ['next su', '2026-08-23', 'weekday', false],
    ['next we', '2026-08-26', 'weekday', false],

    // offsets
    ['+2w', '2026-09-05', 'offset', false],
    ['-3d', '2026-08-19', 'offset', false],
    ['+1d', '2026-08-23', 'offset', false],
    ['+0d', '2026-08-22', 'offset', false],
    ['+2 weeks', '2026-09-05', 'offset', false],
    ['- 3 days', '2026-08-19', 'offset', false],
    ['+1m', '2026-09-22', 'offset', false],
    ['+1y', '2027-08-22', 'offset', false],
    ['-1y', '2025-08-22', 'offset', false],
  ]

  for (const [input, expected, form, assumedYear] of accepts) {
    it(`parses ${JSON.stringify(input)} → ${expected}`, () => {
      const got = parseDatePhrase(input, TODAY)
      expect(got, `${input} should parse`).not.toBeNull()
      expect(got!.ymd).toBe(expected)
      expect(got!.form).toBe(form)
      expect(got!.assumedYear).toBe(assumedYear)
    })
  }

  // ── the rejection table ──────────────────────────────────────────────────
  const rejects: Array<[input: string, why: string]> = [
    ['', 'empty'],
    ['   ', 'whitespace only'],
    ['Henderson', 'a customer name, not a date'],
    ['Henderson wedding', 'two words of prose'],
    ['book a job', 'a command label'],
    ['banana', 'garbage'],
    ['13/9', 'month slot out of range — we refuse rather than transposing to D/M'],
    ['0/5', 'month 0'],
    ['9/0', 'day 0'],
    ['2/30', 'February never has 30 days, in any year'],
    ['4/31', 'April never has 31 days'],
    ['2026-02-30', 'ISO shape, impossible date'],
    ['2026-13-01', 'ISO shape, month 13'],
    ['2026-00-10', 'ISO shape, month 0'],
    ['2/29/2027', 'explicit non-leap year — the user said which year'],
    ['feb 29 2027', 'same, spelled out'],
    ['0001-01-01', 'outside the year window we will show'],
    ['3999-01-01', 'outside the year window we will show'],
    ['ju 13', 'ambiguous month prefix — June or July, so refuse rather than pick'],
    ['13 ju', 'same ambiguity, day-first'],
    ['ma 5', 'ambiguous — March or May'],
    ['s 13', 'one letter is never enough'],
    ['next s', 'one letter — Sunday or Saturday'],
    ['next t', 'one letter — Tuesday or Thursday'],
    ['xyz 13', 'not a month at all'],
    ['next blurbsday', 'not a weekday'],
    ['next', 'bare direction'],
    ['sat', 'bare weekday is deliberately NOT a date (too many false hits)'],
    ['2w', 'unsigned offset is deliberately not accepted'],
    ['+2', 'offset with no unit'],
    ['+2q', 'unsupported unit'],
    ['+99999d', 'offset count out of shape'],
    ['9/13/2027 4pm', 'trailing time'],
    ['a'.repeat(60), 'longer than any date phrase'],
  ]

  for (const [input, why] of rejects) {
    it(`rejects ${JSON.stringify(input.length > 20 ? input.slice(0, 17) + '…' : input)} — ${why}`, () => {
      expect(parseDatePhrase(input, TODAY)).toBeNull()
    })
  }

  it('rejects a non-string input without throwing', () => {
    expect(parseDatePhrase(undefined as unknown as string, TODAY)).toBeNull()
    expect(parseDatePhrase('today', 'not-a-date')).toBeNull()
    expect(parseDatePhrase('today', '2026-02-30')).toBeNull()
  })
})

describe('the M/D ambiguity rule — next occurrence on or after today', () => {
  it('reads a bare M/D that has already passed as NEXT year, not this one', () => {
    // The whole point: on 2026-08-22, "1/5" is January 2027. "This year" would
    // send a Q4 operator's jump into the past on every date before today.
    expect(ymd('1/5')).toBe('2027-01-05')
    expect(ymd('sep 13', '2026-10-01')).toBe('2027-09-13')
  })

  it('counts today itself as an occurrence', () => {
    expect(ymd('8/22')).toBe('2026-08-22')
    expect(ymd('22 aug')).toBe('2026-08-22')
  })

  it('walks a bare 2/29 forward to the next year that actually has one', () => {
    expect(ymd('2/29', '2026-08-22')).toBe('2028-02-29')
    expect(ymd('2/29', '2028-01-01')).toBe('2028-02-29')
    expect(ymd('2/29', '2028-03-01')).toBe('2032-02-29')
  })

  it('crosses the century leap gap (2100 is not a leap year)', () => {
    expect(ymd('2/29', '2097-01-01')).toBe('2104-02-29')
  })

  it('flags every year-less parse with assumedYear so the caller must show it', () => {
    for (const input of ['9/13', 'sep 13', '13 sep']) {
      expect(parseDatePhrase(input, TODAY)!.assumedYear, input).toBe(true)
    }
    for (const input of ['9/13/27', 'sep 13 2027', '2026-09-13', 'today', 'next sat', '+2w']) {
      expect(parseDatePhrase(input, TODAY)!.assumedYear, input).toBe(false)
    }
  })
})

describe('offsets clamp instead of rolling over', () => {
  it('Jan 31 + 1 month is Feb 28, not March 3', () => {
    expect(ymd('+1m', '2026-01-31')).toBe('2026-02-28')
    expect(ymd('+1m', '2024-01-31')).toBe('2024-02-29')
  })

  it('Feb 29 + 1 year is Feb 28', () => {
    expect(ymd('+1y', '2024-02-29')).toBe('2025-02-28')
  })

  it('steps months backwards across the year boundary', () => {
    expect(ymd('-2m', '2026-01-15')).toBe('2025-11-15')
    expect(ymd('-13m', '2026-01-15')).toBe('2024-12-15')
  })

  it('day and week offsets cross month and year boundaries', () => {
    expect(ymd('+1d', '2026-12-31')).toBe('2027-01-01')
    expect(ymd('-1d', '2026-01-01')).toBe('2025-12-31')
    expect(ymd('+2w', '2026-02-20')).toBe('2026-03-06')
    expect(ymd('+1d', '2024-02-28')).toBe('2024-02-29')
    expect(ymd('+1d', '2026-02-28')).toBe('2026-03-01')
  })

  it('refuses an offset that leaves the year window', () => {
    expect(parseDatePhrase('+9999y'.replace('9999', '999'), '2026-08-22')).toBeNull()
    expect(parseDatePhrase('-999y', '2026-08-22')).toBeNull()
  })
})

describe('weekday direction words', () => {
  const MONDAY = '2026-08-24'

  it('"next X" is always strictly in the future, even when today is X', () => {
    expect(ymd('next mon', MONDAY)).toBe('2026-08-31')
    expect(ymd('next sat', '2026-08-22')).toBe('2026-08-29')
  })

  it('"this X" includes today', () => {
    expect(ymd('this mon', MONDAY)).toBe(MONDAY)
    expect(ymd('this fri', MONDAY)).toBe('2026-08-28')
  })

  it('"last X" is always strictly in the past, even when today is X', () => {
    expect(ymd('last mon', MONDAY)).toBe('2026-08-17')
    expect(ymd('last sun', MONDAY)).toBe('2026-08-23')
  })
})

describe('formatLongDate', () => {
  it('names the weekday, day, month and year so the parse is checkable', () => {
    expect(formatLongDate('2026-09-13')).toBe('Sunday, 13 September 2026')
    expect(formatLongDate('2026-08-22')).toBe('Saturday, 22 August 2026')
    expect(formatLongDate('2024-02-29')).toBe('Thursday, 29 February 2024')
    expect(formatLongDate('2027-01-01')).toBe('Friday, 1 January 2027')
  })

  it('is deterministic rather than locale-dependent (a preview must be checkable)', () => {
    // toLocaleDateString would reorder these under a non-en-US ICU build; the
    // confirmable echo must not move under the operator's machine settings.
    expect(formatLongDate('2026-12-25')).toBe('Friday, 25 December 2026')
  })

  it('passes a non-date straight through rather than inventing one', () => {
    expect(formatLongDate('nope')).toBe('nope')
    expect(formatLongDate('2026-02-30')).toBe('2026-02-30')
  })
})

describe('relativeDayLabel', () => {
  const cases: Array<[string, string]> = [
    ['2026-08-22', 'today'],
    ['2026-08-23', 'tomorrow'],
    ['2026-08-21', 'yesterday'],
    ['2026-09-13', 'in 22 days'],
    ['2026-08-15', '7 days ago'],
    ['2027-08-22', 'in 365 days'],
  ]
  for (const [input, expected] of cases) {
    it(`${input} is "${expected}"`, () => {
      expect(relativeDayLabel(input, TODAY)).toBe(expected)
    })
  }

  it('is empty for a non-date rather than NaN', () => {
    expect(relativeDayLabel('nope', TODAY)).toBe('')
    expect(relativeDayLabel('2026-08-22', 'nope')).toBe('')
  })
})
