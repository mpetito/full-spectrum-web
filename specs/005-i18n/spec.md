# Spec: Internationalization (i18n)

**Date**: 2026-04-05 | **Status**: Draft

## Context

All user-facing strings in the Dither3D app are hardcoded inline in JSX across
~14 components (~110–120 unique strings). There is no internationalization
support. One existing pattern exists: `STATUS_TEXT` in `ProcessingStatus.tsx`
maps status keys to display strings — this will be replaced by i18next
namespace lookups.

The app is React 19 + TypeScript + Vite + Tailwind CSS v4. State is managed
via React Context + useReducer in `AppContext.tsx`. No i18n library is
installed and no path aliases are configured in tsconfig.

## Objective

Add multi-language support for English (default), French, Spanish, German, and
Chinese using `react-i18next` — the industry-standard React i18n library. All
UI strings become translatable, language preference persists across sessions,
and the library's built-in interpolation and pluralization handle dynamic
content.

## Scope

**In**: `i18next` + `react-i18next` + `i18next-browser-languagedetector`
setup, JSON translation resources per locale, `useTranslation()` hook in all
components, language selector UI, all user-facing strings extracted.

**Out**: RTL layout support (none of the 5 languages require it),
date/number locale formatting (`Intl` can be added later independently),
server-side rendering, dynamic/lazy language loading (all locales bundled),
community translation workflow, translation management platform integration,
automated string extraction tooling, `<Trans>` component for JSX
interpolation (not needed — all values are plain strings or simple
placeholders).

## Requirements

### 1. i18next Configuration

- Install `i18next`, `react-i18next`, and `i18next-browser-languagedetector`
  as runtime dependencies
- Create `src/i18n/i18n.ts` — the i18next initialization module:
  - Call `i18n.use(LanguageDetector).use(initReactI18next).init({ ... })`
  - `fallbackLng: 'en'`
  - `supportedLngs: ['en', 'fr', 'es', 'de', 'zh']`
  - `interpolation: { escapeValue: false }` (React already escapes)
  - `detection: { order: ['localStorage', 'navigator'], lookupLocalStorage: 'dither3d-locale', caches: ['localStorage'] }`
  - Inline resources via `resources` option (all locales bundled, no
    backend plugin needed)
  - Single namespace `'translation'` (default) — the app is small enough
    that namespace splitting adds no value
- Import `src/i18n/i18n.ts` in `src/main.tsx` before rendering (side-effect
  import ensures i18next is initialized synchronously)

### 2. Translation Resource Files

- Create a `src/i18n/locales/` directory containing:
  - `en.json` — English translations (source of truth)
  - `fr.json` — French translations
  - `es.json` — Spanish translations
  - `de.json` — German translations
  - `zh.json` — Chinese (Simplified) translations
- Keys organized by component/section using i18next nested key convention:
  ```json
  {
    "app": { "title": "Dither3D", "license": "...", ... },
    "fileUpload": { "dropHint": "Drop a .3mf file here", ... },
    "globalSettings": { "heading": "Settings", "layerHeight": "Layer height:", ... },
    ...
    "common": { "languageSelector": "Language", "error": "Error" }
  }
  ```
- Each locale JSON must have identical key structures
- English file is the source of truth; other locales are translations of it

### 3. Interpolation

- Use i18next's built-in `{{placeholder}}` syntax (double curly braces)
- Examples: `"{{count}} faces"`, `"Filament {{index}}"`,
  `"Gradient ({{count}} stops)"`
- The `t()` function accepts interpolation values as the second argument:
  `t('filamentList.faceCount', { count: 42 })` → `"42 faces"`
- i18next handles missing interpolation values gracefully (leaves
  `{{placeholder}}` visible)

### 4. Pluralization

- Use i18next's built-in plural suffix convention where needed:
  `"faceCount_one": "{{count}} face"`, `"faceCount_other": "{{count}} faces"`
- i18next resolves plurals automatically when `count` is passed
- Chinese has no grammatical plural — `_other` suffices as the only form
- For most strings in this app, pluralization is unnecessary (labels, button
  text). Only face/stop/slot counts may benefit.

### 5. React Integration

- `react-i18next` provides:
  - `useTranslation()` hook → `{ t, i18n }` where `t` is the translation
    function and `i18n.changeLanguage(lng)` switches locale
  - `I18nextProvider` — not needed explicitly if `i18n.ts` is imported as a
    side-effect before `ReactDOM.createRoot()` (react-i18next auto-binds
    to the global i18n instance)
- Components call `const { t } = useTranslation()` and use `t('section.key')`
- Language change via `i18n.changeLanguage('fr')` triggers re-render of all
  components using `useTranslation()`
- `ErrorBoundary` is a class component — use `withTranslation()` HOC from
  react-i18next (designed for class components)

### 6. Language Selector UI

- Add a language dropdown/select in the app header area (near the title)
- Display language names in their native script:
  `English`, `Français`, `Español`, `Deutsch`, `中文`
- Changing the selection calls `i18n.changeLanguage(code)` which:
  - Updates all subscribed components immediately
  - Persists to localStorage via the language detector plugin
- Compact design — does not disrupt the existing layout
- Accessible: proper `<label>` or `aria-label`, keyboard navigable

### 7. String Extraction & Replacement

- Replace all hardcoded strings in the 14 components with `t('key')` calls
- Migrate the existing `STATUS_TEXT` record in `ProcessingStatus.tsx` to use
  translation keys: `t('processingStatus.idle')`, etc.
- `aria-label` attributes must also use `t()` translated strings
- Tooltip text must also use `t()` translated strings
- Numeric suffixes (e.g., "mm", "%") included in translation strings where
  they appear alongside labels

### 8. Language Detection & Persistence

- Handled by `i18next-browser-languagedetector` plugin:
  - Detection order: `['localStorage', 'navigator']`
  - localStorage key: `'dither3d-locale'`
  - Caches: `['localStorage']` (writes on every language change)
- On fresh load: reads localStorage → falls back to `navigator.language`
  prefix match → falls back to `'en'`
- Graceful handling of invalid/corrupted values (falls back to `'en'`)

## Non-Functional Requirements

- **Bundle size**: `i18next` (~40 KB min) + `react-i18next` (~12 KB min) +
  `i18next-browser-languagedetector` (~5 KB min). Acceptable for the
  functionality gained (interpolation, pluralization, detection, React
  bindings). Translation JSONs add ~2–5 KB per locale.
- **No flash of untranslated content**: i18next is initialized synchronously
  via side-effect import before React renders. No `Suspense` fallback needed
  since all resources are bundled inline.
- **Type safety**: Use `react-i18next`'s TypeScript integration — declare the
  default namespace and resource type so `t()` keys are autocompleted and
  type-checked. Alternatively, rely on JSON key completeness tests.
- **Performance**: i18next caches resolved translations. The `useTranslation`
  hook is optimized to only re-render when the language changes.

## Design Constraints

- Translations are JSON files following i18next's standard nested key format
- English JSON is the structural source of truth
- No build-time extraction step — keys are manually managed
- All locales are bundled inline via the `resources` config option (no
  `i18next-http-backend` needed)
- Use the default `'translation'` namespace — no namespace splitting

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| i18n library | `react-i18next` + `i18next` | Industry standard, robust interpolation/pluralization, well-maintained, familiar to contributors |
| Language detector | `i18next-browser-languagedetector` | Built-in localStorage + navigator detection with configurable priority |
| Key structure | Nested by component section | Matches component boundaries, standard i18next convention |
| Interpolation syntax | `{{placeholder}}` (i18next default) | Built-in, well-documented, supports pluralization automatically |
| Pluralization | i18next `_one` / `_other` suffix convention | Handles EN/FR/ES/DE rules automatically; ZH needs only `_other` |
| Locale storage | localStorage `'dither3d-locale'` | Configured via detector plugin — zero custom code |
| Locale files format | JSON | Standard i18next format; tooling ecosystem (extraction, editors) compatible |
| Selector placement | App header near title | Always visible, non-intrusive, consistent with common web app patterns |
| RTL support | Out of scope | None of the 5 supported languages require RTL |
| Dynamic loading | Not used — all locales bundled via `resources` | Total payload is small; avoids `i18next-http-backend` complexity |
| ErrorBoundary class component | `withTranslation()` HOC | react-i18next's official class component solution |

## String Inventory

| Component | Approximate Count | Examples |
|-----------|-------------------|----------|
| App.tsx | 4 | Title, license text, link labels |
| FileUpload.tsx | 7 | Drop hint, browse button, loading status, aria-labels |
| FilamentList.tsx | 2 | Heading, count suffix |
| GlobalSettings.tsx | 8 | Heading, field labels, tooltips, select options |
| PaletteMapper.tsx | 8 | Heading, labels, button text, type options |
| FilamentColorEditor.tsx | 6 | Heading, tooltips, aria-labels, button labels |
| OutputStats.tsx | 6 | Heading, stat labels, distribution heading |
| DownloadButton.tsx | 1 | Button text |
| ProcessingStatus.tsx | 5 | Status texts (idle, loading, processing, ready, error) |
| PreviewToggle.tsx | 2 | Input/output button labels |
| ConfigImportExport.tsx | 3 | Import/export buttons, error message |
| ErrorBoundary.tsx | 2 | Heading, reset button |
| GradientEditor.tsx | 4 | Labels, button text |
| CyclicEditor.tsx | 4 | Labels, button text |
| MeshViewer.tsx | 0 | No user-facing strings |
| **Total** | **~62 keys** | (some strings share common keys) |

## Testing Strategy

- Mock i18next in tests using `react-i18next`'s jest/vitest mock pattern
  (mock the module to return keys or English values)
- Alternatively, initialize i18next with English resources in the test setup
  so `t('app.title')` returns `"Dither3D"` — existing `getByText` assertions
  continue to work
- Component tests use `renderWithContext()` which initializes i18n with
  English locale
- JSON key completeness tests: for each non-English locale, recursively
  compare keys against `en.json` to catch missing translations
- Type-check CI step validates TypeScript compilation

## Resolved Questions

- **Why `react-i18next` over a custom dictionary?** It is the most widely
  adopted React i18n solution. It provides interpolation, pluralization,
  language detection, React bindings, and TypeScript support out of the box.
  The learning curve is worth it for maintainability and contributor
  familiarity.
- **Why not `react-intl` (FormatJS)?** `react-i18next` has a simpler API,
  broader adoption in the React ecosystem, and doesn't require ICU message
  syntax which is overkill for this app.
- **Why bundle all locales?** 5 locales × ~62 keys ≈ 10–20 KB uncompressed,
  negligible after gzip. Using `i18next-http-backend` for lazy loading adds
  async complexity for minimal savings.
- **How to handle missing keys at runtime?** i18next returns the key path
  itself as the default fallback, making missing translations visible during
  development without crashing. This is configurable via `fallbackLng` and
  `parseMissingKeyHandler`.
- **How does `ErrorBoundary` (class component) access translations?**
  `react-i18next` provides the `withTranslation()` HOC specifically for
  class components.

## Acceptance Criteria

- [ ] `i18next`, `react-i18next`, and `i18next-browser-languagedetector` installed
- [ ] `src/i18n/i18n.ts` initializes i18next with all 5 locales bundled
- [ ] `src/i18n/locales/en.json` contains all ~62 translation keys organized by component
- [ ] All 4 non-English locale JSONs have the same key structure as English
- [ ] `useTranslation()` hook works in all functional components
- [ ] `withTranslation()` HOC works for `ErrorBoundary` class component
- [ ] `t('key')` returns the translated string for the current locale
- [ ] `t('key', { count: 5 })` interpolates `{{count}}` → `"5"` in the result
- [ ] Missing key returns the key path string as fallback
- [ ] Language selector dropdown visible in the app header
- [ ] Selecting a language immediately updates all visible UI strings
- [ ] Language preference persists in localStorage under `'dither3d-locale'`
- [ ] On fresh load, locale is detected from localStorage → navigator.language → `'en'`
- [ ] No hardcoded user-facing strings remain in any component JSX
- [ ] `aria-label` and tooltip strings use `t()` translated values
- [ ] `npx tsc --noEmit` passes
- [ ] All existing tests pass (updated to work with i18n setup)
- [ ] New tests cover i18n configuration, locale detection, and JSON key completeness
