# Spec: UI Controls Improvements

**Date**: 2025-04-12 | **Status**: Draft

## Context

Several UI control issues degrade the Dither3D editing experience: incorrect defaults, broken color propagation, overly strict input validation, a missing auto-apply toggle, and a Bresenham preview that doesn't reflect actual dithering output. These paper-cut issues compound into a frustrating workflow.

## Objective

Fix seven distinct UI issues to make the editing workflow intuitive and responsive: correct defaults, accurate previews, forgiving inputs, live color propagation, and a manual-apply option.

## Scope

### In Scope

1. **Layer height default & 3MF output** — default to 0.10 mm; ensure the output 3MF contains correct `layer_height` and `initial_layer_height` plate overrides that slicers recognise
2. **Bresenham color preview bar** — replace the smooth CSS gradient with a discrete layer-accurate preview using `buildBresenhamLayerMap`
3. **Forgiving text inputs** — allow intermediate invalid values; highlight with a red border until corrected
4. **Stop color selector** — use runtime `filamentColors` (not hardcoded `FILAMENT_COLORS`); show color swatches in the dropdown options
5. **Transition `maxCycleLength` default** — change from 2 to 1
6. **Auto-apply toggle** — add a toggle to switch between debounced auto-apply (current behaviour) and manual apply with an explicit button
7. **Input preview shows original coloring** — when toggled to "Input", display the original per-face paint colors from the input 3MF (currently working, but verify colour accuracy against `filamentColors` state)

### Out of Scope

- Separate `initialLayerHeight` UI field (currently hardcoded to `layerHeight × 2`, adequate for most users)
- Rearchitecting the preview shader
- New palette types

## Requirements

### Functional

#### F1 — Layer Height Default & 3MF Output
- Default `layerHeightMm` remains 0.10 mm (already the case)
- When a 3MF is uploaded with a `layer_height` override, adopt it into the config
- Output 3MF must contain `<plate>` metadata with `layer_height` and `initial_layer_height` values that are picked up by OrcaSlicer/BambuStudio/PrusaSlicer
- `initial_layer_height` defaults to `layerHeight × 2` (matching common slicer convention)

#### F2 — Bresenham Preview Bar
- The preview bar in `BresenhamEditor` must use `buildBresenhamLayerMap` (same algorithm as the actual output) to generate discrete colour bands, just like `TransitionEditor.buildPreviewCSS` already does
- Preview should use ~100 layers for a quick approximation
- Filament colours must come from runtime `filamentColors`, not the hardcoded `FILAMENT_COLORS` constant

#### F3 — Forgiving Text Inputs  
- Numeric inputs (stop `t` values, transition width, max cycle length) must allow intermediate values that are temporarily invalid
- Invalid values are highlighted with a red border (Tailwind `border-red-500`)
- The config is only dispatched when the value is valid; the stale valid value remains in effect while the user types
- Clearing the field and retyping is a common pattern that must not reset to a fallback like `0`

#### F4 — Stop Color Selector
- Stop filament `<select>` in `BresenhamEditor`, `TransitionEditor`, and `CyclicEditor` must use `filamentColors` from props/context, not the hardcoded `FILAMENT_COLORS` constant
- Each `<option>` should render a coloured indicator (via `background` styling or a swatch element) showing the filament colour alongside the number
- Changing filament colours in `FilamentColorEditor` must immediately update the stop selectors (reactive to `filamentColors` state)

#### F5 — Transition `maxCycleLength` Default
- `PaletteMapper.defaultPalette('transition')` must set `maxCycleLength: 1` (changed from 2)

#### F6 — Auto-Apply Toggle
- A toggle switch labelled "Auto Apply" in `GlobalSettings`
- When **on** (default): current debounced behaviour — config changes trigger processing after 300 ms
- When **off**: config changes do NOT trigger processing; an "Apply" button appears that triggers a single processing run
- The toggle state lives in `AppState` (not persisted across sessions)
- The "Apply" button should be prominent and disabled while processing

#### F7 — Input Preview Original Coloring
- When the preview is set to "Input", the viewer must display the original per-face paint colours from the 3MF
- Colours must be resolved through the current `filamentColors` state so that user colour edits are reflected
- If the 3MF has no paint data, fall back to the default filament colour

### Non-Functional

- No perceptible jank — preview bar recalculation must be < 16 ms for 100 layers
- Existing tests must not break
- New UI strings must be added to all locale files (`en`, `de`, `fr`, `es`, `zh`)

## Design Constraints

- `src/lib/` must remain portable — no React imports
- Use Tailwind CSS v4 design tokens; no hard-coded colour values except via `filamentColors`
- `<select>` option coloring is limited by browser rendering — use `style.backgroundColor` on `<option>` elements (works in Chrome, Firefox, Edge) or switch to a custom dropdown for full cross-browser support

## Acceptance Criteria

- [ ] Layer height from uploaded 3MF is applied to config on load
- [ ] Output 3MF opened in OrcaSlicer shows 0.10 mm layer height, 0.20 mm initial layer height
- [ ] Bresenham preview bar shows discrete dithered bands matching the actual algorithm output
- [ ] Typing `0.` into a stop `t` field does not reset to `0`; border turns red until valid
- [ ] Stop selectors show coloured filament swatches; editing a filament colour immediately updates all stop selectors
- [ ] Default transition `maxCycleLength` is 1
- [ ] Auto-apply toggle works: off → changes don't process; click Apply → processes; on → resumes auto behaviour
- [ ] Input preview shows correctly coloured per-face original paint data

## Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Bresenham preview method | Reuse `buildBresenhamLayerMap` in CSS construction | Matches TransitionEditor pattern; avoids divergence |
| Input validation approach | Local string state + validation on change | Avoid controlled→uncontrolled React issues; red border UX is standard |
| Auto-apply state location | `AppState.autoApply: boolean` | Simplest; no persistence needed |
| Stop colour rendering | Inline `style.backgroundColor` on `<option>` elements | Works in Chromium & Firefox; no custom dropdown needed |

## Open Questions

- (none blocking — all assumptions are reasonable defaults)
