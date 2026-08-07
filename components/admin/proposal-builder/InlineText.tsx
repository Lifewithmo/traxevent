'use client'

// In-place text editing primitive (spec §4): the committed value renders in
// its final position and typography; clicking it (or pressing Enter/Space on
// the focused element) swaps in an identically-styled borderless field.
// Enter commits (Shift+Enter inserts a newline when multiline), Escape
// cancels, blur commits. `**bold**` / `*italic*` are typed as syntax and
// rendered on commit via the same parseInline the customer surfaces use.
import { useEffect, useRef, useState } from 'react'
import { parseInline } from '@/lib/proposals/blocks'

export function InlineText({
  value,
  onCommit,
  ariaLabel,
  className = '',
  multiline = false,
  placeholder,
  disabled = false,
}: {
  value: string
  onCommit: (next: string) => void
  ariaLabel: string
  className?: string
  multiline?: boolean
  placeholder?: string
  disabled?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const fieldRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (editing) fieldRef.current?.focus()
  }, [editing])

  function begin() {
    if (disabled) return
    setDraft(value)
    setEditing(true)
  }

  function commit() {
    setEditing(false)
    if (draft !== value) onCommit(draft)
  }

  function cancel() {
    setDraft(value)
    setEditing(false)
  }

  if (editing) {
    return (
      <textarea
        ref={fieldRef}
        aria-label={ariaLabel}
        value={draft}
        rows={multiline ? Math.max(2, draft.split('\n').length) : 1}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !(multiline && e.shiftKey)) {
            e.preventDefault()
            commit()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            cancel()
          }
        }}
        placeholder={placeholder}
        className={`w-full resize-none border-0 bg-transparent p-0 outline-none focus:ring-0 ${className}`}
      />
    )
  }

  const empty = value.trim() === ''
  return (
    <span
      role={disabled ? undefined : 'button'}
      tabIndex={disabled ? undefined : 0}
      onClick={begin}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          begin()
        }
      }}
      className={`block cursor-text ${empty ? 'text-gray-400' : ''} ${className}`}
    >
      {empty
        ? <span>{placeholder ?? ' '}</span>
        : parseInline(value).map((t, i) => {
            if (t.bold) return <strong key={i}>{t.text}</strong>
            if (t.italic) return <em key={i}>{t.text}</em>
            return <span key={i}>{t.text}</span>
          })}
    </span>
  )
}
