# Plan: Sample Gallery

**Spec**: [specs/006-sample-gallery/spec.md](specs/006-sample-gallery/spec.md) | **Date**: 2025-04-08

## Summary

Add a "Try a sample" experience to Dither3D by shipping companion config JSON files alongside existing sample 3MFs, creating a typed sample registry, and building a `SamplePicker` component that fetches and loads samples into app state. The implementation reuses the existing `loadConfigFromJson()` parser and mirrors the file-upload dispatch flow.

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Sample loader location | `src/lib/samples.ts` | Pure TS in `src/lib/` per module boundaries; no React dependency |
| Fetch helper | Standalone `fetchSample()` async function in `src/lib/samples.ts` | Encapsulates fetch + parse; testable in isolation with `vi.fn()` / MSW |
| Component location | `src/components/SamplePicker.tsx` | Follows existing component pattern |
| State integration | Dispatch same actions as `FileUpload.handleFile` | Zero changes to reducer; sample load is indistinguishable from user upload |
| Config file parsing | Read `filament_colors` from JSON, strip it, pass rest to `loadConfigFromJson()` | Keeps existing parser untouched |

## Implementation Phases

### Phase 1: Sample Config JSON Files

Create the three companion config files in `public/samples/`.

1. [ ] Create `public/samples/3DBenchy-cyclic.config.json` — cyclic [1, 2] palette for unpainted Benchy, 0.08 mm layer height, with appropriate filament colors
2. [ ] Create `public/samples/3DBenchy-2color-gradient.config.json` — gradient palette for the painted 2-color Benchy, with color stops spanning the model height
3. [ ] Create `public/samples/Cylinder-cyclic.config.json` — cyclic [1, 2] palette for the cylinder
4. [ ] Verify all three files pass `loadConfigFromJson()` validation (can be done manually or via a quick unit test)

### Phase 2: Sample Registry & Loader

Create `src/lib/samples.ts` with types, registry, and fetch logic.

1. [ ] Define `SampleDefinition` interface with `id`, `modelPath`, `configPath`, `labelKey`, `descriptionKey`
2. [ ] Define and export `SAMPLES: readonly SampleDefinition[]` array with three entries:
   ```typescript
   { id: 'benchy-cyclic',          modelPath: '/samples/3DBenchy.3mf',        configPath: '/samples/3DBenchy-cyclic.config.json',        labelKey: 'samples.benchyCyclic.label',        descriptionKey: 'samples.benchyCyclic.description' },
   { id: 'benchy-2color-gradient', modelPath: '/samples/3DBenchy-2color.3mf', configPath: '/samples/3DBenchy-2color-gradient.config.json', labelKey: 'samples.benchy2colorGradient.label', descriptionKey: 'samples.benchy2colorGradient.description' },
   { id: 'cylinder-cyclic',        modelPath: '/samples/Cylinder.3mf',        configPath: '/samples/Cylinder-cyclic.config.json',        labelKey: 'samples.cylinderCyclic.label',       descriptionKey: 'samples.cylinderCyclic.description' },
   ```
3. [ ] Define `SampleData` return type:
   ```typescript
   export interface SampleData {
     modelBuffer: ArrayBuffer;
     config: Dither3DConfig;
     filamentColors?: string[];
     filename: string;       // derived from modelPath basename stem
   }
   ```
4. [ ] Implement `fetchSample(sample: SampleDefinition): Promise<SampleData>`:
   - `fetch()` both `modelPath` and `configPath` in parallel (`Promise.all`)
   - Check response `.ok`; throw descriptive error on failure
   - Parse config JSON text; extract optional `filament_colors` array
   - Pass remaining JSON through `loadConfigFromJson()` for validation
   - Return `{ modelBuffer, config, filamentColors, filename }`
5. [ ] Verification: unit test `fetchSample()` with mocked `fetch` — happy path returns expected `SampleData`; 404 throws

### Phase 3: SamplePicker Component

Build the UI component and integrate it into the app layout.

1. [ ] Create `src/components/SamplePicker.tsx`:
   - Import `SAMPLES`, `fetchSample` from `../lib/samples`
   - Import `useAppDispatch`, `useAppState` from `../state/AppContext`
   - Import `read3mf` from `../lib/threemf`
   - Import `FILAMENT_COLORS` from `../constants`
   - Use `useTranslation` for all strings
2. [ ] Render logic:
   - Only visible when `status === 'idle'` and `meshData === null` (no file loaded)
   - Section heading: `t('samples.heading')` (e.g. "Try a sample")
   - Map over `SAMPLES` rendering a clickable card/button for each:
     - Label: `t(sample.labelKey)`
     - Description: `t(sample.descriptionKey)`
     - `data-testid={`sample-${sample.id}`}` for E2E targeting
3. [ ] Click handler (`handleLoadSample`):
   - Set local loading state (which sample is loading)
   - `dispatch({ type: 'UPLOAD_START' })`
   - `const data = await fetchSample(sample)`
   - `const meshData = read3mf(data.modelBuffer, true)`
   - `dispatch({ type: 'UPLOAD_SUCCESS', meshData, rawFileData: data.modelBuffer })`
   - `dispatch({ type: 'SET_INPUT_FILENAME', filename: data.filename })`
   - `dispatch({ type: 'UPDATE_CONFIG', config: data.config })`
   - If `data.filamentColors`: merge with `FILAMENT_COLORS` defaults and `dispatch({ type: 'SET_FILAMENT_COLORS', colors: merged })`
   - On error: `dispatch({ type: 'UPLOAD_ERROR', error: message })` + local error state
4. [ ] Styling: Tailwind, compact cards matching existing sidebar aesthetic. Loading spinner on the clicked card while fetching.
5. [ ] Accessibility: `role="list"` / `role="listitem"`, or use `<ul>/<li>` with `<button>` children. Keyboard nav via standard focus management.
6. [ ] Integrate into `src/components/FileUpload.tsx`:
   - Import `SamplePicker`
   - Render the sample picker/dialog from within `FileUpload`'s idle / no-file-loaded UI
   - Keep the visibility behavior colocated with `FileUpload`, since the picker is hosted there rather than directly in `src/App.tsx`
7. [ ] Verification: component renders in dev server; clicking a sample loads the model and triggers processing

### Phase 4: Internationalisation

Add translation keys for all five languages.

1. [ ] Add `samples` namespace to `src/i18n/locales/en.json`:
   ```json
   "samples": {
     "heading": "Try a sample",
     "loading": "Loading sample…",
     "error": "Failed to load sample",
     "benchyCyclic": {
       "label": "Benchy — Cyclic",
       "description": "Classic Benchy with alternating 2-color layers"
     },
     "benchy2colorGradient": {
       "label": "Benchy — Gradient",
       "description": "Painted 2-color Benchy with smooth gradient blend"
     },
     "cylinderCyclic": {
       "label": "Cylinder — Cyclic",
       "description": "Simple cylinder with alternating color pattern"
     }
   }
   ```
2. [ ] Add equivalent `samples` block to `fr.json`, `es.json`, `de.json`, `zh.json` with translated strings
3. [ ] Verification: switch language in UI and confirm sample labels update

### Phase 5: Tests

1. [ ] Create `src/lib/__tests__/samples.test.ts`:
   - Test `SAMPLES` registry has expected length and valid paths
   - Test `fetchSample()` with mocked `fetch`: happy path, 404 error, network error
   - Test that returned config passes `validateConfig()`
2. [ ] Create `src/components/__tests__/SamplePicker.test.tsx`:
   - Renders sample buttons when idle
   - Does not render when file is loaded
   - Clicking a sample triggers expected dispatches (mock `fetchSample`)
   - Shows loading state while fetching
   - Shows error on fetch failure
3. [ ] Add E2E test case in `e2e/smoke.spec.ts` (or a new `e2e/samples.spec.ts`):
   - Navigate to app
   - Click a sample button (`data-testid="sample-benchy-cyclic"`)
   - Wait for processing to complete (`status: 'ready'`)
   - Assert the 3D preview canvas is visible
   - Assert output stats are displayed
4. [ ] Verification: `npm test` and `npm run test:e2e` pass

## File Changes

| File | Action | Purpose |
|------|--------|---------|
| `public/samples/3DBenchy-cyclic.config.json` | Create | Cyclic config for unpainted Benchy |
| `public/samples/3DBenchy-2color-gradient.config.json` | Create | Gradient config for painted Benchy |
| `public/samples/Cylinder-cyclic.config.json` | Create | Cyclic config for cylinder |
| `src/lib/samples.ts` | Create | Sample registry (`SAMPLES`) + `fetchSample()` loader |
| `src/components/SamplePicker.tsx` | Create | UI component for sample selection |
| `src/App.tsx` | Modify | Import and render `<SamplePicker />` in sidebar |
| `src/i18n/locales/en.json` | Modify | Add `samples.*` translation keys |
| `src/i18n/locales/fr.json` | Modify | Add `samples.*` translation keys |
| `src/i18n/locales/es.json` | Modify | Add `samples.*` translation keys |
| `src/i18n/locales/de.json` | Modify | Add `samples.*` translation keys |
| `src/i18n/locales/zh.json` | Modify | Add `samples.*` translation keys |
| `src/lib/__tests__/samples.test.ts` | Create | Unit tests for registry + fetchSample |
| `src/components/__tests__/SamplePicker.test.tsx` | Create | Component tests |
| `e2e/samples.spec.ts` | Create | E2E test for sample loading flow |

## Testing Strategy

- [ ] Unit tests for `fetchSample()` with mocked `fetch` (happy path, error paths)
- [ ] Unit tests for `SAMPLES` registry validity (paths, keys)
- [ ] Component tests for `SamplePicker` rendering, click handling, state transitions
- [ ] E2E test loading a sample end-to-end and verifying the preview renders
- [ ] Manual verification: load each sample in dev, confirm clean dithering in 3D preview

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Sample 3MF files change or get removed from `public/` | L | Registry references static paths; CI E2E test catches broken references |
| `loadConfigFromJson` rejects sample config due to validation edge case | M | Create configs carefully; unit test validates each config file on disk |
| Fetch fails silently in some browsers (CORS, service worker) | L | Relative paths from same origin; explicit error handling with user feedback |
| Sample configs become stale as config schema evolves | M | Add a CI step or unit test that loads all sample configs through the validator |
