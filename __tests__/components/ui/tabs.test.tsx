import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Tabs, TabsList, TabsTab, TabsPanel } from '@/components/ui/tabs'

describe('Tabs', () => {
  it('renders each tab with role="tab" and the correct accessible name', () => {
    render(
      <Tabs defaultValue="units">
        <TabsList>
          <TabsTab value="units">Units</TabsTab>
          <TabsTab value="recipes">Recipes</TabsTab>
        </TabsList>
        <TabsPanel value="units">Units content</TabsPanel>
        <TabsPanel value="recipes">Recipes content</TabsPanel>
      </Tabs>
    )
    expect(screen.getByRole('tab', { name: 'Units' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Recipes' })).toBeInTheDocument()
  })

  it('switches which panel content is visible when a tab is clicked', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    render(
      <Tabs defaultValue="units">
        <TabsList>
          <TabsTab value="units">Units</TabsTab>
          <TabsTab value="recipes">Recipes</TabsTab>
        </TabsList>
        <TabsPanel value="units">Units content</TabsPanel>
        <TabsPanel value="recipes">Recipes content</TabsPanel>
      </Tabs>
    )
    expect(screen.getByText('Units content')).toBeInTheDocument()
    expect(screen.queryByText('Recipes content')).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Recipes' }))

    expect(screen.getByText('Recipes content')).toBeInTheDocument()
    expect(screen.queryByText('Units content')).not.toBeInTheDocument()
  })

  it('keeps the inactive panel content in the DOM when keepMounted is set', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    render(
      <Tabs defaultValue="units">
        <TabsList>
          <TabsTab value="units">Units</TabsTab>
          <TabsTab value="recipes">Recipes</TabsTab>
        </TabsList>
        <TabsPanel value="units" keepMounted>
          <input aria-label="Units draft" defaultValue="in-progress" />
        </TabsPanel>
        <TabsPanel value="recipes" keepMounted>
          Recipes content
        </TabsPanel>
      </Tabs>
    )

    const draftInput = screen.getByLabelText('Units draft') as HTMLInputElement
    await user.type(draftInput, ' edit')
    expect(draftInput.value).toBe('in-progress edit')

    await user.click(screen.getByRole('tab', { name: 'Recipes' }))

    // Inactive panel stays mounted (hidden, not removed) so in-progress
    // form state survives switching tabs.
    const stillMounted = screen.getByLabelText('Units draft') as HTMLInputElement
    expect(stillMounted).toBeInTheDocument()
    expect(stillMounted.value).toBe('in-progress edit')
  })

  it('wires aria-selected on the selected tab', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    render(
      <Tabs defaultValue="units">
        <TabsList>
          <TabsTab value="units">Units</TabsTab>
          <TabsTab value="recipes">Recipes</TabsTab>
        </TabsList>
        <TabsPanel value="units">Units content</TabsPanel>
        <TabsPanel value="recipes">Recipes content</TabsPanel>
      </Tabs>
    )

    expect(screen.getByRole('tab', { name: 'Units' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Recipes' })).toHaveAttribute('aria-selected', 'false')

    await user.click(screen.getByRole('tab', { name: 'Recipes' }))

    expect(screen.getByRole('tab', { name: 'Units' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tab', { name: 'Recipes' })).toHaveAttribute('aria-selected', 'true')
  })
})
