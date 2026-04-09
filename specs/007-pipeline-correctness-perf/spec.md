# Spec: Pipeline Correctness & Performance

**Date**: 2026-04-08 | **Status**: Draft

## Context

A focused code review of the core processing library (`src/lib/`) identified a
critical correctness bug in multi-color palette application, architectural
limitations blocking palette extensibility, code duplication creating maintenance
risk, performance inefficiencies in the bisection subdivision path, and
configuration validation gaps for extreme layer heights.

The user confirmed:
1. Layer heights down to 0.04 mm must be supported (not just the typical 0.08–0.12 mm range).
2. New palette types are on the roadmap, making extensibility a priority.
3. Performance optimizations for bisection allocation should be pursued if straightforward.

## Objective

Fix the multi-region palette conflation bug so that overlapping Z-range clusters
produce correct per-face output. Harden configuration validation for extreme layer
heights. Centralize palette dispatch to support future palette types without
shotgun surgery. Eliminate process/processAsync duplication. Reduce allocation
pressure in the bisection subdivision hot path.

## Scope

**In**: Multi-region correctness fix, per-face boundary encoding, preview shader
accuracy, config validation for depth/layer-height coupling, palette strategy
pattern, process/processAsync unification, centroid deduplication, bisection
allocation optimization, dense-array conversion for layer maps.

**Out**: New palette types (deferred to a future spec), SharedArrayBuffer worker
transport (requires server header changes — captured as open question), UI/UX
redesign of palette editor, changes to 3MF read/write format.

## Requirements

### 1. Fix Multi-Region Palette Conflation (Critical)

`buildLayerFilamentMap()` in `pipeline.ts` builds a single global
`Map<number, number>` mapping layer index → filament. When multiple input-color
clusters overlap in Z range, the second cluster overwrites the first's entries.
This corrupts two downstream consumers:

1. **Preview shader** — `MeshViewer.tsx` builds a 1D layer texture from the
   global map, so all faces at the same Z get the same color regardless of input
   filament.
2. **Boundary subdivision** — `makeSubdivider()` in `subdivision.ts` looks up
   `filamentByLayer.get(layerLo)` from the same global map, so boundary faces
   get the wrong output filament.

Non-boundary faces are unaffected because they're assigned per-cluster via the
separate `faceFilaments[]` array in `process()`.

The fix must make boundary encoding and preview data per-face or per-cluster
rather than per-global-layer. The `layerFilamentMap` concept must become
cluster-aware: each face's output filament is determined by its input-color
cluster's palette mapping, not a single global layer→filament table.

### 2. Configuration Validation: Bisection Depth / Layer Height Coupling

- Default `maxSplitDepth=9` is insufficient for layer heights 0.04–0.07 mm.
  At depth 9 with 0.04 mm layers, subdivision can't resolve below ~0.06 mm,
  triggering lossy centroid fallback.
- `validateConfig` in `config.ts` accepts 0.04 mm without warning about the
  depth mismatch. It should emit a warning or auto-adjust when the configured
  depth is too shallow for the layer height.
- The UI slider in `GlobalSettings.tsx` allows split depth max=15 but the useful
  maximum for layers ≥0.04 mm is ~13–14. Consider dynamic slider bounds or a
  recommended-value hint.
- `LAYER_EPSILON_FACTOR=0.001` yields only 40 nm epsilon at 0.04 mm — approaching
  mesh rounding precision. Validate or clamp to a minimum absolute epsilon.

### 3. Palette Extensibility: Strategy Pattern

14 dispatch sites across 8 files use raw `if`/`else` on `palette.type`:

| File | Dispatch sites |
|------|---------------|
| `config.ts` | `parsePalette`, `validateConfig` (2) |
| `pipeline.ts` | `process`, `processAsync`, `buildLayerFilamentMap` (3) |
| `hooks/useProcessing.ts` | `configToJson` (1) |
| `components/ConfigImportExport.tsx` | `configToJson` (1 — duplicate of hook) |
| `components/PaletteMapper.tsx` | dropdown, conditional render, default factory (3) |
| Other UI components | Assorted palette-type checks (4) |

Adding a new palette type requires modifying 8+ files. The discriminated union
type system is sound, but dispatch should be centralized behind a strategy
registry so that adding a type means registering one strategy object, not editing
every consumer.

### 4. Unify process() / processAsync()

`process()` and `processAsync()` in `pipeline.ts` are ~160 lines each, 95%
identical. They differ only in the bisection call (sync vs parallel via workers).
Bug fixes must currently be applied twice. Extract the shared pipeline skeleton
into a single function that accepts a bisection strategy (sync or async), so
logic changes propagate automatically.

Similarly, `encodeBoundaryFaces()` and `encodeBoundaryFacesParallel()` share
~40 lines of identical setup (globalZMin, layerFilamentMap, defaultFilament
computation). Extract the shared setup.

### 5. Deduplicate configToJson()

`configToJson()` is duplicated in `useProcessing.ts` and
`ConfigImportExport.tsx` with subtly different return types (`Record` vs
`string`). Consolidate into a single canonical function in `src/lib/config.ts`.

### 6. Deduplicate computeCentroidsZ()

`computeCentroidsZ()` is called 3–4× per pipeline run: in
`buildLayerFilamentMap`, `encodeBoundaryFaces`/`Parallel`, and indirectly via
`computeFaceLayers`. Additionally, `buildLayerFilamentMap` manually re-derives
region centroids instead of indexing into the already-computed global array.
Compute once, pass the result downstream.

### 7. Bisection Allocation Optimization

- `makeSubdivider()` in `subdivision.ts` allocates 2–3 fresh `[x,y,z]` tuples
  per recursion level. At depth 9 with 3-way splits, ~20K allocations per
  boundary face. With 10K+ boundary faces this produces millions of short-lived
  heap objects.
- The `nibbles` array uses dynamic `push()` without pre-allocation. At depth 9,
  up to 10K elements per face with repeated reallocations.
- Pre-allocate a vertex scratch buffer per subdivider instance and reuse across
  recursion levels. Pre-size the nibbles array to a known upper bound
  (`3^maxDepth` worst case, or a tighter empirical bound).

### 8. Dense Array for Layer Filament Map

`layerFilamentMap` uses `Map<number, number>` but layer indices are dense
integers `0..N`. Replace with a typed array (`Uint8Array` or `Uint16Array`)
for O(1) direct indexing and lower overhead.

### 9. Clean Up Dead Code

- Remove unused `_maxDepth` parameter in `makeSubdivider`.
- Clarify `computeFaceLayers` naming ambiguity (global layers vs region-local
  layers).

## Non-Functional Requirements

- No regression in existing test suite after any change.
- Multi-region correctness fix must include visual evidence in PR description
  (per CONTRIBUTING.md).
- Subdivision performance: measurable reduction in GC pause time on meshes with
  10K+ boundary faces (benchmark before/after).
- Backwards compatibility: existing 3MF files processed with the current pipeline
  must produce identical output for single-region models.

## Design Constraints

- `src/lib/` must stay React-free and portable to Node.js with a DOM polyfill
  (per AGENTS.md).
- TypeScript strict mode — no `any` types.
- Palette strategy registry must live in `src/lib/` (not in components).
- Worker communication changes (Requirement 7) must not require COOP/COEP server
  headers in this spec — SharedArrayBuffer is deferred to an open question.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Multi-region fix approach | Per-cluster layer→filament maps passed to subdivider and preview | Preserves per-face correctness without changing the global pipeline shape |
| Preview data model | Per-face filament array (not per-layer texture) | Eliminates the conflation bug at its root; per-layer texture is fundamentally incompatible with overlapping clusters |
| Palette dispatch | Strategy registry in `src/lib/palette.ts` | Single registration point; lib stays React-free; UI reads strategy metadata for rendering |
| process/processAsync unification | Single skeleton + bisection strategy injection | Eliminates duplication; strategy is sync function or async worker dispatcher |
| configToJson location | `src/lib/config.ts` | Canonical location for config serialization; components import from lib |
| Layer filament map data structure | Typed array (`Uint8Array` or `Uint16Array`) | Dense integer keys → direct indexing; lower GC pressure |
| Bisection allocation | Pre-allocated scratch buffer per subdivider | Avoids millions of short-lived tuple allocations; buffer reset per face |
| Nibbles pre-allocation | Pre-sized array with fill index | Avoids repeated `push()` reallocation on hot path |
| Config validation for depth/height | Warning + auto-suggest (not hard error) | Users may intentionally choose low depth for speed; warn but don't block |
| Minimum absolute epsilon | Floor at a safe value (e.g. 100 nm) | Prevents floating-point breakdown at extreme layer heights |

## Acceptance Criteria

- [ ] Multi-region model with two overlapping Z-range clusters produces correct per-face output filaments for both boundary and non-boundary faces
- [ ] Preview shader shows distinct colors for different input-filament regions at the same Z height
- [ ] Unit test: two clusters sharing a Z range get independent palette mappings
- [ ] `validateConfig` warns when `maxSplitDepth` is too shallow for the configured `layerHeight`
- [ ] Config validation enforces a minimum absolute epsilon regardless of layer height
- [ ] Adding a new palette type requires registering one strategy object (no changes to pipeline, preview, or encoding logic)
- [ ] `process()` and `processAsync()` share a single pipeline skeleton — no duplicated logic
- [ ] `configToJson()` exists in exactly one location (`src/lib/config.ts`)
- [ ] `computeCentroidsZ()` is called at most once per pipeline run; result is passed to all consumers
- [ ] Bisection subdivision uses pre-allocated scratch buffers (no per-recursion tuple allocation)
- [ ] `layerFilamentMap` replaced with typed array for dense integer indexing
- [ ] Unused `_maxDepth` parameter removed from `makeSubdivider`
- [ ] All existing tests pass after each change
- [ ] Pipeline benchmark on 10K+ boundary-face mesh shows reduced GC pause time

## Open Questions

1. **SharedArrayBuffer for workers** — Using `SharedArrayBuffer` instead of copying
   full vertex/face buffers via `postMessage` would eliminate ~22 MB of copies per
   worker (8 workers × 100K-vertex mesh). However, this requires `Cross-Origin-Opener-Policy`
   and `Cross-Origin-Embedder-Policy` headers on the hosting server. Should this be
   pursued in this spec or deferred to a deployment/infrastructure spec?

2. **Preview shader model** — The decision above proposes per-face filament data
   instead of a per-layer texture. An alternative is a per-face filament texture
   (indexed by face ID). The per-face array is simpler but scales with face count;
   a texture lookup is GPU-friendlier for very large meshes. Which approach should
   be implemented first?

3. **Palette strategy UI rendering** — The strategy registry can provide metadata
   (display name, default config factory), but the editor UI for each palette type
   has type-specific controls. Should strategy objects include a React component
   reference (breaks lib/React boundary) or should the UI use a separate
   component registry keyed by palette type?

4. **Transferable vs SharedArrayBuffer** — As a middle ground before
   SharedArrayBuffer, worker `postMessage` could use Transferable arrays
   (zero-copy, but the sender loses access). Is this acceptable for the current
   pipeline flow where the main thread doesn't need the buffers after dispatch?
