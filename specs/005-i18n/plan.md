# Plan: Internationalization (i18n)

**Spec**: [spec.md](spec.md) | **Date**: 2026-04-05 | **Status**: Ready

---

## Summary

Integrate `react-i18next` with `i18next` and `i18next-browser-languagedetector`
to add multi-language support (EN, FR, ES, DE, ZH). Translation resources are
JSON files bundled inline. Components use `useTranslation()` hook (or
`withTranslation()` HOC for the class-based `ErrorBoundary`). Language detection
follows localStorage → navigator.language → `'en'` fallback chain, all handled
by the detector plugin.

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Library | `react-i18next` + `i18next` | Industry standard, built-in interpolation/pluralization/detection |
| Detector | `i18next-browser-languagedetector` | Proven plugin; localStorage + navigator detection with zero custom code |
| Resource format | JSON files in `src/i18n/locales/` | Standard i18next format; tooling-compatible |
| Loading strategy | Inline via `resources` config | All locales bundled; no backend plugin or async loading |
| Class component | `withTranslation()` HOC | react-i18next's official class component pattern |
| Test strategy | Initialize i18next with `en` resources in test setup | Existing `getByText("English string")` assertions work unchanged |

---

## Phase 1: Install Dependencies & Configure i18next

**Goal**: Install the three npm packages and create the i18next initialization
module with English resources bundled inline.

### Steps

1. [ ] Install runtime dependencies:
   ```bash
   npm install i18next react-i18next i18next-browser-languagedetector
   ```

2. [ ] Create `src/i18n/locales/en.json` — English translations (~62 keys),
   organized by component section:
   ```json
   {
     "app": { "title": "Dither3D", ... },
     "fileUpload": { "dropHint": "Drop a .3mf file here", ... },
     ...
   }
   ```
   Extract every user-facing string from the codebase into this file.

3. [ ] Create `src/i18n/i18n.ts` — i18next initialization:
   - Import `i18next`, `initReactI18next`, `LanguageDetector`
   - Import `en` from `./locales/en.json`
   - Call `i18n.use(LanguageDetector).use(initReactI18next).init({ ... })`:
     - `resources: { en: { translation: en } }` (other locales added in Phase 2)
     - `fallbackLng: 'en'`
     - `supportedLngs: ['en', 'fr', 'es', 'de', 'zh']`
     - `interpolation: { escapeValue: false }`
     - `detection: { order: ['localStorage', 'navigator'], lookupLocalStorage: 'dither3d-locale', caches: ['localStorage'] }`
   - Export the `i18n` instance

4. [ ] Verification: `npx tsc --noEmit` passes; importing `i18n.ts` in a
   scratch test confirms `i18n.t('app.title')` returns `"Dither3D"`.

### Files

| File | Action |
|------|--------|
| `package.json` | Modify (npm install adds deps) |
| `src/i18n/locales/en.json` | Create |
| `src/i18n/i18n.ts` | Create |

---

## Phase 2: Translation Files (FR, ES, DE, ZH)

**Goal**: Create the four non-English JSON locale files and register them in the
i18next resources config.

### Steps

1. [ ] Create `src/i18n/locales/fr.json` — French translations for all keys
2. [ ] Create `src/i18n/locales/es.json` — Spanish translations
3. [ ] Create `src/i18n/locales/de.json` — German translations
4. [ ] Create `src/i18n/locales/zh.json` — Chinese (Simplified) translations
5. [ ] Update `src/i18n/i18n.ts` — import all locale JSONs and add to
   `resources`:
   ```ts
   resources: {
     en: { translation: en },
     fr: { translation: fr },
     es: { translation: es },
     de: { translation: de },
     zh: { translation: zh },
   }
   ```
6. [ ] Verification: `npx tsc --noEmit` passes; switching language in a
   scratch test returns French/Spanish/German/Chinese strings.

### Files

| File | Action |
|------|--------|
| `src/i18n/locales/fr.json` | Create |
| `src/i18n/locales/es.json` | Create |
| `src/i18n/locales/de.json` | Create |
| `src/i18n/locales/zh.json` | Create |
| `src/i18n/i18n.ts` | Modify |

---

## Phase 3: Wire i18n Into App & Test Utils

**Goal**: Import `i18n.ts` in the app entry point and configure the test helper
so all component tests run with i18next initialized to English.

### Steps

1. [ ] In `src/main.tsx`:
   - Add side-effect import at the top: `import './i18n/i18n';`
   - This initializes i18next before `ReactDOM.createRoot()` — no
     `I18nextProvider` wrapper needed (react-i18next auto-binds to the
     global instance)

2. [ ] In `src/__tests__/test-utils.tsx`:
   - Import `src/i18n/i18n` (side-effect) so i18next is initialized in
     tests
   - Optionally force English locale: `i18n.changeLanguage('en')` in a
     `beforeEach` or at module level
   - This ensures existing `screen.getByText("Settings")` assertions work
     because `t('globalSettings.heading')` returns `"Settings"`

3. [ ] Verification:
   - `npm run dev` — app loads, title and strings visible
   - `npx vitest run` — all existing tests pass unchanged
   - `npx tsc --noEmit` passes

### Files

| File | Action |
|------|--------|
| `src/main.tsx` | Modify |
| `src/__tests__/test-utils.tsx` | Modify |

---

## Phase 4: Extract Strings from Components

**Goal**: Replace all hardcoded user-facing strings in 14 components with
`t()` calls from `react-i18next`'s `useTranslation()` hook.

### Steps

For each functional component:
- Add `import { useTranslation } from 'react-i18next';`
- Add `const { t } = useTranslation();` at the top
- Replace each hardcoded string with `t('section.key')` or
  `t('section.key', { param: value })`
- Update `aria-label`, `title` (tooltip), and `placeholder` attributes

For the class component (`ErrorBoundary`):
- Add `import { withTranslation, WithTranslation } from 'react-i18next';`
- Extend props with `WithTranslation`
- Use `this.props.t('key')` in render
- Export default wrapped: `export default withTranslation()(ErrorBoundary)`

Components in order:

1. [ ] `src/App.tsx` (~4 strings)
2. [ ] `src/components/FileUpload.tsx` (~7 strings)
3. [ ] `src/components/FilamentList.tsx` (~2 strings)
4. [ ] `src/components/GlobalSettings.tsx` (~8 strings)
5. [ ] `src/components/PaletteMapper.tsx` (~8 strings)
6. [ ] `src/components/FilamentColorEditor.tsx` (~6 strings)
7. [ ] `src/components/OutputStats.tsx` (~6 strings)
8. [ ] `src/components/DownloadButton.tsx` (~1 string)
9. [ ] `src/components/ProcessingStatus.tsx` (~5 strings) — remove the
   inline `STATUS_TEXT` record; use `t('processingStatus.idle')`, etc.
10. [ ] `src/components/PreviewToggle.tsx` (~2 strings)
11. [ ] `src/components/ConfigImportExport.tsx` (~3 strings)
12. [ ] `src/components/ErrorBoundary.tsx` (~2 strings) — use
    `withTranslation()` HOC
13. [ ] `src/components/GradientEditor.tsx` (~4 strings)
14. [ ] `src/components/CyclicEditor.tsx` (~4 strings)

`MeshViewer.tsx` — no strings, no changes.

### Verification

- App renders with all strings visible in English — no `undefined` or key
  paths showing
- `npx tsc --noEmit` passes
- Grep for remaining hardcoded strings:
  `grep -rn '"[A-Z]' src/components/` should only find non-user-facing
  strings (CSS classes, identifiers, etc.)

### Files

| File | Action |
|------|--------|
| `src/App.tsx` | Modify |
| `src/components/FileUpload.tsx` | Modify |
| `src/components/FilamentList.tsx` | Modify |
| `src/components/GlobalSettings.tsx` | Modify |
| `src/components/PaletteMapper.tsx` | Modify |
| `src/components/FilamentColorEditor.tsx` | Modify |
| `src/components/OutputStats.tsx` | Modify |
| `src/components/DownloadButton.tsx` | Modify |
| `src/components/ProcessingStatus.tsx` | Modify |
| `src/components/PreviewToggle.tsx` | Modify |
| `src/components/ConfigImportExport.tsx` | Modify |
| `src/components/ErrorBoundary.tsx` | Modify |
| `src/components/GradientEditor.tsx` | Modify |
| `src/components/CyclicEditor.tsx` | Modify |

---

## Phase 5: Language Selector UI

**Goal**: Add a compact language dropdown in the app header.

### Steps

1. [ ] Create `src/components/LanguageSelector.tsx`:
   - Import `useTranslation` from `react-i18next`
   - Define a `LANGUAGES` array:
     ```ts
     const LANGUAGES = [
       { code: 'en', name: 'English' },
       { code: 'fr', name: 'Français' },
       { code: 'es', name: 'Español' },
       { code: 'de', name: 'Deutsch' },
       { code: 'zh', name: '中文' },
     ];
     ```
   - Render a `<select>` with current `i18n.language` as value
   - On change: `i18n.changeLanguage(code)` (handles persistence via
     detector plugin)
   - `aria-label={t('common.languageSelector')}`

2. [ ] In `src/App.tsx`: import and render `<LanguageSelector />` in the
   header area near the title

3. [ ] Verification:
   - Selector visible, does not disrupt layout
   - Select "Français" → all strings switch to French
   - Refresh → French persists
   - Keyboard navigable

### Files

| File | Action |
|------|--------|
| `src/components/LanguageSelector.tsx` | Create |
| `src/App.tsx` | Modify |

---

## Phase 6: Update Existing Component Tests

**Goal**: Ensure all 11 existing component test files pass after i18n
integration.

### Steps

1. [ ] Run `npx vitest run` — note any failures
2. [ ] For any failing tests:
   - If a test renders outside `renderWithContext`, ensure i18n is imported
   - If a test uses `ErrorBoundary` directly, ensure it's the
     `withTranslation()`-wrapped export
   - If text assertions fail, verify `en.json` values match original
     hardcoded strings exactly
3. [ ] Verify all 11 test files pass:
   `ConfigImportExport`, `CyclicEditor`, `DownloadButton`, `ErrorBoundary`,
   `FilamentColorEditor`, `FilamentList`, `GlobalSettings`,
   `GradientEditor`, `OutputStats`, `PreviewToggle`, `ProcessingStatus`

### Files

| File | Action |
|------|--------|
| `src/components/__tests__/*.test.tsx` | Modify (as needed) |

---

## Phase 7: New i18n-Specific Tests

**Goal**: Write targeted tests for i18n configuration and JSON key completeness.

### Steps

1. [ ] Create `src/i18n/__tests__/i18n.test.ts`:
   - Test that i18next initializes without errors
   - Test `i18n.t('app.title')` returns `"Dither3D"` in English
   - Test `i18n.t('filamentList.faceCount', { count: 42 })` interpolates
     correctly
   - Test `i18n.changeLanguage('fr')` then `i18n.t('app.title')` returns
     the French value
   - Test missing key returns the key path

2. [ ] Create `src/i18n/__tests__/localeCompleteness.test.ts`:
   - Import all 5 JSON locale files
   - Recursively extract all key paths from `en.json`
   - For each non-English locale, verify every English key exists
   - This is a runtime safety net complementing visual review

3. [ ] Create `src/components/__tests__/LanguageSelector.test.tsx`:
   - Renders with 5 language options
   - Changing selection calls `i18n.changeLanguage`
   - Has accessible label

4. [ ] Verification: `npx vitest run` — full suite passes

### Files

| File | Action |
|------|--------|
| `src/i18n/__tests__/i18n.test.ts` | Create |
| `src/i18n/__tests__/localeCompleteness.test.ts` | Create |
| `src/components/__tests__/LanguageSelector.test.tsx` | Create |

---

## File Changes Summary

| File | Action | Phase |
|------|--------|-------|
| `package.json` | Modify (add 3 deps) | 1 |
| `src/i18n/i18n.ts` | Create → Modify | 1, 2 |
| `src/i18n/locales/en.json` | Create | 1 |
| `src/i18n/locales/fr.json` | Create | 2 |
| `src/i18n/locales/es.json` | Create | 2 |
| `src/i18n/locales/de.json` | Create | 2 |
| `src/i18n/locales/zh.json` | Create | 2 |
| `src/main.tsx` | Modify | 3 |
| `src/__tests__/test-utils.tsx` | Modify | 3 |
| `src/App.tsx` | Modify | 4, 5 |
| `src/components/FileUpload.tsx` | Modify | 4 |
| `src/components/FilamentList.tsx` | Modify | 4 |
| `src/components/GlobalSettings.tsx` | Modify | 4 |
| `src/components/PaletteMapper.tsx` | Modify | 4 |
| `src/components/FilamentColorEditor.tsx` | Modify | 4 |
| `src/components/OutputStats.tsx` | Modify | 4 |
| `src/components/DownloadButton.tsx` | Modify | 4 |
| `src/components/ProcessingStatus.tsx` | Modify | 4 |
| `src/components/PreviewToggle.tsx` | Modify | 4 |
| `src/components/ConfigImportExport.tsx` | Modify | 4 |
| `src/components/ErrorBoundary.tsx` | Modify | 4 |
| `src/components/GradientEditor.tsx` | Modify | 4 |
| `src/components/CyclicEditor.tsx` | Modify | 4 |
| `src/components/LanguageSelector.tsx` | Create | 5 |
| `src/components/__tests__/*.test.tsx` | Modify (as needed) | 6 |
| `src/i18n/__tests__/i18n.test.ts` | Create | 7 |
| `src/i18n/__tests__/localeCompleteness.test.ts` | Create | 7 |
| `src/components/__tests__/LanguageSelector.test.tsx` | Create | 7 |

---

## Testing Strategy

- **i18n in test setup**: Import `src/i18n/i18n.ts` as a side-effect in
  `test-utils.tsx` and force `i18n.changeLanguage('en')`. All existing
  `getByText("English string")` assertions continue to pass.
- **i18n unit tests (Phase 7)**: Cover initialization, `t()` lookup,
  interpolation, language switching, and missing key fallback.
- **JSON completeness tests (Phase 7)**: Recursively compare all non-English
  locale keys against `en.json`. Catches missing translations that visual
  review misses.
- **Component tests (Phase 6)**: All existing tests pass via
  `renderWithContext()` which now includes i18n initialization.
- **Manual verification (Phase 4–5)**: Visual check in browser — switch
  through all 5 languages and verify strings render correctly.
- **String audit (Phase 4)**: Grep for remaining hardcoded strings in
  component files.

---

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| `ErrorBoundary` class component can't use `useTranslation` hook | High | Use `withTranslation()` HOC from react-i18next — its official class component solution |
| English translations don't match original hardcoded strings → test failures | Medium | Copy strings exactly from components into `en.json`. Run tests after each component migration in Phase 4. |
| i18next async initialization causes flash of untranslated content | Low | Use synchronous `init()` with inline `resources` — no backend plugin or `Suspense` needed |
| `i18next-browser-languagedetector` detects unexpected locale in tests | Medium | Force `i18n.changeLanguage('en')` in test setup to override detection |
| Large Phase 4 diff makes review difficult | Medium | Each component's changes are independent and mechanical (string → `t()` call). Can be sub-divided into multiple commits if needed. |
| JSON files lack TypeScript compile-time key checking | Medium | Phase 7 includes a runtime key completeness test. Optionally add `react-i18next` TypeScript resource type declaration for IDE autocomplete. |
| Non-English translations are inaccurate | Low | Best-effort for v1 — technical UI with short strings. Community contributions can refine later. |
