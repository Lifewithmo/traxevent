import { describe, it, expect } from 'vitest'
import {
  initials, addDays, dueStatus, todayYmd, formatRelativeTime,
  bannerContent, daysSince, lastTouchIso, convertBlockReason,
  parseYmd, isValidYmd, normalizeYmd,
} from '@/lib/opportunity-detail'

describe('initials', () => {
  it('takes first+last initial', () => expect(initials('Ada Lovelace')).toBe('AL'))
  it('single word takes two letters', () => expect(initials('cher')).toBe('CH'))
  it('empty falls back', () => expect(initials('   ')).toBe('?'))
})

describe('addDays', () => {
  it('adds across a month boundary', () => expect(addDays('2026-01-30', 3)).toBe('2026-02-02'))
})

describe('parseYmd / isValidYmd', () => {
  it('accepts a real date and parses it at UTC midnight', () => {
    const d = parseYmd('2026-08-19')
    expect(d).toBeInstanceOf(Date)
    expect(d!.toISOString()).toBe('2026-08-19T00:00:00.000Z')
  })

  it('accepts the first and last day of a month', () => {
    expect(isValidYmd('2026-08-01')).toBe(true)
    expect(isValidYmd('2026-08-31')).toBe(true)
  })

  // The whole point: these all pass a shape-only /^\d{4}-\d{2}-\d{2}$/ regex.
  it('rejects an impossible day that Date would ROLL OVER', () => {
    // new Date('2026-02-31T00:00:00.000Z') is March 3 — the old regex shipped
    // that to the page, which then rendered "March 3, 2026" at /2026-02-31.
    expect(new Date('2026-02-31T00:00:00.000Z').toISOString().slice(0, 10)).toBe('2026-03-03')
    expect(parseYmd('2026-02-31')).toBeNull()
    expect(isValidYmd('2026-02-31')).toBe(false)
  })

  it('rejects a 31st in a 30-day month (rollover)', () => {
    expect(isValidYmd('2026-04-31')).toBe(false)
    expect(isValidYmd('2026-06-31')).toBe(false)
  })

  it('rejects an out-of-range month', () => {
    expect(isValidYmd('2026-13-01')).toBe(false)
    expect(isValidYmd('2026-00-10')).toBe(false)
  })

  it('rejects an out-of-range day', () => {
    expect(isValidYmd('2026-08-00')).toBe(false)
    expect(isValidYmd('2026-08-32')).toBe(false)
  })

  it('rejects wrong zero-padding', () => {
    expect(isValidYmd('2026-2-3')).toBe(false)
    expect(isValidYmd('2026-02-3')).toBe(false)
    expect(isValidYmd('226-02-03')).toBe(false)
  })

  it('honours leap years in both directions', () => {
    expect(isValidYmd('2024-02-29')).toBe(true) // leap year
    expect(isValidYmd('2026-02-29')).toBe(false) // not a leap year -> rolls to Mar 1
    expect(isValidYmd('2000-02-29')).toBe(true) // century divisible by 400
    expect(isValidYmd('1900-02-29')).toBe(false) // century NOT divisible by 400
  })

  it('rejects empty and junk strings', () => {
    expect(isValidYmd('')).toBe(false)
    expect(isValidYmd('   ')).toBe(false)
    expect(isValidYmd('garbage')).toBe(false)
    expect(isValidYmd('not-a-date')).toBe(false)
  })

  it('rejects a full ISO timestamp (this is a date-only helper)', () => {
    expect(isValidYmd('2026-08-19T00:00:00.000Z')).toBe(false)
    expect(isValidYmd('2026-08-19T12:30:00Z')).toBe(false)
  })

  it('rejects surrounding whitespace rather than trimming it', () => {
    expect(isValidYmd(' 2026-08-19')).toBe(false)
    expect(isValidYmd('2026-08-19 ')).toBe(false)
  })

  it('round-trip equality is what rejects rollovers, not a NaN check', () => {
    // 2026-02-31 parses to a PERFECTLY VALID Date object; only re-formatting
    // and comparing catches that it is not the date that was asked for.
    const rolled = new Date('2026-02-31T00:00:00.000Z')
    expect(Number.isNaN(rolled.getTime())).toBe(false)
    expect(parseYmd('2026-02-31')).toBeNull()
  })
})

describe('normalizeYmd', () => {
  it('passes a valid date through', () => {
    expect(normalizeYmd('2026-08-19', '2026-01-01')).toBe('2026-08-19')
  })

  it('falls back when missing', () => {
    expect(normalizeYmd(undefined, '2026-01-01')).toBe('2026-01-01')
    expect(normalizeYmd('', '2026-01-01')).toBe('2026-01-01')
  })

  it('falls back instead of throwing on junk (a bad ?week must not 500)', () => {
    expect(normalizeYmd('garbage', '2026-01-01')).toBe('2026-01-01')
    expect(normalizeYmd('../../etc/passwd', '2026-01-01')).toBe('2026-01-01')
  })

  it('falls back on a rolled-over date rather than silently shifting the week', () => {
    expect(normalizeYmd('2026-02-31', '2026-01-01')).toBe('2026-01-01')
  })

  it('still tolerates a full ISO timestamp by taking its date part', () => {
    expect(normalizeYmd('2026-08-19T12:30:00.000Z', '2026-01-01')).toBe('2026-08-19')
  })
})

describe('dueStatus', () => {
  it('past is overdue', () => expect(dueStatus('2026-08-04', '2026-08-05')).toBe('overdue'))
  it('same day is today', () => expect(dueStatus('2026-08-05', '2026-08-05')).toBe('today'))
  it('future is upcoming', () => expect(dueStatus('2026-08-06', '2026-08-05')).toBe('upcoming'))
})

describe('todayYmd', () => {
  it('formats a local date', () => expect(todayYmd(new Date(2026, 7, 5, 9, 0, 0))).toBe('2026-08-05'))
})

describe('formatRelativeTime', () => {
  const now = new Date('2026-08-05T12:00:00.000Z')
  it('under a minute', () => expect(formatRelativeTime('2026-08-05T11:59:30.000Z', now)).toBe('just now'))
  it('minutes', () => expect(formatRelativeTime('2026-08-05T11:30:00.000Z', now)).toBe('30m ago'))
  it('hours', () => expect(formatRelativeTime('2026-08-05T09:00:00.000Z', now)).toBe('3h ago'))
  it('days', () => expect(formatRelativeTime('2026-08-03T12:00:00.000Z', now)).toBe('2d ago'))
})

describe('bannerContent', () => {
  it('active surfaces the next action', () => {
    const b = bannerContent('active', { nextTitle: 'Call venue', dueYmd: '2026-08-05', todayYmd: '2026-08-05', stageLabel: 'Proposal' })
    expect(b.tone).toBe('active')
    expect(b.heading).toBe('Call venue')
    expect(b.detail).toContain('Due today')
  })
  it('overdue active flags it', () => {
    const b = bannerContent('active', { nextTitle: 'Send quote', dueYmd: '2026-08-01', todayYmd: '2026-08-05', stageLabel: 'Proposal' })
    expect(b.detail).toContain('Overdue')
  })
  it('waiting shows reason', () => {
    const b = bannerContent('waiting', { waitingReason: 'Client reviewing', waitingFollowUp: '2026-08-10', todayYmd: '2026-08-05', stageLabel: 'Proposal' })
    expect(b.tone).toBe('waiting')
    expect(b.heading).toBe('Waiting')
    expect(b.detail).toContain('Client reviewing')
  })

  /*
    ONE DATE FORMAT. These three strings render in NextActionBanner, directly
    above a tasks card that uses `shortDate` — as do the KPI band, FactsGrid,
    DatesPanel, the pipeline list and the board. The banner was the last surface
    emitting a raw `YYYY-MM-DD`, so the page read "Overdue · was due 2026-08-14"
    one card above "Aug 14, 2026" for the same date.
  */
  describe('date format', () => {
    const iso = /\d{4}-\d{2}-\d{2}/

    it('formats an overdue due date, never the raw ymd', () => {
      const b = bannerContent('active', { nextTitle: 'Send quote', dueYmd: '2026-08-01', todayYmd: '2026-08-05', stageLabel: 'Proposal' })
      expect(b.detail).toBe('Overdue · was due Aug 1, 2026')
      expect(b.detail).not.toMatch(iso)
    })

    it('formats an upcoming due date, never the raw ymd', () => {
      const b = bannerContent('active', { nextTitle: 'Send quote', dueYmd: '2026-08-30', todayYmd: '2026-08-05', stageLabel: 'Proposal' })
      expect(b.detail).toBe('Due Aug 30, 2026')
      expect(b.detail).not.toMatch(iso)
    })

    it('formats the waiting follow-up date, never the raw ymd', () => {
      const b = bannerContent('waiting', { waitingReason: 'Client reviewing', waitingFollowUp: '2026-08-10', todayYmd: '2026-08-05', stageLabel: 'Proposal' })
      expect(b.detail).toBe('Client reviewing · follow up Aug 10, 2026')
      expect(b.detail).not.toMatch(iso)
    })
  })
  it('needs attention prompts a next step', () => {
    const b = bannerContent('needs_attention', { todayYmd: '2026-08-05', stageLabel: 'Inquiry' })
    expect(b.tone).toBe('attention')
    expect(b.heading).toContain('No next action')
  })
  it('closed reflects the outcome', () => {
    const b = bannerContent('closed', { todayYmd: '2026-08-05', stageLabel: 'Closed Won' })
    expect(b.tone).toBe('closed')
    expect(b.detail).toContain('Closed Won')
  })
  it('appends last-touch to the needs-attention detail', () => {
    const c = bannerContent('needs_attention', { todayYmd: '2026-08-07', stageLabel: 'Consultation', lastTouchDays: 11 })
    expect(c.detail).toBe('This opportunity has nothing scheduled — add a next step so it never rots. Last touch 11 days ago.')
  })
})

describe('daysSince', () => {
  it('counts whole calendar days from the ISO date part', () => {
    expect(daysSince('2026-07-27T15:00:00.000Z', '2026-08-07')).toBe(11)
    expect(daysSince('2026-08-07T01:00:00.000Z', '2026-08-07')).toBe(0)
  })
})

describe('lastTouchIso', () => {
  it('prefers last_touch_at, then updated_at, then created_at', () => {
    expect(lastTouchIso({ last_touch_at: 'a', updated_at: 'b', created_at: 'c' })).toBe('a')
    expect(lastTouchIso({ updated_at: 'b', created_at: 'c' })).toBe('b')
    expect(lastTouchIso({ created_at: 'c' })).toBe('c')
  })
})

describe('convertBlockReason', () => {
  it('is ready at closed_won regardless of attachments', () => {
    expect(convertBlockReason({ stage: 'closed_won', proposals: [] }).ready).toBe(true)
  })
  it('blocks until a proposal is signed', () => {
    const r = convertBlockReason({ stage: 'proposal', proposals: [{ status: 'sent' }], guestCount: 40 })
    expect(r.ready).toBe(false)
    expect(r.message).toBe('Blocked: no signed proposal yet. Signed acceptance carries the accepted package and 40 guests into Events.')
  })
  it('is ready to mark won once a proposal is accepted', () => {
    const r = convertBlockReason({ stage: 'proposal', proposals: [{ status: 'accepted' }] })
    expect(r).toEqual({ ready: false, blocker: 'not_won', message: 'Ready — mark the deal won to convert.' })
  })

  // `ready` is false for BOTH non-won cases, so the convert card cannot tell
  // "sign a proposal" from "mark it won" without this — and a card that cannot
  // tell them apart can only offer a disabled button.
  it('names which blocker it is, so the card can offer the matching live CTA', () => {
    expect(convertBlockReason({ stage: 'closed_won', proposals: [] }).blocker).toBe('none')
    expect(convertBlockReason({ stage: 'proposal', proposals: [{ status: 'sent' }] }).blocker).toBe('unsigned_proposal')
    expect(convertBlockReason({ stage: 'proposal', proposals: [{ status: 'accepted' }] }).blocker).toBe('not_won')
  })
})
