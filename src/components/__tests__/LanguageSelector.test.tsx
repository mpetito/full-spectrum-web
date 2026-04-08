import { describe, it, expect, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithContext } from '../../__tests__/test-utils';
import { LanguageSelector } from '../LanguageSelector';
import i18n from '../../i18n/i18n';

describe('LanguageSelector', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders a select with 5 language options', () => {
    renderWithContext(<LanguageSelector />);
    const select = screen.getByRole('combobox');
    const options = screen.getAllByRole('option');
    expect(select).toBeInTheDocument();
    expect(options).toHaveLength(5);
  });

  it('has an accessible label', () => {
    renderWithContext(<LanguageSelector />);
    expect(screen.getByLabelText('Language')).toBeInTheDocument();
  });

  it('displays language names in native script', () => {
    renderWithContext(<LanguageSelector />);
    expect(screen.getByText('English')).toBeInTheDocument();
    expect(screen.getByText('Français')).toBeInTheDocument();
    expect(screen.getByText('Español')).toBeInTheDocument();
    expect(screen.getByText('Deutsch')).toBeInTheDocument();
    expect(screen.getByText('中文')).toBeInTheDocument();
  });

  it('changes language on selection', async () => {
    const user = userEvent.setup();
    renderWithContext(<LanguageSelector />);
    const select = screen.getByRole('combobox');
    await user.selectOptions(select, 'fr');
    expect(i18n.language).toBe('fr');
  });
});
