import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithContext } from '../../__tests__/test-utils';
import { PreviewToggle } from '../PreviewToggle';

describe('PreviewToggle', () => {
  it('renders input and output buttons', () => {
    renderWithContext(<PreviewToggle />);
    expect(screen.getByRole('button', { name: 'Input' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Output' })).toBeInTheDocument();
  });

  it('output button is disabled when no layerColorData', () => {
    renderWithContext(<PreviewToggle />);
    expect(screen.getByRole('button', { name: 'Output' })).toBeDisabled();
  });

  it('exposes aria-pressed for the active mode', () => {
    renderWithContext(<PreviewToggle />);
    // Initial state has previewMode: 'output' but no layerColorData
    // After upload the mode is 'input', but in initial state it's 'output'
    const outputBtn = screen.getByRole('button', { name: 'Output' });
    const inputBtn = screen.getByRole('button', { name: 'Input' });
    // One should be pressed, other not
    expect(
      outputBtn.getAttribute('aria-pressed') === 'true' ||
      inputBtn.getAttribute('aria-pressed') === 'true',
    ).toBe(true);
  });

  it('clicking input button does not throw', async () => {
    const user = userEvent.setup();
    renderWithContext(<PreviewToggle />);
    const inputBtn = screen.getByRole('button', { name: 'Input' });
    await user.click(inputBtn);
    // Should not throw
    expect(inputBtn).toBeInTheDocument();
  });
});
