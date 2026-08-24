'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Button, buttonVariants } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { TabLinks } from '@/components/ui/tab-links'
import { addDays } from '@/lib/opportunity-detail'
import { calendarHref } from '@/lib/calendar-href'
import { formatLongDate, parseDatePhrase, relativeDayLabel } from '@/lib/date-phrase'
import { cn } from '@/lib/utils'
import { CALENDAR_KIND_LABELS, weekRange, type CalendarItem } from '@/lib/calendar'
import { WeekGrid } from '@/components/admin/calendar/WeekGrid'
import { MonthGrid } from '@/components/admin/calendar/MonthGrid'
import { DayView } from '@/components/admin/calendar/DayView'
import { AgendaView } from '@/components/admin/calendar/AgendaView'
import { ItemPeek, type FinalFocus } from '@/components/admin/calendar/ItemPeek'
import { useTopDismissLayer } from '@/components/admin/calendar/dismiss-stack'

export type CanvasView = 'month' | 'week' | 'day' | 'agenda'
const VIEWS: CanvasView[] = ['month', 'week', 'day', 'agenda']
const YMD = /^\d{4}-\d{2}-\d{2}$/

interface CalendarCanvasProps {
  orgSlug: string
  /** The visible-window feed (agenda gets the full feed; the page decides). */
  items: CalendarItem[]
  /**
   * The WHOLE book for the current `?kinds` scope — what ⌘K searches.
   *
   * `items` is a window: 7 days in Week, ONE day in Day, a padded grid in Month.
   * Handing that to the palette made every claim it renders a within-window
   * fact wearing whole-book clothes ("No matches for «Kelly»" while Kelly is
   * booked in October; "8 of 34" totalling only the visible days). The pages
   * already hold the unwindowed feed — `orgCalendarFeed` is React.cache()'d and
   * they call it to BUILD the window — so widening the index costs zero extra
   * Firestore reads, and the agenda view already ships this exact array to the
   * client, so it is not a new class of payload either.
   *
   * Still narrowed by `?kinds`, deliberately: a filter the operator set should
   * apply to search too. The palette therefore NAMES that scope in every claim
   * rather than passing a within-filter count off as a total.
   */
  feed: CalendarItem[]
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

/**
 * The width at which `/calendar/[ymd]` puts the day spine BESIDE the canvas
 * rather than stacked under it — `lg:w-[360px] lg:border-l` on that page's
 * wrapper. Read in JS because the peek has to make a decision, not a style.
 */
const SPINE_BESIDE_QUERY = '(min-width: 1024px)'

/** The one DOM contract the peek keys off. `reschedule-drag` already stamps it
 *  on every chip it makes draggable, which is exactly the booked jobs and holds
 *  (see RESCHEDULABLE); the agenda stamps it on its rows too. Anything without
 *  it keeps the behaviour it always had — the link navigates. */
const PEEK_KEY_ATTR = 'data-item-key'

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


/**
 * The element focus should return to when an overlay opened from here closes.
 *
 * Deliberately NOT refined to exclude `<body>`, tempting as that reads: when the
 * palette is opened by pointer, `document.activeElement` can be `<body>`, and
 * Base UI resolves that to the first tabbable element in the document — which on
 * this page is the ⌘K trigger itself. Returning `null` instead makes Base UI
 * fall through to nothing and focus really does end up on `<body>`, which is the
 * outcome the return target exists to prevent (measured, not reasoned).
 */
function liveFocus(): HTMLElement | null {
  return document.activeElement instanceof HTMLElement ? document.activeElement : null
}

export function CalendarCanvas({ orgSlug, items, feed, today, view, anchor, kinds, selectedDay: selectedDayProp }: CalendarCanvasProps) {
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
  const [peek, setPeek] = useState<CalendarItem | null>(null)

  /**
   * Escape must dismiss exactly ONE thing.
   *
   * Every overlay here closes itself (Base UI), so it registers as a TOP layer:
   * while one is open, the agenda's bulk selection underneath it — which also
   * answers to Escape — stays put. The peek registers its own layer inside
   * ItemPeek. See dismiss-stack.ts for why the rule lives in a stack rather
   * than in each surface.
   */
  useTopDismissLayer(paletteOpen)
  useTopDismissLayer(shortcutsOpen)

  /**
   * Where to put focus back when an overlay closes — ONE REF PER OVERLAY.
   *
   * All three are opened from STATE (⌘K, `?`, a chip) rather than a
   * <Dialog.Trigger>, and the kit's default `finalFocus` is "the trigger" —
   * with no trigger, closing dropped the keyboard user on <body>, at the top of
   * the document, having lost their place. Capturing the element at the moment
   * of opening and handing it to `finalFocus` is the fix (WCAG 2.4.3).
   *
   * They used to SHARE one ref, which held only while exactly one overlay could
   * be open. ⌘K is the one binding that reaches past an open one (see below),
   * and on the way in it overwrote the peek's chip with an element inside the
   * peek: closing the palette then returned focus into the peek, and closing
   * the peek aimed at a node that was already unmounting, so focus fell to
   * <body>. Separate refs mean no overlay can corrupt another's target even if
   * a future one slips past the guard.
   *
   * Be clear about what this is: the ⌘K guard below already makes nesting
   * impossible, so splitting the ref changes no behaviour TODAY — it is the
   * belt to that braces, and a mutation collapsing these three back into one
   * is (correctly) not caught by any test. The behaviour fix is the inherit +
   * suppress pair below.
   */
  const paletteReturn = useRef<HTMLElement | null>(null)
  const shortcutsReturn = useRef<HTMLElement | null>(null)
  const peekReturn = useRef<HTMLElement | null>(null)

  /**
   * @param opts.returnTo — set ONLY when ⌘K is superseding another overlay: the
   * element that overlay would have returned to. Live focus is wrong there,
   * because live focus is inside the surface that is about to unmount.
   */
  const openPalette = useCallback((opts?: { returnTo: HTMLElement | null }) => {
    paletteReturn.current = opts ? opts.returnTo : liveFocus()
    setPaletteOpen(true)
  }, [])

  const openShortcuts = useCallback(() => {
    shortcutsReturn.current = liveFocus()
    setShortcutsOpen(true)
  }, [])

  /**
   * The surface ⌘K is taking over from must NOT restore focus on its way out.
   *
   * Base UI restores from a `queueMicrotask` inside the closing popup's layout
   * cleanup (FloatingFocusManager), so a superseded peek put focus back on its
   * own chip a microtask AFTER the palette had autofocused its input — the
   * palette opened with focus outside itself, which is worse than the bug being
   * fixed. `finalFocus` also takes a FUNCTION, evaluated at close time, and
   * `false` there means "leave focus where it is". The palette has already
   * inherited the target and will use it when IT closes.
   *
   * Read during the closing popup's LAYOUT cleanup and cleared in the passive
   * effect below, which React runs after every layout cleanup in the same
   * commit — so the flag is true for exactly the one close it is about.
   */
  const superseding = useRef(false)
  useEffect(() => {
    superseding.current = false
  })
  const peekFinalFocus = useCallback(() => (superseding.current ? false : peekReturn.current), [])
  const shortcutsFinalFocus = useCallback(
    () => (superseding.current ? false : shortcutsReturn.current),
    []
  )

  // ── the peek (open an item in place, never lose the grid) ──────────────────

  const byKey = useMemo(() => {
    const map = new Map<string, CalendarItem>()
    for (const i of items) map.set(`${i.kind}:${i.id}`, i)
    return map
  }, [items])

  /** Whether the day spine is currently rendered BESIDE the grid rather than
   *  stacked below it. Client-only and default false, so the server render and
   *  the first client render agree. */
  const [spineBeside, setSpineBeside] = useState(false)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(SPINE_BESIDE_QUERY)
    const sync = () => setSpineBeside(mq.matches)
    sync()
    mq.addEventListener?.('change', sync)
    return () => mq.removeEventListener?.('change', sync)
  }, [])

  /**
   * The one case where a peek would be a step BACKWARDS: the item's day is the
   * day the spine already has open, and the spine is on screen next to the
   * grid. The spine says strictly more about that job than a peek can — the
   * address, the contact, the paperwork — and it says it without a backdrop.
   * So the chip keeps its original behaviour there and goes to the record.
   */
  const spineWouldDuplicate = useCallback(
    (item: CalendarItem) => spineBeside && !!selectedDay && item.date.slice(0, 10) === selectedDay,
    [spineBeside, selectedDay]
  )

  /** Resolve a pointer/key event to the chip it happened on, or null. */
  const peekTarget = useCallback(
    (target: EventTarget | null): { item: CalendarItem; el: HTMLElement } | null => {
      if (!(target instanceof Element)) return null
      const el = target.closest<HTMLElement>(`[${PEEK_KEY_ATTR}]`)
      // The edge-resize strips carry the same key but are not the chip; they are
      // aria-hidden grips, and a click on one means "resize", not "look at".
      if (!el || el.getAttribute('data-slot') === 'grid-resize') return null
      const item = byKey.get(el.getAttribute(PEEK_KEY_ATTR) ?? '')
      if (!item || spineWouldDuplicate(item)) return null
      return { item, el }
    },
    [byKey, spineWouldDuplicate]
  )

  const openPeek = useCallback((el: HTMLElement, item: CalendarItem) => {
    // The CHIP, not live focus: a mouse click does not focus a link in every
    // browser, and the peek promises `[` / `]` work the moment it closes.
    peekReturn.current = el
    setPeek(item)
  }, [])

  /**
   * Click → peek, DRAG → no peek.
   *
   * Bubble phase, deliberately. `reschedule-drag` already suppresses the click
   * that terminates a real drag, and it does it in a CAPTURE handler on the chip
   * with `stopPropagation()` — so a dragged chip's click never reaches this
   * listener at all. A capture listener here would run first and would fire on
   * every completed drag. The press-and-hold/drift rules for touch therefore
   * need no duplication here: if the gesture armed, there is no click to see.
   */
  function onPaneClick(e: React.MouseEvent) {
    // A modified click belongs to the browser ("open in a new tab"), and a
    // middle click is not an activation. Leave both to the link.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    const hit = peekTarget(e.target)
    if (!hit) return
    e.preventDefault()
    openPeek(hit.el, hit.item)
  }

  /**
   * Enter / Space on a focused chip — the chip's NATIVE activation keys, so
   * WCAG 2.1.4 does not apply and nothing new has to be published. They are
   * handled explicitly rather than left to the browser's synthetic click so an
   * `<a>` chip and the month's `<button>` handle behave identically.
   *
   * The reschedule bindings (`[ ] { } , . < >`) are untouched: they are bound on
   * the chip itself and call `stopPropagation()`, so they never arrive here —
   * and none of them is Enter or Space.
   */
  function onPaneKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'Enter' && e.key !== ' ') return
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || isTypingTarget(e.target)) return
    const hit = peekTarget(e.target)
    if (!hit) return
    e.preventDefault()
    openPeek(hit.el, hit.item)
  }

  /**
   * ⌘K stays on the window: it is a MODIFIER combo, which WCAG 2.1.4 does not
   * cover, and a command menu that only opens once you have tabbed into the
   * right region is not a command menu.
   *
   * Being on the window also makes it the ONE door past an open overlay — every
   * other entrance is either state this component guards (`onCockpitKeyDown`
   * stands down while anything is open) or a chip behind a modal backdrop. So
   * this handler is where "one modal at a time" has to be enforced: it used to
   * mount the palette straight over the peek or the `?` sheet, giving two
   * `aria-modal` dialogs, two focus traps and two live Escape handlers — the
   * exact double-dismissal `dismiss-stack.ts` exists to prevent, reached
   * through the one door the stack does not cover.
   *
   * SUPERSEDE, not refuse. The `?` sheet publishes ⌘K as working "anywhere", and
   * a dead accelerator is the worst of the three outcomes — the operator presses
   * it twice and reaches for the mouse. The peek is a landing, not a destination
   * (see ItemPeek), so searching out of it is precisely the next move. Refusing
   * would also buy no safety: the focus-return bug it was masking is fixed on
   * its own terms below — the palette INHERITS the superseded surface's return
   * target, and that surface is told not to restore focus itself. All three
   * overlays are mounted only while open, so the close and the open land in one
   * commit and no two of them ever coexist in the DOM.
   *
   * NOT guarded on `dismissLayerCount()`. That counts every dismissible surface,
   * modal or not, and an agenda bulk selection registers one (AgendaView's
   * `useDismissLayer`) — standing ⌘K down for it would kill search in a
   * completely ordinary state. The guard is this component's own overlay state,
   * which is also the only set of overlays it can legitimately close.
   */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'k') return
      e.preventDefault()
      if (paletteOpen) {
        setPaletteOpen(false)
        return
      }
      // Take over the superseded overlay's return target verbatim: whatever has
      // focus right now is INSIDE it, and is about to unmount (WCAG 2.4.3).
      const superseded = peek ? peekReturn : shortcutsOpen ? shortcutsReturn : null
      if (!superseded) {
        openPalette()
        return
      }
      superseding.current = true
      setPeek(null)
      setShortcutsOpen(false)
      openPalette({ returnTo: superseded.current })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [paletteOpen, shortcutsOpen, peek, openPalette])

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
    if (paletteOpen || shortcutsOpen || peek) return
    if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return
    switch (e.key) {
      case 'm': router.push(link({ view: 'month' })); break
      case 'w': router.push(link({ view: 'week' })); break
      case 'd': router.push(link({ view: 'day' })); break
      case 'a': router.push(link({ view: 'agenda' })); break
      case 't': router.push(todayHref); break
      case '?': openShortcuts(); break
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
          // Wrapped, not passed by reference: `openPalette` takes an options
          // object, and React would hand it the click event as one.
          onClick={() => openPalette()}
          aria-keyshortcuts="Meta+K Control+K"
          className="gap-1.5"
        >
          <span aria-hidden>⌘K</span>
          {/* The accessible name is built from real text, not an aria-label that
              contradicts it — WCAG 2.5.3 Label in Name wants the visible words
              ("Search") to be inside the name a speech user has to say. */}
          <span className="max-sm:sr-only">Search</span>
          <span className="sr-only">, jobs, customers and dates</span>
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
            onClick={openShortcuts}
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
        // The peek is delegated from HERE rather than wired into each grid: the
        // three grids and the agenda are owned by other work in flight, and a
        // single bubble-phase listener over the whole pane is both the smaller
        // change and the one that cooperates with the drag engine's click
        // suppression for free. See onPaneClick.
        onClick={onPaneClick}
        onKeyDown={onPaneKeyDown}
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

      {/* ── ONE RULE FOR ALL THREE OVERLAYS: mounted only while open ──────────
          The peek always worked this way (`item` null → it renders nothing).
          The other two were left mounted and toggled by `open`, which means
          Base UI holds the popup in the DOM for the whole exit transition
          (~100ms of `data-closed:animate-out`) — so a surface opened during
          that window sits over an `aria-modal` node that is still there. jsdom
          implements no Web Animations API and unmounts instantly, so no test
          could ever see it; the one that does had to stub `getAnimations`.
          Unmounting is also what makes each surface open with clean state — it
          replaces the `paletteSeq` remount key the palette used to carry. */}
      {paletteOpen ? (
        <CommandPalette
          onClose={() => setPaletteOpen(false)}
          orgSlug={orgSlug}
          // The BOOK, not the window — see the `feed` prop's note. This is the
          // one place the two differ, and why the palette's claims can be true.
          feed={feed}
          today={today}
          view={view}
          anchor={anchor}
          kinds={kindsParam}
          selectedDay={selectedDay}
          finalFocus={paletteReturn}
          onRun={(href) => {
            setPaletteOpen(false)
            router.push(href)
          }}
        />
      ) : null}

      {shortcutsOpen ? (
        <ShortcutsSheet onClose={() => setShortcutsOpen(false)} finalFocus={shortcutsFinalFocus} />
      ) : null}

      {/* The grid behind this is NOT unmounted and NOT re-keyed: the peek is a
          portalled overlay, not a route change, so the month the operator was
          reading — and its scroll position — is still there when it closes. */}
      <ItemPeek
        item={peek}
        orgSlug={orgSlug}
        today={today}
        view={view}
        kinds={kindsParam}
        onClose={() => setPeek(null)}
        finalFocus={peekFinalFocus}
      />
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

/** Every binding the cockpit answers to. A binding that is not in this table is
 *  undiscoverable, so adding one to the component means adding a row here. */
const SHORTCUTS: Array<{ keys: string[]; label: string }> = [
  { keys: ['M'], label: 'Month view' },
  { keys: ['W'], label: 'Week view' },
  { keys: ['D'], label: 'Day view' },
  { keys: ['A'], label: 'Agenda view' },
  { keys: ['T'], label: 'Jump to today' },
  { keys: ['←', '→'], label: 'Step back / forward' },
  // Reschedule keys are scoped to a focused job chip (WCAG 2.1.4 focus exception)
  // and are also published per-chip via aria-keyshortcuts. One row per PAIR, with
  // the caps in the same order as the words: four separate bindings crammed into
  // one line of prose as bare characters were unreadable, and never said which of
  // `,` and `.` was earlier — the sheet is the published contract for the
  // keyboard-only path to every drag on this surface, so it has to be exact.
  { keys: ['[', ']'], label: 'Move the focused job a day earlier / later' },
  { keys: ['{', '}'], label: 'Move the focused job a week earlier / later' },
  { keys: [',', '.'], label: 'Start the focused job 15 min earlier / later' },
  { keys: ['<', '>'], label: 'Make the focused job 15 min shorter / longer' },
  { keys: ['↵'], label: 'Peek at the focused item without leaving the grid (Space too)' },
  { keys: ['⌘', 'K'], label: 'Search jobs, customers & dates (anywhere)' },
  { keys: ['?'], label: 'This sheet' },
]

/** The bindings that only exist while the ⌘K menu is open. */
const PALETTE_SHORTCUTS: Array<{ keys: string[]; label: string }> = [
  { keys: ['↑', '↓'], label: 'Move through results (wraps)' },
  { keys: ['Home', 'End'], label: 'First / last result' },
  { keys: ['↵'], label: 'Open the highlighted result' },
  { keys: ['Esc'], label: 'Close the menu' },
]

/** The published contract for the scoped bindings — reachable by the `?` key
 *  and by the toolbar button, so it is discoverable without a keyboard too. */
function ShortcutsSheet({
  onClose,
  finalFocus,
}: {
  onClose: () => void
  finalFocus: FinalFocus
}) {
  return (
    // Mounted ONLY while open (the caller decides), so `open` is a constant here
    // and closing is an unmount rather than a fade-out. See the call site.
    <Dialog open onOpenChange={(o) => (o ? undefined : onClose())}>
      <DialogContent finalFocus={finalFocus} className="max-w-sm gap-0 p-0">
        <DialogTitle className="border-b border-border px-4 py-3 text-sm font-semibold">
          Keyboard shortcuts
        </DialogTitle>
        <div className="max-h-[70vh] overflow-y-auto">
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
          <h3 className="border-t border-border px-4 pt-3 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            In the ⌘K menu
          </h3>
          <dl className="divide-y divide-border/60 px-4 pb-1">
            {PALETTE_SHORTCUTS.map((s) => (
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
        </div>
        <p className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
          Single-key shortcuts fire only while the calendar itself has focus — click the grid or
          Tab into it. That keeps them clear of screen-reader quick-nav keys.
        </p>
      </DialogContent>
    </Dialog>
  )
}

/** Short, checkable date for a result's second line. */
function prettyDate(ymd: string): string {
  return new Date(`${ymd}T00:00:00.000Z`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * How many feed rows we will RENDER for a query.
 *
 * Miller's 7±2 governs a set you must hold in your head to choose between — the
 * fixed command list. It does not govern a filtered result list you visually
 * scan, and capping search results at 7 is how the old palette managed to hold
 * the entire feed and show you none of it. So: commands stay at six, and feed
 * matches render up to eight, with the true total reported underneath ("8 of
 * 34") so the cap is never a silent lie (Nielsen #1, visibility of system
 * status). Eight two-line rows is about one screenful of the list's 18rem.
 */
const FEED_RESULT_CAP = 8

type ResultGroupId = 'jump' | 'calendar' | 'command'

interface PaletteResult {
  id: string
  group: ResultGroupId
  label: string
  detail?: string
  href: string
}

const GROUP_LABELS: Record<ResultGroupId, string> = {
  jump: 'Dates',
  calendar: 'On the calendar',
  command: 'Commands',
}

interface FeedRow {
  /** Pre-lowercased haystack. Built ONCE per feed, not once per keystroke. */
  hay: string
  ymd: string
  endYmd: string
  item: CalendarItem
}

interface FeedIndex {
  rows: FeedRow[]
  min?: string
  max?: string
}

/**
 * The search index. The palette runs over this on every keystroke, so the
 * expensive half — string concat + toLowerCase per item — is hoisted out of the
 * query memo and keyed on the feed alone. What is left per keystroke is a
 * substring test per row, which stays well inside Doherty's 400ms even on a
 * feed an order of magnitude bigger than a visible window ever is.
 */
function buildIndex(items: CalendarItem[]): FeedIndex {
  let min: string | undefined
  let max: string | undefined
  const rows = items.map((item) => {
    const ymd = item.date.slice(0, 10)
    const endYmd = (item.endDate ?? item.date).slice(0, 10)
    if (!min || ymd < min) min = ymd
    if (!max || endYmd > max) max = endYmd
    // The ISO date is part of the haystack on purpose: typing a date should
    // surface that day's work next to the jump, not just the jump.
    return { hay: `${item.title} ${item.detail ?? ''} ${ymd}`.toLowerCase(), ymd, endYmd, item }
  })
  return { rows, min, max }
}

/** AND across whitespace-separated terms, mirroring lib/catalog-search.ts.
 *  Predictable beats clever: a fuzzy subsequence match with no highlighting is
 *  a black box, and "why did that match?" is a worse bug than "no match". */
function matchesAll(hay: string, terms: string[]): boolean {
  for (const t of terms) if (!hay.includes(t)) return false
  return true
}

/**
 * The second line under a jump: how far away the day is, and — the reason an
 * operator is jumping there at all — whether anything is already on it.
 *
 * The load half is only ever stated for a day the loaded feed actually covers.
 * The canvas is handed a WINDOW of the feed, not the whole book, so a jump to
 * a day outside it would otherwise render a confident "nothing scheduled" for
 * a day we have simply not read. Saying less is the only honest option; the
 * covered span is bounded conservatively by the first and last dates present.
 */
function jumpDetail(ymd: string, today: string, index: FeedIndex): string {
  const when = relativeDayLabel(ymd, today)
  if (!index.min || !index.max || ymd < index.min || ymd > index.max) return when
  let n = 0
  for (const row of index.rows) if (row.ymd <= ymd && ymd <= row.endYmd) n++
  const load = n === 0 ? 'nothing scheduled' : `${n} item${n === 1 ? '' : 's'} scheduled`
  return `${when} · ${load}`
}

/**
 * ⌘K: search the whole feed, jump to a human-typed date, then the fixed
 * actions. Grouped, keyboard-first, and it always shows what it understood
 * before it moves anyone anywhere.
 *
 * "The whole feed" is now literal. It used to be the canvas's visible WINDOW —
 * one day in Day view — while the empty state and the overflow line both spoke
 * as if they had read the book. Every claim below is scoped to `feed`, and the
 * one narrowing that survives (`?kinds`) is named wherever a count is stated.
 */
function CommandPalette({
  onClose,
  orgSlug,
  feed,
  today,
  view,
  anchor,
  kinds,
  selectedDay,
  finalFocus,
  onRun,
}: {
  onClose: () => void
  orgSlug: string
  /** The whole `?kinds`-scoped org feed — the search index, NOT the window. */
  feed: CalendarItem[]
  today: string
  view: CanvasView
  anchor: string
  kinds?: string
  selectedDay?: string
  finalFocus: FinalFocus
  onRun: (href: string) => void
}) {
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const listId = 'calendar-cmdk-list'

  // NOTE: the palette starts empty on every open because the canvas MOUNTS it
  // on open and unmounts it on close, not because an effect clears the query —
  // the effect version wiped the list mid-exit-animation and cost a cascading
  // render on every close.

  const index = useMemo(() => buildIndex(feed), [feed])

  const { results, feedTotal } = useMemo(() => {
    const q = query.trim()
    const link = (over: { view?: CanvasView; week?: string; ymd?: string }) =>
      calendarHref({ orgSlug, view: over.view ?? view, week: over.week ?? anchor, kinds, ymd: over.ymd ?? selectedDay })
    // Day-targeting links omit week so the target self-derives its period (#1).
    const dayLink = (ymd: string) => calendarHref({ orgSlug, view, kinds, ymd })

    // ── 1. the date the operator typed, in whatever shape they typed it ────
    const jump: PaletteResult[] = []
    const parsed = q ? parseDatePhrase(q, today) : null
    if (parsed) {
      jump.push({
        id: 'jump',
        group: 'jump',
        // The confirmable echo. Never navigate on a reading the operator has
        // not seen spelled out — "9/13" resolving to NEXT year has to be
        // visible before Enter, not discovered after the page moves.
        label: `Jump to ${formatLongDate(parsed.ymd)}`,
        detail: jumpDetail(parsed.ymd, today, index),
        href: dayLink(parsed.ymd),
      })
    }

    // ── 2. the feed it was already holding and never searched ──────────────
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
    const feed: PaletteResult[] = []
    let total = 0
    if (terms.length > 0) {
      for (const row of index.rows) {
        if (!matchesAll(row.hay, terms)) continue
        total++
        if (feed.length >= FEED_RESULT_CAP) continue
        const bits = [CALENDAR_KIND_LABELS[row.item.kind], prettyDate(row.ymd)]
        if (row.item.detail) bits.push(row.item.detail)
        feed.push({
          id: `feed-${row.item.kind}-${row.item.id}-${row.ymd}`,
          group: 'calendar',
          label: row.item.title,
          detail: bits.join(' · '),
          // The item's own record when it has one; its day when it does not, so
          // a feed row can never be a dead click.
          href: row.item.href || dayLink(row.ymd),
        })
      }
    }

    // ── 3. the fixed actions, last: they duplicate visible toolbar controls ─
    const actions: PaletteResult[] = [
      { id: 'today', group: 'command', label: 'Go to today', href: link({ week: today }) },
      { id: 'new', group: 'command', label: 'Book a job', href: `/${orgSlug}/new-event` },
      { id: 'v-month', group: 'command', label: 'Month view', href: link({ view: 'month' }) },
      { id: 'v-week', group: 'command', label: 'Week view', href: link({ view: 'week' }) },
      { id: 'v-day', group: 'command', label: 'Day view', href: link({ view: 'day' }) },
      { id: 'v-agenda', group: 'command', label: 'Agenda view', href: link({ view: 'agenda' }) },
    ]
    const commands = terms.length ? actions.filter((c) => matchesAll(c.label.toLowerCase(), terms)) : actions

    return { results: [...jump, ...feed, ...commands], feedTotal: total }
  }, [query, orgSlug, view, anchor, kinds, selectedDay, today, index])

  // The highlight is CLAMPED at read time rather than corrected in an effect:
  // the list can shrink under a stale index (a new feed arrives while the menu
  // is open), and an effect fixing that costs an extra render in which
  // aria-activedescendant points at an id that is no longer in the DOM.
  const active = results.length === 0 ? 0 : Math.min(highlight, results.length - 1)

  // Contiguous runs, so each group heading is rendered once and owns its rows.
  const groups: Array<{ id: ResultGroupId; from: number; rows: PaletteResult[] }> = []
  results.forEach((r, i) => {
    const last = groups[groups.length - 1]
    if (last && last.id === r.group) last.rows.push(r)
    else groups.push({ id: r.group, from: i, rows: [r] })
  })

  const overflow = feedTotal > FEED_RESULT_CAP
  const trimmed = query.trim()

  /**
   * WHAT WAS ACTUALLY SEARCHED, in the words of the claims made about it.
   *
   * The index is the whole book now, so "no matches" and "8 of 34" are finally
   * facts about the calendar rather than about the seven days on screen. The
   * one narrowing left is the operator's own `?kinds` filter — handed to us
   * pre-applied — so a count taken under it is a within-filter count and has to
   * say so, with the way out named rather than left to be guessed.
   */
  const filtered = kinds === 'pipeline'
  const scope = filtered ? ' in the pipeline filter' : ''
  const emptyScope = filtered
    ? ' in the pipeline filter (clear it to search every kind)'
    : ' anywhere on the calendar'
  const status =
    results.length === 0
      ? trimmed
        ? `No matches for “${trimmed}”${emptyScope}. Try a customer name, or a date like “sep 13”, “9/13” or “next sat”.`
        : ''
      : overflow
        ? `Showing ${FEED_RESULT_CAP} of ${feedTotal} calendar matches${scope} — keep typing to narrow.`
        : ''

  // Announced politely rather than only rendered: the visible list IS the
  // feedback for a sighted user, but a screen-reader user typing into a
  // combobox hears nothing at all unless the result count is spoken — and never
  // reads the status paragraph, so the scope has to travel with the count here
  // too or the honesty fix is sighted-only.
  const announcement =
    results.length === 0
      ? `No matches${scope}`
      : `${results.length} result${results.length === 1 ? '' : 's'}${overflow ? `, ${feedTotal} calendar matches${scope} in total` : ''}`

  function move(delta: number) {
    // Wrapping, not clamping: the list is a ring, so Up from the top is the
    // fastest route to the last command and Down off the end returns home.
    setHighlight(results.length === 0 ? 0 : (active + delta + results.length) % results.length)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      move(1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      move(-1)
    } else if (e.key === 'Home') {
      e.preventDefault()
      setHighlight(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setHighlight(Math.max(0, results.length - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const cmd = results[active]
      if (cmd) onRun(cmd.href)
    }
  }

  return (
    // Mounted ONLY while open (the caller decides), so `open` is a constant here
    // and closing is an unmount rather than a fade-out. See the call site.
    <Dialog open onOpenChange={(o) => (o ? undefined : onClose())}>
      <DialogContent finalFocus={finalFocus} showCloseButton={false} className="top-24 max-w-md translate-y-0 gap-0 p-0">
        <DialogTitle className="sr-only">Command menu</DialogTitle>
        <input
          autoFocus
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={results[active]?.id}
          aria-label="Search jobs, customers and dates"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setHighlight(0)
          }}
          onKeyDown={onKeyDown}
          placeholder="Search jobs and customers, or type a date — “sep 13”, “next sat”, “+2w”"
          // `outline-none` suppresses the browser's own ring, so it MUST be paid
          // back with a focus-visible treatment or this is a WCAG 2.4.7 failure —
          // and this is the only focus stop in the dialog a keyboard user comes
          // back to after arrowing the list. Same three utilities as the agenda's
          // date field (AgendaView), so the cockpit has one focus look.
          className="w-full rounded-t-xl border-b border-border bg-transparent px-3.5 py-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 placeholder:text-muted-foreground"
        />
        <div id={listId} role="listbox" aria-label="Results" className="max-h-72 overflow-y-auto p-1.5">
          {groups.map((g) => (
            <div key={`${g.id}-${g.from}`} role="group" aria-labelledby={`cmdk-h-${g.id}`}>
              <div
                id={`cmdk-h-${g.id}`}
                className="px-2.5 pt-1.5 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"
              >
                {GROUP_LABELS[g.id]}
              </div>
              {g.rows.map((r, j) => {
                const i = g.from + j
                return (
                  <div
                    key={r.id}
                    id={r.id}
                    role="option"
                    aria-selected={i === active}
                    onMouseMove={() => setHighlight(i)}
                    onClick={() => onRun(r.href)}
                    // min-h-11 is 44px — the pointer target size WCAG 2.5.8
                    // only asks 24px for, at the size a thumb on a tablet in a
                    // van actually hits.
                    className={cn(
                      'flex min-h-11 cursor-pointer flex-col justify-center gap-0.5 rounded-md px-2.5 py-1.5',
                      i === active && 'bg-muted'
                    )}
                  >
                    <span className="truncate text-sm text-foreground">{r.label}</span>
                    {r.detail ? (
                      <span className="truncate text-xs text-muted-foreground">{r.detail}</span>
                    ) : null}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
        {status ? (
          <p data-slot="cmdk-status" className="border-t border-border px-3.5 py-2 text-xs text-muted-foreground">
            {status}
          </p>
        ) : null}
        <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
          {announcement}
        </div>
      </DialogContent>
    </Dialog>
  )
}
