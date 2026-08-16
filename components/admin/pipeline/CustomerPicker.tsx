'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Customer } from '@/lib/types'

interface CustomerPickerProps {
  customers: Customer[]
  value: Customer | null
  onChange: (customer: Customer | null) => void
}

const optionLabel = (c: Customer) =>
  [c.name, c.company, c.email].filter(Boolean).join(' · ')

/**
 * Typeahead over the org's existing clients.
 *
 * The kit ships no Combobox and is frozen, so the ARIA 1.2 combobox pattern is
 * wired by hand here: DOM focus never leaves the input (so typing keeps
 * working) and the highlighted row is published through `aria-activedescendant`
 * instead. The `<li>` is the ARIA option; the button inside it is only the
 * pointer target and is taken out of the tab order.
 */
export function CustomerPicker({ customers, value, onChange }: CustomerPickerProps) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(-1)
  const [dismissed, setDismissed] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const optionId = (index: number) => `${listId}-option-${index}`

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setDismissed(true)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [])

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
        <span>
          Linked to <span className="font-medium">{value.name}</span>
          {value.company ? ` · ${value.company}` : ''}
        </span>
        <Button variant="ghost" size="sm" onClick={() => onChange(null)}>Clear</Button>
      </div>
    )
  }

  const q = query.trim().toLowerCase()
  const matches = q
    ? customers.filter((c) =>
        [c.name, c.company, c.email].some((f) => f?.toLowerCase().includes(q))
      ).slice(0, 8)
    : []
  const open = matches.length > 0 && !dismissed
  const activeIndex = open && active < matches.length ? active : -1

  function pick(customer: Customer) {
    onChange(customer)
    setQuery('')
    setActive(-1)
    setDismissed(false)
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      if (!open) return
      event.preventDefault()
      setDismissed(true)
      setActive(-1)
      // This picker renders inside a kit Dialog (NewOpportunityForm). Base UI's
      // dismiss hook listens for Escape on `document` and does NOT check
      // `defaultPrevented`, so preventDefault alone still lets the keystroke tear
      // down the enclosing dialog and discard a half-filled form. Escape must
      // close the suggestion list and nothing else, so stop the native event
      // before it reaches that listener.
      event.stopPropagation()
      event.nativeEvent.stopImmediatePropagation()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (matches.length === 0) return
      event.preventDefault()
      setDismissed(false)
      const step = event.key === 'ArrowDown' ? 1 : -1
      const from = activeIndex === -1 ? (step === 1 ? -1 : 0) : activeIndex
      setActive((from + step + matches.length) % matches.length)
      return
    }
    if (event.key === 'Enter' && open && activeIndex >= 0) {
      event.preventDefault()
      pick(matches[activeIndex])
    }
  }

  return (
    <div ref={rootRef} className="space-y-1">
      <Label htmlFor="customerPicker">Link to existing customer (optional)</Label>
      <Input
        id="customerPicker"
        role="combobox"
        autoComplete="off"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setActive(-1)
          setDismissed(false)
        }}
        onKeyDown={onKeyDown}
        placeholder="Search clients by name, company, or email"
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Matching clients"
          className="divide-y divide-border rounded-md border border-border"
        >
          {matches.map((c, i) => (
            <li
              key={c.id}
              id={optionId(i)}
              role="option"
              aria-selected={i === activeIndex}
              className={i === activeIndex ? 'bg-muted' : undefined}
            >
              <button
                type="button"
                tabIndex={-1}
                className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(c)}
              >
                {optionLabel(c)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
