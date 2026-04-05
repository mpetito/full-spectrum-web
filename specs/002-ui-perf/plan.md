# Plan: UI Layout & Performance Improvements

**Spec**: [spec.md](spec.md) | **Status**: Ready

---

## Phase 1: On-Demand Rendering

**Goal**: Eliminate idle GPU load by switching to demand-driven rendering.

### Steps

1. In `src/components/MeshViewer.tsx`, add `frameloop="demand"` prop to `<Canvas>`.
2. Create a small inner component (e.g. `SceneInvalidator`) that calls `useThree()` to get `invalidate`.
3. In `SceneInvalidator`, add `useEffect` watching `meshData` and `layerColorData` — call `invalidate()` when either changes.
4. On the drei `<OrbitControls>` component, add `onChange={() => invalidate()}` (get `invalidate` from `useThree` in the parent inner component and pass down, or use a shared context/ref).
5. When filament colors change (Phase 2 state), also call `invalidate()` — stub a `useEffect` watching a placeholder prop for now.
6. Remove any unnecessary `useFrame` callbacks that don't do continuous animation.

### Files Changed

| File | Action | Detail |
|------|--------|--------|
| `src/components/MeshViewer.tsx` | Modify | `frameloop="demand"`, `SceneInvalidator` component, OrbitControls `onChange` |

### Verification

- Open app, load a model, stop interacting. Confirm GPU usage drops to near zero (task manager / browser perf monitor).
- Rotate model — renders update. Load new model — renders update. Stop — GPU idles.

### Acceptance Criteria

- [ ] `frameloop="demand"` present on Canvas
- [ ] GPU idles when scene is static (fan test)
- [ ] Camera interaction, model load, and color changes all trigger re-render

---

## Phase 2: State Extensions

**Goal**: Add `inputFilename`, `filamentColors`, and `progress` to app state. Wire `ProgressCallback`.

### Steps

1. In `src/constants.ts`, export `FILAMENT_COLORS` as `DEFAULT_FILAMENT_COLORS` (or add a named re-export) so it can be used as the initializer.
2. In `src/state/AppContext.tsx`:
   - Add to `AppState`:
     ```ts
     inputFilename: string | null;
     filamentColors: string[];
     progress: { stage: string; done: number; total: number } | null;
     ```
   - Initialize: `inputFilename: null`, `filamentColors: [...DEFAULT_FILAMENT_COLORS]`, `progress: null`.
   - Add action types: `SET_INPUT_FILENAME`, `SET_FILAMENT_COLORS`, `SET_PROGRESS`.
   - Add reducer cases:
     - `SET_INPUT_FILENAME`: `{ ...state, inputFilename: action.payload }`
     - `SET_FILAMENT_COLORS`: `{ ...state, filamentColors: action.payload }`
     - `SET_PROGRESS`: `{ ...state, progress: action.payload }`
   - In `PROCESS_SUCCESS` case, also set `progress: null`.
   - In `PROCESS_ERROR` case, also set `progress: null`.
   - In `PROCESS_START` case, set `progress: { stage: 'Initializing', done: 0, total: 0 }`.
3. In `src/hooks/useProcessing.ts`:
   - Create a `progressCallback` that dispatches `SET_PROGRESS` with `{ stage, done, total }`.
   - Pass `progressCallback` into the `processAsync()` call via `ProcessOptions`.
4. In `src/components/FileUpload.tsx` (or wherever `UPLOAD_SUCCESS` is dispatched):
   - After successful upload, dispatch `SET_INPUT_FILENAME` with the uploaded file's name (stem without extension).

### Files Changed

| File | Action | Detail |
|------|--------|--------|
| `src/constants.ts` | Modify | Named export for default filament colors |
| `src/state/AppContext.tsx` | Modify | Add `inputFilename`, `filamentColors`, `progress` + 3 new actions |
| `src/hooks/useProcessing.ts` | Modify | Wire `ProgressCallback` → `SET_PROGRESS` dispatch |
| `src/components/FileUpload.tsx` | Modify | Dispatch `SET_INPUT_FILENAME` on upload |

### Verification

- Upload a file → `inputFilename` populated in state.
- Trigger processing → progress state updates through stages, clears on completion.
- React DevTools: confirm state shape.

### Acceptance Criteria

- [ ] `inputFilename` set on upload, cleared on RESET
- [ ] `filamentColors` initialized from constants
- [ ] `progress` updates during processing, null when idle
- [ ] No regressions in existing upload/processing flow

---

## Phase 3: Layout Restructure

**Goal**: Slicer-like panel layout with fixed status bar and output panel.

### Steps

1. In `src/App.tsx`, replace the current `flex h-screen` layout with a CSS Grid:
   ```
   grid-template-columns: 320px 1fr
   grid-template-rows: auto 1fr auto
   ```
   - Left column spans all rows: scrollable config sidebar.
   - Top-right: output details panel (OutputStats + DownloadButton + filename).
   - Center: Canvas (fills remaining space).
   - Bottom-right: ProcessingStatus bar.
2. Left sidebar contents (unchanged order):
   - FileUpload
   - GlobalSettings
   - PaletteMapper
   - ConfigImportExport
   - FilamentColorEditor (placeholder div until Phase 4)
3. Move `OutputStats` and `DownloadButton` into the top-right panel. Show derived filename: `{inputFilename}_full-spectrum.3mf` (or placeholder if no input).
4. Update `src/components/ProcessingStatus.tsx`:
   - Accept `progress` prop (from state).
   - Render a progress bar: outer `div` with bg, inner `div` with `width` as percentage (`done/total * 100`). Use Tailwind `transition-all duration-300` for smooth animation.
   - Show stage name + percentage text.
   - When `progress` is null and status is not `processing`, show the existing status dot.
5. Update `src/components/DownloadButton.tsx`:
   - Accept `inputFilename` prop.
   - Derive download filename: `inputFilename ? \`${inputFilename}_full-spectrum.3mf\` : 'full-spectrum-output.3mf'`.
   - Use derived filename in the blob download anchor.
6. Ensure the layout is responsive:
   - At `< 1024px`, consider stacking (sidebar above canvas) or collapsing sidebar. Minimum: don't break.

### Files Changed

| File | Action | Detail |
|------|--------|--------|
| `src/App.tsx` | Modify | CSS Grid layout, panel arrangement |
| `src/components/ProcessingStatus.tsx` | Modify | Progress bar with stage/percentage |
| `src/components/DownloadButton.tsx` | Modify | Derived filename from `inputFilename` |
| `src/components/OutputStats.tsx` | Modify | Adapt for top-right panel placement (may need wrapper/style tweaks) |

### Verification

- Layout matches slicer-like design: sidebar left, canvas center, output top-right, status bottom-right.
- Progress bar animates during processing.
- Download filename matches `{input}_full-spectrum.3mf`.
- Status bar always visible (never scrolls away).

### Acceptance Criteria

- [ ] CSS Grid layout with fixed sidebar, output panel, canvas, and status bar
- [ ] Progress bar visible during processing with stage name and percentage
- [ ] Output filename derived from input filename
- [ ] Processing status never scrolls off screen
- [ ] Layout doesn't break at 1024px viewport width

---

## Phase 4: Filament Color Editing

**Goal**: Let users edit filament colors with live preview in the 3D viewer.

### Steps

1. Create `src/components/FilamentColorEditor.tsx`:
   - Read `filamentColors` from app state/context.
   - Render a grid of color swatches for slots 1–10 (skip index 0 or show as non-editable default).
   - Each swatch: a small colored `div` wrapping an `<input type="color">` (hidden or overlaid).
   - On change, dispatch `SET_FILAMENT_COLORS` with the updated array (copy, mutate index, dispatch).
   - Label each swatch with its slot number.
2. In `src/App.tsx`, add `<FilamentColorEditor />` to the left sidebar (below PaletteMapper or after ConfigImportExport).
3. In `src/components/MeshViewer.tsx`:
   - Accept `filamentColors` as a prop.
   - When `filamentColors` changes, rebuild the 1D DataTexture used by the custom ShaderMaterial with the new colors.
   - The `SceneInvalidator` from Phase 1 should watch `filamentColors` and call `invalidate()`.
4. Pass `filamentColors` from state through to MeshViewer in `App.tsx`.

### Files Changed

| File | Action | Detail |
|------|--------|--------|
| `src/components/FilamentColorEditor.tsx` | Create | Color picker grid for 11 filament slots |
| `src/App.tsx` | Modify | Add FilamentColorEditor to sidebar, pass filamentColors to MeshViewer |
| `src/components/MeshViewer.tsx` | Modify | Accept filamentColors prop, rebuild DataTexture, invalidate on change |

### Verification

- Change a filament color → 3D preview updates immediately.
- Colors persist in state across processing runs.
- All 10 editable slots work.

### Acceptance Criteria

- [ ] Color swatches rendered for filament slots
- [ ] Color picker opens on swatch interaction
- [ ] Changed colors reflected in 3D preview immediately
- [ ] filamentColors state persists across re-processing

---

## Phase 5: 3MF Metadata Extensions

**Goal**: Embed filament colors and layer height in slicer-compatible XML. Embed palette config in custom JSON. Parse both on re-open.

### Steps

1. In `src/lib/threemf.ts`, extend `write3mf` signature with an optional `metadata` param:
   ```ts
   export function write3mf(
     vertices: Float64Array, faces: Uint32Array, vertexCount: number,
     faceCount: number, faceColors: string[],
     defaultFilament: number, targetFormat: string,
     metadata?: {
       config?: FullSpectrumConfig;
       filamentColors?: string[];
       layerHeight?: number;
     }
   ): Uint8Array
   ```
2. In `write3mf`, update `Metadata/Slic3r_PE_model.config` XML generation:
   - Add filament color entries for each slot (e.g., `<filament ... display_color="#E74C3C" />`).
   - Add `layer_height` and `initial_layer_height` (computed as `2 × layerHeight`) to the config XML.
   - These go in slicer-compatible format so BambuStudio/PrusaSlicer can read them natively.
3. If `metadata.config` is provided, JSON-serialize the **palette config only** (cyclic/gradient mappings, color_mappings array) and add `Metadata/full-spectrum.config.json` to the ZIP.
   - This file does NOT contain filament colors or layer height (those are in slicer XML).
4. Extend the return type of `read3mf`:
   ```ts
   interface ThreeMFData {
     // ... existing fields ...
     filamentColors?: string[];        // from slicer XML
     layerHeight?: number;             // from slicer XML
     initialLayerHeight?: number;      // from slicer XML
     fullSpectrumConfig?: FullSpectrumConfig;  // from custom JSON (palette only)
   }
   ```
5. In `read3mf`, after parsing the model XML:
   - Parse filament colors and layer height from `Slic3r_PE_model.config` (or `model_settings.config`).
   - Check ZIP entries for `Metadata/full-spectrum.config.json`. If found, parse JSON and populate `fullSpectrumConfig`.
6. In `src/lib/pipeline.ts`:
   - Pass metadata (config, filamentColors, layerHeight) through to `write3mf` via `ProcessOptions`.
7. In `src/hooks/useProcessing.ts`:
   - Pass `config`, `filamentColors`, and `layer_height_mm` from state into `processAsync` options.
8. In `src/components/FileUpload.tsx` (or `App.tsx` upload handler):
   - After `read3mf`, if `fullSpectrumConfig` exists, dispatch `UPDATE_CONFIG`.
   - If `filamentColors` exists, dispatch `SET_FILAMENT_COLORS`.
   - This completes the round-trip: open output → palette config + colors pre-filled.

### Files Changed

| File | Action | Detail |
|------|--------|--------|
| `src/lib/threemf.ts` | Modify | Filament colors + layer height in slicer XML; palette config in custom JSON; parse both on read |
| `src/lib/pipeline.ts` | Modify | Pass metadata through to write3mf |
| `src/hooks/useProcessing.ts` | Modify | Include config/colors in processAsync options |
| `src/components/FileUpload.tsx` | Modify | Dispatch config/colors on re-open |
| `src/state/AppContext.tsx` | Modify | Possibly no change if actions already exist from Phase 2 |

### Verification

- Process a file → open output 3MF in ZIP viewer → `Metadata/full-spectrum.config.json` present with correct contents.
- Re-upload that output 3MF → config controls pre-filled, filament colors restored.
- Existing 3MF files without metadata still load correctly (no regression).

### Acceptance Criteria

- [ ] Output 3MF `Slic3r_PE_model.config` contains filament colors and layer height
- [ ] Output 3MF contains `Metadata/full-spectrum.config.json` with palette config only
- [ ] `initial_layer_height` in XML is always 2× `layer_height` (derived, not stored separately)
- [ ] Re-opening output 3MF pre-fills palette config and filament colors
- [ ] Plain 3MF files (no metadata) still load without error
- [ ] No breaking changes to existing write3mf/read3mf call sites

---

## Phase 6: Testing & Verification

**Goal**: Comprehensive test coverage for new functionality.

### Steps

1. Create `src/__tests__/threemf-metadata.test.ts`:
   - **write3mf with metadata**: Call write3mf with metadata param, unzip result:
     - Assert `Slic3r_PE_model.config` contains filament color entries and layer height values.
     - Assert `initial_layer_height` equals 2× `layer_height`.
     - Assert `Metadata/full-spectrum.config.json` exists and contains palette config (no filament colors).
   - **write3mf without metadata**: Call write3mf without metadata, assert ZIP has exactly 4 entries (no custom JSON).
   - **read3mf with metadata**: Create a 3MF ZIP with slicer XML (filament colors, layer height) + custom JSON (palette config), call read3mf, assert all fields populated.
   - **read3mf without metadata**: Call read3mf on a plain 3MF, assert optional fields are undefined.
   - **Round-trip**: write3mf with metadata → read3mf → assert palette config + filament colors match input.
2. Create `src/__tests__/state-extensions.test.ts` (or add to existing state tests):
   - Test `SET_INPUT_FILENAME` action.
   - Test `SET_FILAMENT_COLORS` action.
   - Test `SET_PROGRESS` action.
   - Test that `PROCESS_SUCCESS` clears progress.
   - Test that `PROCESS_ERROR` clears progress.
   - Test that `PROCESS_START` sets initial progress.
   - Test that `RESET` clears inputFilename.
3. Create `src/__tests__/progress-callback.test.ts` (or add to processing tests):
   - Mock `processAsync`, verify progressCallback is passed.
   - Verify callback dispatches `SET_PROGRESS` with correct shape.
4. Run all existing tests — ensure zero regressions.
5. Manual verification:
   - GPU idle test (Phase 1).
   - Layout at 1024px, 1280px, 1920px (Phase 3).
   - Filament color editing with preview update (Phase 4).
   - Round-trip: process → download → re-upload → config restored (Phase 5).

### Files Changed

| File | Action | Detail |
|------|--------|--------|
| `src/__tests__/threemf-metadata.test.ts` | Create | write/read/round-trip metadata tests |
| `src/__tests__/state-extensions.test.ts` | Create | Reducer action tests for new state |
| `src/__tests__/progress-callback.test.ts` | Create | ProgressCallback wiring tests |

### Verification

- `npm test` passes with all new and existing tests green.
- Coverage for metadata round-trip, state actions, and progress wiring.

### Acceptance Criteria

- [ ] Metadata write test passes
- [ ] Metadata read test passes
- [ ] Round-trip test passes
- [ ] State action tests pass for all 3 new actions
- [ ] Progress callback wiring test passes
- [ ] All pre-existing tests still pass

---

## File Changes Summary

| File | Phases | Action |
|------|--------|--------|
| `src/components/MeshViewer.tsx` | 1, 4 | Modify |
| `src/constants.ts` | 2 | Modify |
| `src/state/AppContext.tsx` | 2 | Modify |
| `src/hooks/useProcessing.ts` | 2, 5 | Modify |
| `src/components/FileUpload.tsx` | 2, 5 | Modify |
| `src/App.tsx` | 3, 4 | Modify |
| `src/components/ProcessingStatus.tsx` | 3 | Modify |
| `src/components/DownloadButton.tsx` | 3 | Modify |
| `src/components/OutputStats.tsx` | 3 | Modify |
| `src/components/FilamentColorEditor.tsx` | 4 | Create |
| `src/lib/threemf.ts` | 5 | Modify |
| `src/lib/pipeline.ts` | 5 | Modify |
| `src/__tests__/threemf-metadata.test.ts` | 6 | Create |
| `src/__tests__/state-extensions.test.ts` | 6 | Create |
| `src/__tests__/progress-callback.test.ts` | 6 | Create |

## Dependency Order

```
Phase 1 (standalone)
  ↓
Phase 2 (standalone, but provides state for Phase 3+)
  ↓
Phase 3 (depends on Phase 2 for progress/inputFilename)
  ↓
Phase 4 (depends on Phase 2 for filamentColors state, Phase 1 for invalidate)
  ↓
Phase 5 (depends on Phase 2 state, Phase 4 for filament colors in metadata)
  ↓
Phase 6 (depends on all prior phases)
```

Phases 1 and 2 can be executed in parallel. Phases 3 and 4 can be partially parallelized (Phase 3 layout doesn't depend on Phase 4 component, but Phase 4's sidebar placement depends on Phase 3's grid).

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| On-demand rendering misses updates | Medium | Comprehensive `invalidate()` on all state changes; fallback to `frameloop="always"` if issues found |
| Slicer ignores custom metadata file | Low | Custom file in `Metadata/` folder is safe per 3MF spec; slicers skip unknown files |
| Progress bar too coarse (few stages) | Low | Each stage reports `done/total` within the stage; sufficient for user feedback |
| DataTexture rebuild on color change causes flicker | Low | Rebuild texture data in-place if possible; otherwise single-frame delay is acceptable |
| CSS Grid breaks on narrow viewports | Low | Test at 1024px minimum; use `min-width` guards |
