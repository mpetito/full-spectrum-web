import { describe, it, expect } from 'vitest';
import en from '../locales/en.json';
import fr from '../locales/fr.json';
import es from '../locales/es.json';
import de from '../locales/de.json';
import zh from '../locales/zh.json';

function getKeyPaths(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      keys.push(...getKeyPaths(value as Record<string, unknown>, path));
    } else {
      keys.push(path);
    }
  }
  return keys.sort();
}

const enKeys = getKeyPaths(en);

describe('locale completeness', () => {
  it.each([
    ['fr', fr],
    ['es', es],
    ['de', de],
    ['zh', zh],
  ] as const)('%s has all English keys', (locale, translations) => {
    const localeKeys = getKeyPaths(translations as Record<string, unknown>);
    const missing = enKeys.filter((k) => !localeKeys.includes(k));
    expect(missing, `${locale} is missing keys`).toEqual([]);
  });

  it.each([
    ['fr', fr],
    ['es', es],
    ['de', de],
    ['zh', zh],
  ] as const)('%s has no extra keys beyond English', (locale, translations) => {
    const localeKeys = getKeyPaths(translations as Record<string, unknown>);
    const extra = localeKeys.filter((k) => !enKeys.includes(k));
    expect(extra, `${locale} has extra keys`).toEqual([]);
  });
});
