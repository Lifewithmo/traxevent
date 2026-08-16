import { render, screen } from '@testing-library/react'
import { it, expect } from 'vitest'
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

it('reveals its content when the trigger is used', async () => {
  const { default: userEvent } = await import('@testing-library/user-event')
  const user = userEvent.setup()
  render(
    <Sheet>
      <SheetTrigger>Open vendor</SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Blooms &amp; Co.</SheetTitle>
          <SheetDescription>Florist</SheetDescription>
        </SheetHeader>
        <SheetBody>Committed $1,200.00</SheetBody>
      </SheetContent>
    </Sheet>
  )
  await user.click(screen.getByText('Open vendor'))
  expect(await screen.findByText('Blooms & Co.')).toBeInTheDocument()
  expect(screen.getByText('Committed $1,200.00')).toBeInTheDocument()
})

it('labels the dialog with its title', async () => {
  const { default: userEvent } = await import('@testing-library/user-event')
  const user = userEvent.setup()
  render(
    <Sheet>
      <SheetTrigger>Open</SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Blooms</SheetTitle>
        </SheetHeader>
      </SheetContent>
    </Sheet>
  )
  await user.click(screen.getByText('Open'))
  expect(await screen.findByRole('dialog', { name: 'Blooms' })).toBeInTheDocument()
})

// The close button lives on SheetContent, not SheetHeader, so a Sheet composed
// without a header still has a visible dismiss control.
it('offers a close control even with no header', async () => {
  const { default: userEvent } = await import('@testing-library/user-event')
  const user = userEvent.setup()
  render(
    <Sheet>
      <SheetTrigger>Open</SheetTrigger>
      <SheetContent>
        <SheetBody>Body only</SheetBody>
      </SheetContent>
    </Sheet>
  )
  await user.click(screen.getByText('Open'))
  await user.click(await screen.findByRole('button', { name: 'Close' }))
  expect(screen.queryByText('Body only')).not.toBeInTheDocument()
})

it('honours a controlled open state', async () => {
  const { default: userEvent } = await import('@testing-library/user-event')
  const user = userEvent.setup()
  let closed = false
  render(
    <Sheet open onOpenChange={(open) => { if (!open) closed = true }}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Controlled</SheetTitle>
        </SheetHeader>
      </SheetContent>
    </Sheet>
  )
  expect(await screen.findByText('Controlled')).toBeInTheDocument()
  await user.keyboard('{Escape}')
  expect(closed).toBe(true)
})

it('can suppress the close button', async () => {
  const { default: userEvent } = await import('@testing-library/user-event')
  const user = userEvent.setup()
  render(
    <Sheet>
      <SheetTrigger>Open</SheetTrigger>
      <SheetContent showCloseButton={false}>
        <SheetHeader>
          <SheetTitle>No close</SheetTitle>
        </SheetHeader>
      </SheetContent>
    </Sheet>
  )
  await user.click(screen.getByText('Open'))
  expect(await screen.findByText('No close')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
})
