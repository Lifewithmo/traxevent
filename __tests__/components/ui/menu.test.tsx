import { render, screen } from '@testing-library/react'
import { Menu, MenuTrigger, MenuContent, MenuItem } from '@/components/ui/menu'

it('renders a trigger and reveals items when opened', async () => {
  const { default: userEvent } = await import('@testing-library/user-event')
  const user = userEvent.setup()
  render(
    <Menu>
      <MenuTrigger>Actions</MenuTrigger>
      <MenuContent><MenuItem onClick={() => {}}>Merge</MenuItem></MenuContent>
    </Menu>
  )
  await user.click(screen.getByText('Actions'))
  expect(await screen.findByText('Merge')).toBeInTheDocument()
})
