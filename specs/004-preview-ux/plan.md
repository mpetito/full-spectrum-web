# Plan: Preview & UX Enhancements

**Spec**: [spec.md](spec.md) | **Status**: Ready

---

## Phase 1: Extend Filament Encoding

**Goal**: Support filament indices 11–31 in the hex encoding table, matching BambuStudio's `CONST_FILAMENTS`.

### Steps

1. In `src/lib/encoding.ts`, extend `FILAMENT_HEX_TABLE` with entries 11–31:
   ```
   11:'8C', 12:'9C', 13:'AC', 14:'BC', 15:'CC', 16:'DC', 17:'EC',
   18:'0FC', 19:'1FC', 20:'2FC', 21:'3FC', 22:'4FC', 23:'5FC',
   24:'6FC', 25:'7FC', 26:'8FC', 27:'9FC', 28:'AFC', 29:'BFC',
   30:'CFC', 31:'DFC'
   ```
2. `HEX_FILAMENT_TABLE` is auto-generated from `FILAMENT_HEX_TABLE` entries — no separate change needed; verify it populates correctly.
3. Update `MAX_FILAMENTS` from `10` to `31`.
4. Update `filamentToHex()` error message to reflect new valid range (0–31).
5. Add unit tests for encoding/decoding filaments 11–31 (round-trip: `filamentToHex(n)` → `hexToFilament(hex)` === `n`).

### Files Changed

| File | Action | Detail |
|------|--------|--------|
| `src/lib/encoding.ts` | Modify | Extend `FILAMENT_HEX_TABLE` to 11–31, update `MAX_FILAMENTS` to 31, update error message |

### Verification

- Run existing encoding unit tests — all pass.
- Run new tests for filaments 11–31 — round-trip correct.
- `hexToFilament('8C')` === 11, `hexToFilament('DFC')` === 31.

### Acceptance Criteria

- [ ] `FILAMENT_HEX_TABLE` covers indices 0–31
- [ ] `MAX_FILAMENTS` === 31
- [ ] Round-trip encode/decode correct for all 32 filament indices
- [ ] Existing tests pass with no regressions

---

## Phase 2: Dynamic Filament Color UI

**Goal**: Let users add/remove filament colors (2–32 slots) and propagate dynamic count to palette mapper and output stats.

### Steps

1. In `src/components/FilamentColorEditor.tsx`:
   - Add a "+" button at the end of the color grid that appends `#808080` to the filament colors array.
   - Add a "−" button on each swatch to remove that color slot — disabled when `filamentColors.length <= 2`.
   - Cap additions at 32 total colors (`filamentColors.length < 32`).
   - On add/remove, dispatch `SET_FILAMENT_COLORS` with the modified array.
2. In `src/components/PaletteMapper.tsx`:
   - Replace hardcoded `MAX_FILAMENTS` in the filament selector options with `filamentColors.length - 1` (sourced from state).
   - Replace `MAX_FILAMENTS` check in the add-mapping button guard with `filamentColors.length - 1`.
3. In `src/components/OutputStats.tsx`:
   - Replace `FILAMENT_COLORS[fil]` with `filamentColors[fil]` from app state for distribution color swatches.
4. In `src/constants.ts` — no change. `FILAMENT_COLORS` remains the 11-entry default palette.

### Files Changed

| File | Action | Detail |
|------|--------|--------|
| `src/components/FilamentColorEditor.tsx` | Modify | Add +/− buttons, cap at 32, floor at 2 |
| `src/components/PaletteMapper.tsx` | Modify | Use `filamentColors.length - 1` instead of `MAX_FILAMENTS` |
| `src/components/OutputStats.tsx` | Modify | Use `filamentColors[fil]` from state |

### Verification

- Click "+" repeatedly — stops at 32 colors.
- Click "−" on swatches — stops when 2 remain.
- Open palette mapper — filament selector shows options matching current color count.
- Run pipeline — output stats shows correct colors for all used filaments.

### Acceptance Criteria

- [ ] "+" button adds color, disabled at 32
- [ ] "−" button removes color, disabled at 2
- [ ] Palette mapper filament options update dynamically
- [ ] Output stats uses dynamic filament colors from state
- [ ] Adding/removing triggers pipeline re-processing via existing debounce

---

## Phase 3: Double-Click to Reset

**Goal**: Double-clicking any control resets it to its factory default value.

### Steps

1. In `src/components/GlobalSettings.tsx`, add `onDoubleClick` handlers to each control's container/label:
   - Layer height → reset to `defaultConfig(0.1).layerHeightMm` (0.1)
   - Target format → reset to `defaultConfig(0.1).targetFormat`
   - Boundary split → reset to `defaultConfig(0.1).boundarySplit`
   - Max split depth → reset to `defaultConfig(0.1).maxSplitDepth`
   - Each handler calls `update()` → `dispatch(UPDATE_CONFIG)`.
2. In `src/components/FilamentColorEditor.tsx`, add `onDoubleClick` to each swatch container:
   - If `index < FILAMENT_COLORS.length`: reset to `FILAMENT_COLORS[index]`.
   - If `index >= FILAMENT_COLORS.length`: reset to `'#808080'`.
   - Dispatch `SET_FILAMENT_COLORS` with the updated array.
3. Add `title="Double-click to reset"` tooltip on controls for discoverability.

### Files Changed

| File | Action | Detail |
|------|--------|--------|
| `src/components/GlobalSettings.tsx` | Modify | Add `onDoubleClick` reset handlers per control |
| `src/components/FilamentColorEditor.tsx` | Modify | Add `onDoubleClick` reset per swatch |

### Verification

- Double-click layer height slider label → resets to 0.10 mm.
- Double-click a filament swatch that was changed → reverts to original color.
- Double-click an added swatch (index > 10) → reverts to `#808080`.
- Pipeline re-triggers after each reset.

### Acceptance Criteria

- [ ] Double-click resets each GlobalSettings control to its default
- [ ] Double-click resets individual filament swatches
- [ ] Tooltip visible on hover
- [ ] Reset dispatches appropriate action, pipeline re-triggers
- [ ] Double-click on swatch does not conflict with color picker opening

---

## Phase 4: Build Plate Grid

**Goal**: Render a 10mm-spaced grid plane at Z=0 beneath the model for spatial reference.

### Steps

1. Create a `BuildPlateGrid` component (inside `src/components/MeshViewer.tsx` or a separate file imported there).
2. Use Three.js `GridHelper`:
   - Compute grid size from model geometry bounding box: `max(xRange, yRange) × 1.5`, clamped to minimum 100.
   - Divisions: `gridSize / 10` (10mm spacing).
   - Colors: `#888888` major lines, `#444444` minor lines.
3. Place `<BuildPlateGrid>` **inside** the `<group rotation={[-Math.PI / 2, 0, 0]}>` so it shares the model's coordinate transform — grid at Z=0 in model space becomes the floor after rotation.
4. Offset grid position slightly below Z=0 (`position={[0, 0, -0.01]}`) to prevent z-fighting with model base faces.
5. Ensure `invalidate()` is called on grid mount so the demand-driven frame loop renders it.
6. Grid should be subtle and not dominate — consider reducing opacity or using thin line width.

### Files Changed

| File | Action | Detail |
|------|--------|--------|
| `src/components/MeshViewer.tsx` | Modify | Add `BuildPlateGrid` component inside rotation group |

### Verification

- Upload a model → grid visible beneath it.
- Grid lines at 10mm intervals, size covers model footprint.
- Rotate camera — grid stays level, no z-fighting.
- No measurable FPS drop (single draw call).

### Acceptance Criteria

- [ ] Grid visible beneath model after upload
- [ ] 10mm line spacing
- [ ] Grid sized dynamically to model bounding box
- [ ] No z-fighting with model base
- [ ] Grid renders in both input and output preview modes (Phase 5)

---

## Phase 5: Input / Output Preview Toggle

**Goal**: Let users switch between viewing the original per-face filament colors and the processed layer-painted output.

### Steps

1. In `src/state/AppContext.tsx`:
   - Add `previewMode: 'input' | 'output'` to `AppState` (default `'output'`).
   - Add `SET_PREVIEW_MODE` action to reducer.
   - On `UPLOAD_SUCCESS`: set `previewMode` to `'input'` (no output yet).
   - On `PROCESS_SUCCESS`: set `previewMode` to `'output'` (auto-switch to show result).
2. Create `src/components/PreviewToggle.tsx`:
   - Segmented button with "Input" | "Output" labels.
   - "Output" button disabled when `layerColorData` is null.
   - Dispatches `SET_PREVIEW_MODE` on click.
3. In `src/App.tsx`:
   - Place `<PreviewToggle>` as a top-left absolute-positioned overlay on the canvas container.
4. In `src/components/MeshViewer.tsx`, update `MeshGeometry`:
   - When `previewMode === 'input'`: use `<meshStandardMaterial>` with `vertexColors` (existing fallback path).
   - When `previewMode === 'output'`: use `<shaderMaterial>` with `layerColorTex` (existing primary path).
5. In `SceneInvalidator`: watch `previewMode` and call `invalidate()` on change.
6. Camera position and orbit state must be preserved across toggles (no re-mount of Canvas or OrbitControls).

### Files Changed

| File | Action | Detail |
|------|--------|--------|
| `src/state/AppContext.tsx` | Modify | Add `previewMode` state, `SET_PREVIEW_MODE` action, auto-set on upload/process |
| `src/components/PreviewToggle.tsx` | Create | Segmented Input/Output toggle button |
| `src/App.tsx` | Modify | Add `PreviewToggle` overlay on canvas container |
| `src/components/MeshViewer.tsx` | Modify | Branch material on `previewMode`, invalidate on change |

### Verification

- Upload a file → mode is "Input", output button disabled.
- Process completes → auto-switches to "Output".
- Click "Input" → shows per-face filament colors instantly.
- Click "Output" → shows layer-painted colors instantly.
- Camera position preserved across toggles.

### Acceptance Criteria

- [ ] Toggle renders as top-left overlay on canvas
- [ ] "Output" disabled when no processed data exists
- [ ] Auto-switches to "Input" on upload, "Output" on process complete
- [ ] Material swaps instantly, no re-processing
- [ ] Camera and orbit state preserved across switches
- [ ] Build plate grid visible in both modes

---

## File Changes Summary

| File | Action | Phase |
|------|--------|-------|
| `src/lib/encoding.ts` | Modify | 1 |
| `src/components/FilamentColorEditor.tsx` | Modify | 2, 3 |
| `src/components/PaletteMapper.tsx` | Modify | 2 |
| `src/components/OutputStats.tsx` | Modify | 2 |
| `src/components/GlobalSettings.tsx` | Modify | 3 |
| `src/components/MeshViewer.tsx` | Modify | 4, 5 |
| `src/state/AppContext.tsx` | Modify | 5 |
| `src/components/PreviewToggle.tsx` | Create | 5 |
| `src/App.tsx` | Modify | 5 |
| `src/constants.ts` | No change | — |

---

## Testing Strategy

- **Unit tests**: Encoding round-trip for filaments 11–31
- **Unit tests**: Filament add/remove state transitions (array length, bounds enforcement)
- **E2E**: Upload file → verify build plate grid visible in canvas
- **E2E**: Upload file → toggle Input/Output → verify canvas re-renders
- **E2E**: Add filament colors beyond 10 → verify palette mapper options update
- **Manual**: Double-click each control type → confirm value resets and pipeline re-triggers

---

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| GridHelper wrong orientation in rotated group | Medium | GridHelper plane is XZ by default → maps to XY after −π/2 X rotation. Test with known model and verify grid lies flat. |
| Filament index mismatch after remove | Medium | Always re-index palette mappings after remove, or guard against out-of-bounds indices in mapper. |
| Double-click interferes with color picker open | Medium | Attach `onDoubleClick` to label/container element, not to the hidden `<input type="color">`. |
| Hex encoding for 11–31 untested with real slicers | Low | Values copied directly from BambuStudio source; add round-trip unit tests. Validate with slicer in manual testing. |
| Preview toggle re-mounts Canvas losing camera state | Low | Toggle only swaps material inside `MeshGeometry`, Canvas and OrbitControls remain mounted. |
