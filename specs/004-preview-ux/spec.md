# Spec: Preview & UX Enhancements

**Date**: 2026-04-05 | **Status**: Draft

## Context

The app works end-to-end but the 3D preview lacks grounding (no build plate),
controls lack a quick reset mechanism, filament colors are capped at 10
(BambuStudio supports 32), and users can't compare input vs output models.

## Objective

Add a build plate grid to the 3D preview, double-click-to-reset for all controls,
dynamic filament color slots up to 32, and an input/output preview toggle.

## Scope

**In**: Build plate grid plane, control reset on double-click, dynamic filament
count up to 32, input/output preview toggle.

**Out**: Split-screen view, custom user presets/profiles, undo/redo stack,
wireframe mode, print bed size configuration.

## Requirements

### 1. Build Plate Grid

- Render a flat plane at Z=0 beneath the model inside `MeshViewer.tsx`
- Grid pattern via shader or procedural texture (not a pre-baked image)
- Grid spacing: 10mm lines
- Plane sized to model bounding box (max X/Y dimension × 1.5, minimum 100mm)
- Neutral gray color, semi-transparent so it doesn't dominate — works in both light/dark themes
- Positioned just below the model's minimum Z (inside the -π/2 rotation group)
- Must not z-fight with model base

### 2. Double-Click to Reset

- Double-clicking any control resets it to its factory default
- Controls in scope: layer height slider, target format select, boundary split
  checkbox, max split depth slider, individual filament color swatches, palette
  mapping entries' individual controls
- Default values sourced from: `defaultConfig(0.1)` for settings,
  `FILAMENT_COLORS[i]` for colors (if index exists in original array),
  `#808080` for added colors beyond original 11
- Double-click on a filament swatch resets that individual color, NOT the entire palette
- Dispatch `UPDATE_CONFIG` or `SET_FILAMENT_COLORS` as appropriate so processing auto-triggers

### 3. Dynamic Filament Colors (Up to 32)

- Remove hardcoded 11-color limit from `FILAMENT_COLORS` usage
- Add "+" button at end of the color grid in `FilamentColorEditor` to append a new color
- New colors default to `#808080`
- Add "−" button on the last swatch to remove it (preserves filament index stability; minimum 2 colors: slot 0 + at least one active)
- Maximum 32 colors (matching BambuStudio's `CONST_FILAMENTS` table which supports indices 0–31)
- Extend `FILAMENT_HEX_TABLE` / `HEX_FILAMENT_TABLE` in `encoding.ts` to cover filaments 11–31
  using BambuStudio's encoding:
  `{11: '8C', 12: '9C', 13: 'AC', 14: 'BC', 15: 'CC', 16: 'DC', 17: 'EC', 18: '0FC', 19: '1FC', 20: '2FC', 21: '3FC', 22: '4FC', 23: '5FC', 24: '6FC', 25: '7FC', 26: '8FC', 27: '9FC', 28: 'AFC', 29: 'BFC', 30: 'CFC', 31: 'DFC'}`
- Update `MAX_FILAMENTS` from 10 to 31
- `PaletteMapper` input filament selector must enumerate up to the current
  `filamentColors.length - 1` (dynamic, not hardcoded `MAX_FILAMENTS`)
- `OutputStats` distribution colors must use `filamentColors[fil]` from state
  (already does this partially but falls back to `FILAMENT_COLORS[fil]`)

### 4. Input / Output Preview Toggle

- Add a toggle control near the 3D viewport (top-left overlay, segmented button: "Input" | "Output")
- Add `previewMode: 'input' | 'output'` to `AppState` (default: `'output'`)
- When "Input": render mesh with per-face filament vertex colors (existing fallback
  path in MeshGeometry, using `meshStandardMaterial` with vertex colors)
- When "Output": render mesh with layer-color shader (current behavior, requires `layerColorData`)
- If no `layerColorData` exists yet (file just uploaded, not processed), force "Input"
  mode and disable the toggle
- Camera position and orbit state preserved across toggle switches
- Build plate grid visible in both modes

## Non-Functional Requirements

- Build plate grid must not degrade rendering performance (single draw call)
- Toggle switch must be instantaneous (material swap, no re-processing)
- Adding/removing filament colors must not trigger full re-processing unless a color
  actually used in a mapping changed

## Design Constraints

- Use existing `defaultConfig()` as source of truth for control defaults — no separate defaults registry
- Filament hex encoding must match BambuStudio's `CONST_FILAMENTS` table exactly for interoperability
- No new npm dependencies for the build plate (use Three.js `PlaneGeometry` + shader or `GridHelper`)
- Preview mode toggle is purely a rendering concern — does not affect pipeline processing or output

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Build plate implementation | `GridHelper` or shader-based grid on `PlaneGeometry` | Built into Three.js, zero dependencies, single draw call |
| Grid spacing | 10mm | Standard slicer convention |
| Max filament count | 32 (indices 0–31) | Matches BambuStudio `CONST_FILAMENTS`; forward-compatible |
| Hex table extension | Copy BambuStudio encoding for indices 11–31 | Ensures output 3MF is slicer-compatible |
| Double-click reset scope | Per-control, not global | More granular; global reset is a separate concern |
| Preview toggle placement | Top-left overlay on canvas | Non-intrusive, always visible, doesn't compete with sidebar |
| Input preview material | `meshStandardMaterial` with vertex colors | Already exists as fallback path in MeshViewer |

## Resolved Questions

- **Filament limit**: BambuStudio supports 32 (0–31). The hex encoding extends with `8C`, `9C`, ... `DFC` pattern. We adopt the same table.
- **Build plate sizing**: Dynamic, based on model bounding box. No need for printer-specific bed dimensions.
- **Double-click granularity**: Per-control, per-color. Not a global "reset all" action.

## Acceptance Criteria

- [ ] Build plate grid visible beneath model after file upload
- [ ] Grid lines at 10mm spacing, covers model footprint
- [ ] Double-clicking layer height slider resets to 0.10 mm
- [ ] Double-clicking a filament swatch resets that color to its default
- [ ] "+" button adds a new filament color (up to 32 total)
- [ ] "−" button removes a filament color (minimum 2 remain)
- [ ] Palette mapper lists filaments dynamically based on current count
- [ ] Encoding round-trips correctly for filament indices 11–31
- [ ] "Input" / "Output" toggle switches preview mode without re-processing
- [ ] Input mode shows per-face filament colors; output mode shows layer-painted colors
- [ ] Toggle disabled when no processed output exists
- [ ] All existing tests pass
