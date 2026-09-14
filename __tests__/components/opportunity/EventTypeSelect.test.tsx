import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EventTypeSelect } from '@/components/admin/opportunity/EventTypeSelect'

const PROFILES = [
  { id: 'et-wedding', name: 'Wedding' },
  { id: 'et-corporate', name: 'Corporate' },
]

describe('EventTypeSelect', () => {
  it('with zero active profiles renders only the plain free-text input (spec §5c 0-types rule)', () => {
    const onChange = vi.fn()
    render(
      <EventTypeSelect
        profiles={[]}
        value=""
        onChange={onChange}
        id="et-select"
        otherInputId="et-other"
        selectAriaLabel="Event type"
      />
    )
    expect(screen.queryByRole('combobox')).toBeNull()
    const input = screen.getByLabelText('Event type')
    fireEvent.change(input, { target: { value: 'Gala' } })
    expect(onChange).toHaveBeenCalledWith({ event_type: 'Gala', event_type_id: null })
  })

  it('lists active profile names plus "Other…" when profiles exist', () => {
    render(
      <EventTypeSelect
        profiles={PROFILES}
        value=""
        onChange={vi.fn()}
        id="et-select"
        otherInputId="et-other"
        selectAriaLabel="Event type"
      />
    )
    const select = screen.getByLabelText('Event type') as HTMLSelectElement
    const optionLabels = Array.from(select.options).map((o) => o.textContent)
    expect(optionLabels).toEqual(expect.arrayContaining(['Wedding', 'Corporate', 'Other…']))
    // The Other free-text field is not mounted until Other… is chosen.
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('picking a listed option fires onChange and onCommitSelect with its id', () => {
    const onChange = vi.fn()
    const onCommitSelect = vi.fn()
    render(
      <EventTypeSelect
        profiles={PROFILES}
        value=""
        onChange={onChange}
        onCommitSelect={onCommitSelect}
        id="et-select"
        otherInputId="et-other"
        selectAriaLabel="Event type"
      />
    )
    fireEvent.change(screen.getByLabelText('Event type'), { target: { value: 'Wedding' } })
    expect(onChange).toHaveBeenCalledWith({ event_type: 'Wedding', event_type_id: 'et-wedding' })
    expect(onCommitSelect).toHaveBeenCalledWith({ event_type: 'Wedding', event_type_id: 'et-wedding' })
  })

  it('choosing Other… reveals the free-text input without calling onCommitSelect', () => {
    const onChange = vi.fn()
    const onCommitSelect = vi.fn()
    render(
      <EventTypeSelect
        profiles={PROFILES}
        value=""
        onChange={onChange}
        onCommitSelect={onCommitSelect}
        id="et-select"
        otherInputId="et-other"
        selectAriaLabel="Event type"
        otherAriaLabel="Custom event type"
      />
    )
    fireEvent.change(screen.getByLabelText('Event type'), { target: { value: '__other__' } })
    expect(onChange).toHaveBeenCalledWith({ event_type: '', event_type_id: null })
    expect(onCommitSelect).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Custom event type')).toBeInTheDocument()
  })

  it('typing into the revealed Other field always carries a null id, never onCommitSelect', () => {
    const onChange = vi.fn()
    const onCommitSelect = vi.fn()
    render(
      <EventTypeSelect
        profiles={PROFILES}
        value=""
        onChange={onChange}
        onCommitSelect={onCommitSelect}
        id="et-select"
        otherInputId="et-other"
        selectAriaLabel="Event type"
        otherAriaLabel="Custom event type"
      />
    )
    fireEvent.change(screen.getByLabelText('Event type'), { target: { value: '__other__' } })
    fireEvent.change(screen.getByLabelText('Custom event type'), { target: { value: 'Corporate' } })
    // Even though the typed text happens to match a configured profile name,
    // typing never auto-resolves an id or auto-commits — only an explicit
    // pick from the dropdown does (guards against a mid-typing surprise
    // commit if a custom entry coincidentally matches a listed name).
    expect(onChange).toHaveBeenLastCalledWith({ event_type: 'Corporate', event_type_id: null })
    expect(onCommitSelect).not.toHaveBeenCalled()
  })

  it('an unmatched initial value starts in Other mode, pre-filled', () => {
    render(
      <EventTypeSelect
        profiles={PROFILES}
        value="Gala Night"
        onChange={vi.fn()}
        id="et-select"
        otherInputId="et-other"
        selectAriaLabel="Event type"
        otherAriaLabel="Custom event type"
      />
    )
    const select = screen.getByLabelText('Event type') as HTMLSelectElement
    expect(select.value).toBe('__other__')
    expect(screen.getByLabelText('Custom event type')).toHaveValue('Gala Night')
  })

  it('a matching initial value pre-selects that option and does not reveal Other', () => {
    render(
      <EventTypeSelect
        profiles={PROFILES}
        value="Corporate"
        onChange={vi.fn()}
        id="et-select"
        otherInputId="et-other"
        selectAriaLabel="Event type"
      />
    )
    const select = screen.getByLabelText('Event type') as HTMLSelectElement
    expect(select.value).toBe('Corporate')
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('picking a listed option again from Other mode hides the free-text field', () => {
    render(
      <EventTypeSelect
        profiles={PROFILES}
        value="Gala Night"
        onChange={vi.fn()}
        id="et-select"
        otherInputId="et-other"
        selectAriaLabel="Event type"
        otherAriaLabel="Custom event type"
      />
    )
    expect(screen.getByLabelText('Custom event type')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Event type'), { target: { value: 'Wedding' } })
    expect(screen.queryByLabelText('Custom event type')).not.toBeInTheDocument()
  })

  it('disables both controls when disabled', () => {
    render(
      <EventTypeSelect
        profiles={PROFILES}
        value="Gala Night"
        onChange={vi.fn()}
        id="et-select"
        otherInputId="et-other"
        selectAriaLabel="Event type"
        otherAriaLabel="Custom event type"
        disabled
      />
    )
    expect(screen.getByLabelText('Event type')).toBeDisabled()
    expect(screen.getByLabelText('Custom event type')).toBeDisabled()
  })

  // F3: the select wears the kit Input's skin (components/ui/input.tsx), not a
  // fork of it — same h-8/rounded-lg metrics as its kit neighbors, the house
  // focus-visible ring, and text-base (16px) below md so iOS Safari never
  // focus-zooms the PUBLIC intake form, stepping down to md:text-sm.
  it('skins the select from the kit Input class set (metrics, focus ring, no-iOS-zoom type scale)', () => {
    render(
      <EventTypeSelect
        profiles={PROFILES}
        value=""
        onChange={vi.fn()}
        id="et-select"
        otherInputId="et-other"
        selectAriaLabel="Event type"
      />
    )
    const select = screen.getByLabelText('Event type')
    for (const cls of [
      'h-8', 'w-full', 'rounded-lg', 'border-input', 'text-base', 'md:text-sm',
      'focus-visible:border-ring', 'focus-visible:ring-3', 'dark:bg-input/30',
    ]) {
      expect(select.className).toContain(cls)
    }
    // The pre-F3 fork: 14px everywhere (iOS focus-zoom on the public form),
    // no focus ring, off-kit metrics.
    expect(select.className).not.toContain('h-9')
    expect(select.className).not.toContain('rounded-md')
  })

  it('renders the revealed Other field with the kit Input component itself', () => {
    render(
      <EventTypeSelect
        profiles={PROFILES}
        value="Gala Night"
        onChange={vi.fn()}
        id="et-select"
        otherInputId="et-other"
        selectAriaLabel="Event type"
        otherAriaLabel="Custom event type"
      />
    )
    // data-slot="input" is the kit Input's marker (components/ui/input.tsx).
    expect(screen.getByLabelText('Custom event type')).toHaveAttribute('data-slot', 'input')
  })

  it('renders the 0-profiles fallback with the kit Input component too', () => {
    render(
      <EventTypeSelect
        profiles={[]}
        value=""
        onChange={vi.fn()}
        id="et-select"
        otherInputId="et-other"
        selectAriaLabel="Event type"
      />
    )
    expect(screen.getByLabelText('Event type')).toHaveAttribute('data-slot', 'input')
  })
})
