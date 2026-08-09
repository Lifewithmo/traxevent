import type { TodayData } from '@/lib/today'
import type { Event } from '@/lib/types'
import { addDays } from '@/lib/opportunity-detail'

export type MoveGroup = 'overdue' | 'due_today' | 'no_next_step' | 'waiting' | 'won_unscheduled'

export type MoveActionKind =
  | 'complete'
  | 'set_due'
  | 'pick_date'
  | 'create_task'
  | 'still_waiting'
  | 'resume'
  | 'schedule'
  | 'open'

export interface MoveAction {
  kind: MoveActionKind
  label: string
  /** For set_due: the YYYY-MM-DD to write. */
  dueDate?: string
}

export interface Move {
  key: string
  group: MoveGroup
  leadId: string
  taskId?: string
  /** Row heading — the customer, not the task. */
  customer: string
  /** Second line — the task, or why this row is here. */
  detail: string
  dueDate?: string
  /** First entry is the row's default move. */
  actions: MoveAction[]
}

export interface MoveGroupBlock {
  group: MoveGroup
  label: string
  tone: 'urgent' | 'normal'
  moves: Move[]
}

const GROUP_META: Record<MoveGroup, { label: string; tone: 'urgent' | 'normal' }> = {
  overdue: { label: 'Overdue', tone: 'urgent' },
  due_today: { label: 'Due today', tone: 'normal' },
  no_next_step: { label: 'No next step', tone: 'normal' },
  waiting: { label: 'Waiting', tone: 'normal' },
  won_unscheduled: { label: 'Won, not on the calendar', tone: 'normal' },
}

const GROUP_ORDER: MoveGroup[] = ['overdue', 'due_today', 'no_next_step', 'waiting', 'won_unscheduled']

/** Customer first: the org if we have one, otherwise the opportunity's own title. */
function customerOf(company: string | undefined, title: string): string {
  return company?.trim() || title
}

/** Everything after the customer name, joined with the app's separator. */
function detailOf(...parts: (string | undefined | false)[]): string {
  return parts.filter((p): p is string => !!p).join(' · ')
}

function dateActions(today: string, current?: string): MoveAction[] {
  return [
    { kind: 'set_due', label: 'Due tomorrow', dueDate: addDays(today, 1) },
    { kind: 'set_due', label: 'Due next week', dueDate: addDays(today, 7) },
    { kind: 'pick_date', label: 'Pick a date…', dueDate: current },
  ]
}

/**
 * Collapses buildToday's four arrays into one ranked queue.
 *
 * The four lists all ask the same question — "what do I do about this?" — so
 * they render as one list with group headers rather than four equal cards.
 */
export function buildMoves(data: TodayData, today: string): MoveGroupBlock[] {
  const moves: Move[] = []

  for (const t of data.dueTasks) {
    moves.push({
      key: `task:${t.task.id}`,
      group: t.status === 'overdue' ? 'overdue' : 'due_today',
      leadId: t.leadId,
      taskId: t.task.id,
      customer: customerOf(t.company, t.leadTitle),
      detail: detailOf(t.task.title, t.status === 'overdue' && t.task.due_date ? `due ${t.task.due_date}` : undefined),
      dueDate: t.task.due_date,
      actions: [
        { kind: 'complete', label: 'Mark done' },
        ...dateActions(today, t.task.due_date),
        { kind: 'open', label: 'Open opportunity' },
      ],
    })
  }

  for (const n of data.needsAttention) {
    moves.push({
      key: `lead:${n.leadId}`,
      group: 'no_next_step',
      leadId: n.leadId,
      customer: customerOf(n.company, n.title),
      detail: detailOf(n.company ? n.title : undefined, 'no next step'),
      actions: [
        { kind: 'create_task', label: 'Add a task' },
        { kind: 'open', label: 'Open opportunity' },
      ],
    })
  }

  for (const w of data.waiting) {
    moves.push({
      key: `waiting:${w.leadId}`,
      group: 'waiting',
      leadId: w.leadId,
      customer: customerOf(w.company, w.title),
      detail: detailOf(w.company ? w.title : undefined, `waiting on ${w.reason}`, `quiet ${w.quietDays}d`),
      dueDate: w.followUpDate,
      actions: [
        { kind: 'create_task', label: 'Follow up today' },
        { kind: 'still_waiting', label: 'Still waiting — check in 3 days' },
        { kind: 'resume', label: 'Not waiting any more' },
        { kind: 'open', label: 'Open opportunity' },
      ],
    })
  }

  for (const w of data.wonUnscheduled) {
    moves.push({
      key: `won:${w.leadId}`,
      group: 'won_unscheduled',
      leadId: w.leadId,
      customer: customerOf(w.company, w.title),
      detail: detailOf(w.company ? w.title : undefined, w.eventDate && `event ${w.eventDate}`, 'no event created'),
      actions: [
        { kind: 'schedule', label: 'Schedule it' },
        { kind: 'open', label: 'Open opportunity' },
      ],
    })
  }

  // Waiting rows whose follow-up isn't due yet are quiet on purpose — they stay
  // in Pipeline rather than adding noise to the morning queue.
  const dueWaitingIds = new Set(data.waiting.filter((w) => w.followUpDue).map((w) => w.leadId))
  const visible = moves.filter((m) => m.group !== 'waiting' || dueWaitingIds.has(m.leadId))

  return GROUP_ORDER.map((group) => ({
    group,
    label: GROUP_META[group].label,
    tone: GROUP_META[group].tone,
    moves: visible.filter((m) => m.group === group),
  })).filter((b) => b.moves.length > 0)
}

export function moveCount(blocks: MoveGroupBlock[]): number {
  return blocks.reduce((n, b) => n + b.moves.length, 0)
}

export interface AgendaEntry {
  eventId: string
  slug: string
  name: string
  date: string
  headcount?: number
  multiDay: boolean
}

export interface Agenda {
  today: AgendaEntry[]
  upcoming: AgendaEntry[]
  /** Every day in the window, so empty days can still be shown. */
  windowDays: string[]
}

/** Booked work for today and the following seven days — not pipeline dates. */
export function buildAgenda(events: Event[], today: string, days = 7): Agenda {
  const end = addDays(today, days)
  const live = events.filter((e) => e.status !== 'archived')

  const entry = (e: Event, date: string): AgendaEntry => ({
    eventId: e.id,
    slug: e.slug,
    name: e.name,
    date,
    headcount: e.headcount,
    multiDay: !!e.event_end && e.event_end.slice(0, 10) !== e.event_start.slice(0, 10),
  })

  const onDay = (e: Event, ymd: string) => {
    const start = e.event_start.slice(0, 10)
    const finish = (e.event_end || e.event_start).slice(0, 10)
    return start <= ymd && ymd <= finish
  }

  const windowDays: string[] = []
  for (let i = 1; i <= days; i++) windowDays.push(addDays(today, i))

  const upcoming: AgendaEntry[] = []
  for (const ymd of windowDays) {
    for (const e of live) if (onDay(e, ymd)) upcoming.push(entry(e, ymd))
  }

  return {
    today: live.filter((e) => onDay(e, today)).map((e) => entry(e, today)),
    upcoming: upcoming.filter((e) => e.date <= end),
    windowDays,
  }
}
