import { describe, it, expect, beforeEach } from 'vitest';
import i18n from '../i18n';

describe('i18n', () => {
  beforeEach(async () => {
    localStorage.removeItem('dither3d-locale');
    await i18n.changeLanguage('en');
  });

  it('initializes without errors', () => {
    expect(i18n.isInitialized).toBe(true);
  });

  it('defaults to English', () => {
    expect(i18n.t('app.title')).toBe('Dither3D');
  });

  it('interpolates values', () => {
    expect(i18n.t('filamentList.faceCount', { count: 42 })).toBe('42 faces');
  });

  it('switches to French', async () => {
    await i18n.changeLanguage('fr');
    expect(i18n.t('globalSettings.heading')).toBe('Paramètres');
  });

  it('switches to Spanish', async () => {
    await i18n.changeLanguage('es');
    expect(i18n.t('globalSettings.heading')).toBe('Ajustes');
  });

  it('switches to German', async () => {
    await i18n.changeLanguage('de');
    expect(i18n.t('globalSettings.heading')).toBe('Einstellungen');
  });

  it('switches to Chinese', async () => {
    await i18n.changeLanguage('zh');
    expect(i18n.t('globalSettings.heading')).toBe('设置');
  });

  it('returns key path for missing keys', () => {
    expect(i18n.t('nonexistent.key')).toBe('nonexistent.key');
  });

  it('falls back to English for unsupported locale', async () => {
    await i18n.changeLanguage('ja');
    expect(i18n.t('app.title')).toBe('Dither3D');
  });
});
