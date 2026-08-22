'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Button, buttonVariants } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { TabLinks } from '@/components/ui/tab-links'
import { addDays } from '@/lib/opportunity-detail'
import { calendarHref } from '@/lib/calendar-href'
import { cn } from '@/lib/utils'
import { weekRange, type CalendarItem } from '@/lib/calendar'
import { WeekGrid } from '@/components/admin/calendar/WeekGrid'
import { MonthGrid } from '@/components/admin/calendar/MonthGrid'
import { DayView } from '@/components/admin/calendar/DayView'
import { AgendaView } from '@/components/admin/calendar/AgendaView'

export type CanvasView = 'month' | 'week' | 'day' | 'agenda'
const VIEWS: CanvasView[] = ['month', 'week', 'day', 'agenda']
const YMD = /^\d{4}-\d{2}-\d{2}$/

interface CalendarCanvasProps {
  orgSlug: string
  /** The visible-window feed (agenda gets the full feed; the page decides). */
  items: CalendarItem[]
  today: string
  view: CanvasView
  /** The ymd the canvas is centred on (week/month/day anchor). */
  anchor: string
  kinds?: string
  /** The open spine day (from /calendar/[ymd]) — highlighted in the grid. */
  selectedDay?: string
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

/** Step the anchor by the view's natural unit. */
function stepAnchor(view: CanvasView, anchor: string, delta: number): string {
  if (view === 'month') {
    const [y, m] = anchor.split('-').map(Number)
    const d = new Date(Date.UTC(y, m - 1 + delta, 1))
    return d.toISOString().slice(0, 10)
  }
  if (view === 'day') return addDays(anchor, delta)
  // week (and agenda, though it ignores stepping) move by the week
  return addDays(anchor, delta * 7)
}

function rangeLabel(view: CanvasView, anchor: string): string {
  const utc = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`)
  if (view === 'month') {
    return utc(anchor).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })
  }
  if (view === 'day') {
    return utc(anchor).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
  }
  if (view === 'agenda') return 'Agenda'
  const { from, to } = weekRange(anchor)
  const opts = { month: 'short', day: 'numeric', timeZone: 'UTC' } as const
  const year = utc(to).toLocaleDateString(undefined, { year: 'numeric', timeZone: 'UTC' })
  return `${utc(from).toLocaleDateString(undefined, opts)} – ${utc(to).toLocaleDateString(undefined, opts)}, ${year}`
}

interface Command {
  id: string
  label: string
  href: string
}

export function CalendarCanvas({ orgSlug, items, today, view, anchor, kinds, selectedDay: selectedDayProp }: CalendarCanvasProps) {
  const router = useRouter()
  const pathname = usePathname() ?? ''
  const params = useSearchParams()

  // Prefer the explicit prop; fall back to the /calendar/[ymd] path so the canvas
  // keeps the spine open across keyboard nav even when the page didn't pass it.
  const last = pathname.split('/').filter(Boolean).pop() ?? ''
  const selectedDay = selectedDayProp ?? (YMD.test(last) ? last : undefined)
  const kindsParam = kinds ?? params.get('kinds') ?? undefined

  const link = (over: { view?: CanvasView; week?: string; ymd?: string }) =>
    calendarHref({
      orgSlug,
      view: over.view ?? view,
      week: over.week ?? anchor,
      kinds: kindsParam,
      ymd: over.ymd ?? selectedDay,
    })

  // The day the Day view actually renders (DayView pins to selectedDay, falling
  // back to the anchor). Prev/next/Today must move THIS, and the heading must name
  // it — otherwise stepping the week param while a day is open desyncs the grid,
  // the heading and the bounded window (they'd track different days and blank out).
  const dayShown = selectedDay ?? anchor
  const dayStepping = view === 'day' && !!selectedDay
  const stepHref = (delta: number) =>
    dayStepping
      ? calendarHref({ orgSlug, view, kinds: kindsParam, ymd: stepAnchor('day', selectedDay!, delta) })
      : link({ week: stepAnchor(view, anchor, delta) })
  const todayHref = dayStepping
    ? calendarHref({ orgSlug, view, kinds: kindsParam, ymd: today })
    : link({ week: today })

  const [paletteOpen, setPaletteOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  // ⌘K stays on the window: it is a MODIFIER combo, which WCAG 2.1.4 does not
  // cover, and a command menu that only opens once you have tabbed into the
  // right region is not a command menu.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /**
   * The single-character shortcuts (m/w/d/a/t/? and the arrows) are bound HERE,
   * on the cockpit element, not on `window`.
   *
   * WCAG 2.1.4 (Character Key Shortcuts, Level A) forbids a bare-letter
   * shortcut unless it can be turned off, remapped, OR is "active only when
   * that component has focus". These were on `window` with none of the three —
   * and `d`/`t` are NVDA and JAWS single-letter quick-nav keys, so a screen
   * reader user pressing `d` to jump by landmark, or `t` by table, was fired
   * through a route change instead. That is not a rough edge; it makes the page
   * unreadable. Binding to the container takes the focus exception: a keydown
   * only bubbles here when focus is already inside the cockpit.
   *
   * `e.repeat` is dropped on the floor because these all call `router.push`
   * against a `force-dynamic` route — holding an arrow down was ~30 server
   * round-trips a second, one per auto-repeat tick.
   */
  function onCockpitKeyDown(e: React.KeyboardEvent) {
    if (e.repeat) return
    if (paletteOpen || shortcutsOpen) return
    if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return
    switch (e.key) {
      case 'm': router.push(link({ view: 'month' })); break
      case 'w': router.push(link({ view: 'week' })); break
      case 'd': router.push(link({ view: 'day' })); break
      case 'a': router.push(link({ view: 'agenda' })); break
      case 't': router.push(todayHref); break
      case '?': setShortcutsOpen(true); break
      case 'ArrowRight': router.push(stepHref(1)); break
      case 'ArrowLeft': router.push(stepHref(-1)); break
      default: return
    }
    e.preventDefault()
  }

  return (
    // tabIndex -1 so clicking anywhere on the canvas hands the cockpit focus and
    // the scoped shortcuts come alive; it is never a Tab stop of its own.
    <div
      data-slot="calendar-cockpit"
      tabIndex={-1}
      onKeyDown={onCockpitKeyDown}
      className="flex min-w-0 flex-1 flex-col outline-none"
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setPaletteOpen(true)}
          aria-label="Open command menu"
          aria-keyshortcuts="Meta+K Control+K"
          className="gap-1.5"
        >
          <span aria-hidden>⌘K</span>
          <span className="max-sm:sr-only">Jump…</span>
        </Button>
        <h1 className="text-sm font-semibold">{rangeLabel(view, view === 'day' ? dayShown : anchor)}</h1>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {view !== 'agenda' ? (
            <div className="flex items-center gap-1">
              <Link
                href={stepHref(-1)}
                aria-label="Previous"
                aria-keyshortcuts="ArrowLeft"
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
              >
                ←
              </Link>
              <Link
                href={todayHref}
                aria-keyshortcuts="T"
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5')}
              >
                Today
                <Kbd className="max-sm:hidden">T</Kbd>
              </Link>
              <Link
                href={stepHref(1)}
                aria-label="Next"
                aria-keyshortcuts="ArrowRight"
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
              >
                →
              </Link>
            </div>
          ) : null}
          <TabLinks
            ariaLabel="Calendar view"
            active={view}
            tabs={VIEWS.map((v) => ({ key: v, label: v[0].toUpperCase() + v.slice(1), href: link({ view: v }) }))}
          />
          {/* The bindings used to exist only in a source comment. This is the
              discoverable entry point, and it carries its own key as a hint. */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShortcutsOpen(true)}
            aria-label="Keyboard shortcuts"
            aria-keyshortcuts="Shift+?"
            className="px-2"
          >
            <Kbd>?</Kbd>
          </Button>
        </div>
      </div>

      {/* View pane — the swap fades in for motion-safe users, still for the rest. */}
      <div
        key={`${view}:${anchor}:${selectedDay ?? ''}`}
        data-slot="canvas-pane"
        className="min-w-0 flex-1 overflow-y-auto motion-safe:animate-in motion-safe:fade-in-0 motion-reduce:animate-none"
      >
        {view === 'month' ? (
          <MonthGrid orgSlug={orgSlug} items={items} month={anchor} today={today} selected={selectedDay} kinds={kindsParam} view={view} />
        ) : view === 'week' ? (
          <WeekGrid orgSlug={orgSlug} items={items} weekStart={weekRange(anchor).from} today={today} selected={selectedDay} kinds={kindsParam} view={view} />
        ) : view === 'day' ? (
          <DayView orgSlug={orgSlug} items={items} ymd={selectedDay ?? anchor} today={today} />
        ) : (
          <AgendaView orgSlug={orgSlug} items={items} />
        )}
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        orgSlug={orgSlug}
        today={today}
        view={view}
        anchor={anchor}
        kinds={kindsParam}
        selectedDay={selectedDay}
        onRun={(href) => {
          setPaletteOpen(false)
          router.push(href)
        }}
      />

      <ShortcutsSheet open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  )
}

/** A visible key cap. Same styling everywhere a binding is surfaced. */
function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex min-w-5 items-center justify-center rounded border border-border bg-muted px-1 font-mono text-[10px] font-semibold leading-4 text-foreground',
        className
      )}
    >
      {children}
    </kbd>
  )
}

const SHORTCUTS: Array<{ keys: string[]; label: string }> = [
  { keys: ['M'], label: 'Month view' },
  { keys: ['W'], label: 'Week view' },
  { keys: ['D'], label: 'Day view' },
  { keys: ['A'], label: 'Agenda view' },
  { keys: ['T'], label: 'Jump to today' },
  { keys: ['←', '→'], label: 'Step back / forward' },
  { keys: ['⌘', 'K'], label: 'Command menu (anywhere)' },
  { keys: ['?'], label: 'This sheet' },
]

/** The published contract for the scoped bindings — reachable by the `?` key
 *  and by the toolbar button, so it is discoverable without a keyboard too. */
function ShortcutsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => (o ? undefined : onClose())}>
      <DialogContent className="max-w-sm gap-0 p-0">
        <DialogTitle className="border-b border-border px-4 py-3 text-sm font-semibold">
          Keyboard shortcuts
        </DialogTitle>
        <dl className="divide-y divide-border/60 px-4 py-1">
          {SHORTCUTS.map((s) => (
            <div key={s.label} className="flex items-center justify-between gap-3 py-2">
              <dt className="text-sm text-foreground">{s.label}</dt>
              <dd className="flex shrink-0 items-center gap-1">
                {s.keys.map((k) => (
                  <Kbd key={k}>{k}</Kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
        <p className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
          Single-key shortcuts fire only while the calendar itself has focus — click the grid or
          Tab into it. That keeps them clear of screen-reader quick-nav keys.
        </p>
      </DialogContent>
    </Dialog>
  )
}

function prettyDate(ymd: string): string {
  return new Date(`${ymd}T00:00:00.000Z`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/** ⌘K menu: jump-to-date + a short, fixed set of actions. Capped at Miller's 7. */
function CommandPalette({
  open,
  onClose,
  orgSlug,
  today,
  view,
  anchor,
  kinds,
  selectedDay,
  onRun,
}: {
  open: boolean
  onClose: () => void
  orgSlug: string
  today: string
  view: CanvasView
  anchor: string
  kinds?: string
  selectedDay?: string
  onRun: (href: string) => void
}) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listId = 'calendar-cmdk-list'

  useEffect(() => {
    if (!open) {
      setQuery('')
      setActive(0)
    }
  }, [open])

  const results = useMemo<Command[]>(() => {
    const q = query.trim()
    const link = (over: { view?: CanvasView; week?: string; ymd?: string }) =>
      calendarHref({ orgSlug, view: over.view ?? view, week: over.week ?? anchor, kinds, ymd: over.ymd ?? selectedDay })
    // Day-targeting links omit week so the target self-derives its period (#1).
    const dayLink = (ymd: string) => calendarHref({ orgSlug, view, kinds, ymd })

    const jump: Command[] = YMD.test(q)
      ? [{ id: 'jump', label: `Jump to ${prettyDate(q)}`, href: dayLink(q) }]
      : []

    const actions: Command[] = [
      { id: 'today', label: 'Go to today', href: link({ week: today }) },
      { id: 'new', label: 'Book a job', href: `/${orgSlug}/new-event` },
      { id: 'v-month', label: 'Month view', href: link({ view: 'month' }) },
      { id: 'v-week', label: 'Week view', href: link({ view: 'week' }) },
      { id: 'v-day', label: 'Day view', href: link({ view: 'day' }) },
      { id: 'v-agenda', label: 'Agenda view', href: link({ view: 'agenda' }) },
    ]

    const ql = q.toLowerCase()
    const filtered = ql ? actions.filter((c) => c.label.toLowerCase().includes(ql)) : actions
    // Jump command first, then keep the whole list within Miller's 7±2.
    return [...jump, ...filtered].slice(0, 7)
  }, [query, orgSlug, view, anchor, kinds, selectedDay, today])

  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, results.length - 1)))
  }, [results.length])

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const cmd = results[active]
      if (cmd) onRun(cmd.href)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? undefined : onClose())}>
      <DialogContent showCloseButton={false} className="top-24 max-w-md translate-y-0 gap-0 p-0">
        <DialogTitle className="sr-only">Command menu</DialogTitle>
        <input
          autoFocus
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={results[active]?.id}
          aria-label="Jump to a date or action"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Jump to a date (YYYY-MM-DD) or type an action…"
          className="w-full rounded-t-xl border-b border-border bg-transparent px-3.5 py-3 text-sm outline-none placeholder:text-muted-foreground"
        />
        <ul id={listId} role="listbox" aria-label="Commands" className="max-h-72 overflow-y-auto p-1.5">
          {results.length === 0 ? (
            <li className="px-2.5 py-2 text-sm text-muted-foreground">No matches</li>
          ) : (
            results.map((cmd, i) => (
              <li
                key={cmd.id}
                id={cmd.id}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => onRun(cmd.href)}
                className={cn(
                  'cursor-pointer rounded-md px-2.5 py-2 text-sm text-foreground',
                  i === active && 'bg-muted'
                )}
              >
                {cmd.label}
              </li>
            ))
          )}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
