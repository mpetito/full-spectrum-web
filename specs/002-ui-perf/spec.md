# Spec: UI Layout & Performance Improvements

**Date**: 2026-04-05 | **Status**: Draft

## Context

The web app has six user-reported issues: idle GPU load from continuous rendering,
poor sidebar layout, hardcoded output filename, static filament colors, missing
layer height in output, and no palette config round-trip in 3MF files.

## Objective

Fix rendering performance, restructure the UI layout to a slicer-like panel design,
and enhance 3MF output with filament colors, layer height, and palette config
round-trip capability.

## Scope

**In**: On-demand rendering, layout restructure, output filename, filament color
editing, layer height metadata, palette config persistence in 3MF.

**Out**: New processing algorithms, slicer integration, print profile management.

## Requirements

### 1. On-Demand Rendering

- Set `frameloop="demand"` on the R3F Canvas
- Call `invalidate()` on camera interaction, model load, and color/data changes
- GPU should idle when the scene is static

### 2. Slicer-Like Layout

- **Left panel**: configuration controls (file upload, palette config, filament editor)
- **Bottom-right**: processing indicator with progress bar (wired to existing `ProgressCallback`)
- **Top-right**: output details (triangle count, filament usage) + download button
- Processing status must always be visible, never scroll off screen

### 3. Output Filename

- Derive from input: `{input_stem}_full-spectrum.3mf`
- Display derived name in the output details panel

### 4. Filament Color Editing

- Show color swatches for each filament slot, initialized from `FILAMENT_COLORS`
- Each swatch opens a color picker to override the color
- Store user colors in app state; pass to shader for preview updates
- `write3mf` includes filament color definitions in slicer-compatible XML (Slic3r_PE_model.config filament entries)

### 5. Layer Height in Output 3MF

- Write `layer_height` from config into slicer-compatible XML metadata
- Write `initial_layer_height` as `2 × layer_height` (always derived, not user-editable)
- Prevents the common mistake of initial layer height not being a multiple of layer height, which offsets all subsequent layers

### 6. Palette Config Round-Trip

- `write3mf` adds `Metadata/full-spectrum.config.json` to the ZIP containing:
  - Palette configuration (cyclic/gradient strategy, color mapping params)
  - Layer height setting (for reference; authoritative value is in slicer XML)
- `read3mf` detects and parses this file when present
- UI pre-fills palette config controls from loaded data
- Filament colors are NOT in the custom JSON — they live in slicer-compatible XML only

## Non-Functional Requirements

- Idle GPU usage near zero (no continuous rendering when static)
- Progress bar updates at meaningful intervals (not per-triangle)
- Layout responsive down to 1024px viewport width

## Design Constraints

- Use existing `ProgressCallback` type from `pipeline.ts` — no new abstraction
- Custom metadata goes in `Metadata/full-spectrum.config.json` (follows 3MF convention)
- Filament color state lives in Zustand/context alongside existing app state
- No breaking changes to existing `read3mf`/`write3mf` signatures — extend with optional params

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Demand rendering | `frameloop="demand"` + `invalidate()` | Eliminates idle GPU load |
| Progress reporting | Wire existing `ProgressCallback` to UI state | Already defined in pipeline |
| Output filename suffix | `_full-spectrum` | Descriptive, matches project name |
| Custom metadata path | `Metadata/full-spectrum.config.json` | Follows 3MF Metadata/ convention |
| Filament colors storage | Slicer-compatible XML (Slic3r_PE_model.config) | Ensures slicers can read filament colors directly |
| Layer height storage | Slicer-compatible XML metadata | Slicers use layer height natively |
| initial_layer_height | Always 2× layer_height, not editable | Prevents layer offset misconfiguration; user can change in slicer |
| Custom JSON scope | Palette config only (cyclic/gradient mappings) | Slicer-specific data in XML, app-specific data in JSON |
| Layout pattern | CSS Grid with fixed panels | Keeps status visible, no scroll issues |

## Resolved Questions

- **Filament colors**: Written in slicer-compatible XML (Slic3r_PE_model.config), NOT in custom JSON. Slicers can read them directly.
- **initial_layer_height**: Always derived as 2× `layer_height`, not user-editable. Prevents layer offset mistakes; user can override in slicer.

## Acceptance Criteria

- [ ] Fan stops spinning when 3D preview is idle (no camera interaction)
- [ ] Processing status + progress bar visible at all times during processing
- [ ] Output file named `{input}_full-spectrum.3mf`
- [ ] Filament colors editable and reflected in both preview and output 3MF
- [ ] Output 3MF contains `layer_height` and `initial_layer_height` in metadata
- [ ] Re-opening an output 3MF pre-fills palette config, filament colors, and layer height
- [ ] All existing tests pass; new tests cover round-trip metadata
