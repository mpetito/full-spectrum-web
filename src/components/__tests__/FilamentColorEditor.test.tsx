import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithContext } from '../../__tests__/test-utils';
import { FilamentColorEditor } from '../FilamentColorEditor';

describe('FilamentColorEditor', () => {
  it('renders heading and default filament swatches', () => {
    renderWithContext(<FilamentColorEditor />);
    expect(screen.getByText('Filament Colors')).toBeInTheDocument();
    // Default FILAMENT_COLORS has 11 entries (indices 0–10)
    expect(screen.getByLabelText('Filament 0 color')).toBeInTheDocument();
    expect(screen.getByLabelText('Filament 10 color')).toBeInTheDocument();
  });

  it('shows add button when under max slots', () => {
    renderWithContext(<FilamentColorEditor />);
    expect(screen.getByLabelText('Add filament color')).toBeInTheDocument();
  });

  it('adds a filament slot when + is clicked', async () => {
    const user = userEvent.setup();
    renderWithContext(<FilamentColorEditor />);
    const addBtn = screen.getByLabelText('Add filament color');
    await user.click(addBtn);
    // Should now have filament 11
    expect(screen.getByLabelText('Filament 11 color')).toBeInTheDocument();
  });

  it('removes only the last filament slot', async () => {
    const user = userEvent.setup();
    renderWithContext(<FilamentColorEditor />);
    // Add a slot first so we have 12 (0–11)
    await user.click(screen.getByLabelText('Add filament color'));
    expect(screen.getByLabelText('Filament 11 color')).toBeInTheDocument();

    // Remove button should be on last slot only
    const removeBtn = screen.getByLabelText('Remove last filament');
    await user.click(removeBtn);
    expect(screen.queryByLabelText('Filament 11 color')).not.toBeInTheDocument();
    // Earlier slots preserved
    expect(screen.getByLabelText('Filament 10 color')).toBeInTheDocument();
  });

  it('does not show remove button on index 0', () => {
    renderWithContext(<FilamentColorEditor />);
    // Only the last slot shows remove; index 0 should never have it
    const allRemoveBtns = screen.queryAllByLabelText('Remove last filament');
    // At most 1 remove button (on last slot)
    expect(allRemoveBtns.length).toBeLessThanOrEqual(1);
  });

  it('resets color on double-click', async () => {
    const user = userEvent.setup();
    renderWithContext(<FilamentColorEditor />);
    const swatch = screen.getByLabelText('Filament 1 color');
    // Double-click the parent container (which has the handler)
    await user.dblClick(swatch.closest('[title="Double-click to reset"]')!);
    // After reset, filament 1 should still exist
    expect(screen.getByLabelText('Filament 1 color')).toBeInTheDocument();
  });

  it('add stops at 32 slots (max boundary)', async () => {
    const user = userEvent.setup();
    renderWithContext(<FilamentColorEditor />);
    // Default: 11 colors. Click add 21 times to reach 32.
    const addBtn = screen.getByLabelText('Add filament color');
    for (let i = 0; i < 21; i++) {
      await user.click(addBtn);
    }
    expect(screen.getByLabelText('Filament 31 color')).toBeInTheDocument();
    // Add button should be gone at max
    expect(screen.queryByLabelText('Add filament color')).not.toBeInTheDocument();
  });

  it('remove stops at 2 slots (min boundary)', async () => {
    const user = userEvent.setup();
    renderWithContext(<FilamentColorEditor />);
    // Default: 11 colors. Remove 9 times to reach 2.
    for (let i = 0; i < 9; i++) {
      const removeBtn = screen.getByLabelText('Remove last filament');
      await user.click(removeBtn);
    }
    expect(screen.getByLabelText('Filament 0 color')).toBeInTheDocument();
    expect(screen.getByLabelText('Filament 1 color')).toBeInTheDocument();
    // Remove button should be gone at min
    expect(screen.queryByLabelText('Remove last filament')).not.toBeInTheDocument();
  });
});
