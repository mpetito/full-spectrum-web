# Plan: Pipeline Correctness & Performance

**Spec**: [spec.md](spec.md) | **Date**: 2026-04-08

## Summary

Fix the critical multi-region palette conflation bug so overlapping Z-range clusters
produce correct per-face output in both 3MF boundary encoding and the preview shader.
Simultaneously eliminate code duplication (process/processAsync, configToJson,
computeCentroidsZ), centralize palette dispatch behind a strategy registry, harden
config validation for extreme layer heights, and reduce GC pressure in the bisection
subdivision hot path.

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Multi-region fix | Per-face cluster index + per-cluster layer maps in subdivider | Each boundary face looks up its own cluster's layer→filament map; no global conflation |
| Preview output mode | Cluster-aware Z-based shader with 2D texture (layers × clusters) | Z-based rendering is essential: boundary faces span multiple layers, shader colors each pixel by Z height. 2D texture rows hold per-cluster color maps; per-vertex `aClusterIndex` attribute selects the correct row |
| Pipeline skeleton | Single `runPipeline()` accepting a `BisectionStrategy` callback | Eliminates ~160 lines of duplication between `process()` and `processAsync()` |
| Palette dispatch | Strategy registry in `src/lib/palette.ts` with `PaletteStrategy` interface | Single registration point; lib stays React-free; UI reads strategy metadata |
| Boundary encoding setup | Shared `prepareBoundaryContext()` function | Extracts duplicated globalZMin + defaultFilament + map computation from serial and parallel paths |
| configToJson | Canonical in `src/lib/config.ts`; consumers import from lib | Single source of truth; palette serialization goes through strategy registry |
| Layer filament data | Per-cluster typed arrays + faceClusterIndex instead of global `Map<number, number>` | Dense keys → direct indexing; no cross-cluster interference; faceClusterIndex maps each face to its cluster for both subdivider and shader |

---

## Phase 1: Low-Risk Cleanup

**Goal**: Remove dead code and deduplicate shared utilities with zero behavior change.

### Steps

1. In `src/lib/subdivision.ts`, remove the unused `_maxDepth` parameter from
   `makeSubdivider()` (L56). Update all call sites in `subdivision.ts`
   (`encodeBoundaryFaces` L304–305) and `subdivision-pool.ts` (worker setup
   ~L60) and their tests.

2. In `src/lib/config.ts`, add a canonical `configToJson(config: Dither3DConfig): Record<string, unknown>` function. Copy the implementation from `src/hooks/useProcessing.ts` L6–26.

3. In `src/hooks/useProcessing.ts`, delete the local `configToJson` function
   (L6–26) and import from `src/lib/config.ts`.

4. In `src/components/ConfigImportExport.tsx`, delete the local `configToJson`
   function (L3–19) and import from `src/lib/config.ts`. Adapt the call site
   to call `JSON.stringify(configToJson(config), null, 2)` since the lib version
   returns a `Record` not a string.

5. In `src/lib/pipeline.ts`, extract `computeCentroidsZ()` calls: compute once
   at the top of the pipeline skeleton (after `read3mf`) and pass the result
   array to `buildLayerFilamentMap()`, `encodeBoundaryFaces()`, and
   `encodeBoundaryFacesParallel()` as a parameter instead of re-computing internally.

### Files Changed

| File | Action | Detail |
|------|--------|--------|
| `src/lib/subdivision.ts` | Modify | Remove `_maxDepth` param from `makeSubdivider` |
| `src/lib/subdivision-pool.ts` | Modify | Update `makeSubdivider` call to drop `_maxDepth` arg |
| `src/lib/config.ts` | Modify | Add `configToJson()` |
| `src/hooks/useProcessing.ts` | Modify | Import `configToJson` from lib, delete local copy |
| `src/components/ConfigImportExport.tsx` | Modify | Import `configToJson` from lib, delete local copy |
| `src/lib/pipeline.ts` | Modify | Compute centroids once, pass downstream |
| `src/lib/mesh.ts` | Modify | Ensure `computeCentroidsZ` is exported (already is) |

### Verification

- `npm test` — all existing tests pass.
- `npm run build` — no type errors.
- Grep codebase: `configToJson` exists only in `src/lib/config.ts` (definition) and import sites.
- Grep: `_maxDepth` no longer appears in `makeSubdivider` signature.

---

## Phase 2: Process/ProcessAsync Unification

**Goal**: Eliminate the duplicated pipeline skeletons so bug fixes propagate automatically.

### Steps

1. In `src/lib/pipeline.ts`, define a `BisectionStrategy` type:
   ```ts
   type BisectionStrategy = (
     mesh: MeshData,
     faceFilaments: Uint32Array,
     layerHeight: number,
     options: BisectionOptions,
   ) => Promise<Map<number, string>> | Map<number, string>;
   ```

2. Extract the shared pipeline body into a private `runPipeline()` function that
   accepts `BisectionStrategy` as a parameter. The function contains steps 1–5
   and 7 (everything except the bisection call itself). The bisection call
   (step 6) invokes the injected strategy.
   - `runPipeline` returns `Promise<[PipelineResult, Uint8Array | undefined, LayerColorData]>`
     (always async — the sync path wraps the serial `encodeBoundaryFaces` result
     in an immediately-resolved value).

3. Rewrite `process()` as:
   ```ts
   export function process(...): [...] {
     return runPipeline(inputData, config, options, syncBisectionStrategy);
   }
   ```
   Where `syncBisectionStrategy` wraps `encodeBoundaryFaces()`.

4. Rewrite `processAsync()` as:
   ```ts
   export async function processAsync(...): Promise<[...]> {
     return runPipeline(inputData, config, options, asyncBisectionStrategy);
   }
   ```
   Where `asyncBisectionStrategy` wraps `encodeBoundaryFacesParallel()`.

5. Similarly, extract the shared boundary-encoding setup from both
   `encodeBoundaryFaces()` (subdivision.ts L286–310) and
   `encodeBoundaryFacesParallel()` (subdivision-pool.ts L29–76) into a shared
   `prepareBoundaryContext()` function in `subdivision.ts`:
   ```ts
   export function prepareBoundaryContext(
     mesh: MeshData,
     centroidsZ: Float64Array,
     layerHeight: number,
   ): { globalZMin: number; epsilon: number; boundaryFlags: Uint8Array }
   ```

6. Update `encodeBoundaryFaces()` and `encodeBoundaryFacesParallel()` to call
   `prepareBoundaryContext()` instead of computing globalZMin/epsilon inline.

### Files Changed

| File | Action | Detail |
|------|--------|--------|
| `src/lib/pipeline.ts` | Modify | Extract `runPipeline()`, `BisectionStrategy` type; rewrite `process()` and `processAsync()` as thin wrappers |
| `src/lib/subdivision.ts` | Modify | Extract `prepareBoundaryContext()`; update `encodeBoundaryFaces()` |
| `src/lib/subdivision-pool.ts` | Modify | Update `encodeBoundaryFacesParallel()` to use `prepareBoundaryContext()` |

### Verification

- `npm test` — all existing tests pass.
- `process()` and `processAsync()` are each < 10 lines.
- `grep -rn "Step 1\|Step 2\|Step 3\|Step 4\|Step 5" src/lib/pipeline.ts` shows step comments only once (in `runPipeline`).
- E2E: load a painted model, process → confirm output matches pre-refactor output.

---

## Phase 3: Palette Strategy Registry

**Goal**: Centralize palette dispatch so adding a new palette type requires registering
one strategy object, not editing 8+ files.

### Steps

1. In `src/lib/palette.ts`, define the `PaletteStrategy` interface:
   ```ts
   export interface PaletteStrategy<T extends Palette = Palette> {
     readonly type: string;
     /** Apply palette to face layer indices for a single cluster. */
     apply(layerIndices: Uint32Array, regionLayers: number, palette: T): Uint32Array;
     /** Build a layer→filament map for a single cluster (for boundary encoding). */
     buildLayerMap(regionLayers: number, palette: T): Uint8Array | Uint16Array;
     /** Validate palette-specific config; return warnings. */
     validate(palette: T): string[];
     /** Serialize palette to JSON-safe object. */
     toJson(palette: T): Record<string, unknown>;
     /** Parse raw config object into typed palette. */
     parse(raw: unknown): T;
   }
   ```

2. Implement `CyclicStrategy` and `GradientStrategy` as objects satisfying
   `PaletteStrategy`. Move existing logic from `applyCyclic`, `applyGradient`,
   `buildGradientLayerMap`, `parsePalette`, and the validation branches into
   the respective strategy methods.

3. Create a registry:
   ```ts
   const strategies = new Map<string, PaletteStrategy>();
   export function registerPalette(strategy: PaletteStrategy): void { ... }
   export function getPaletteStrategy(type: string): PaletteStrategy { ... }
   ```
   Register cyclic and gradient on module load.

4. Update `src/lib/pipeline.ts` `runPipeline()` step 3 to use:
   ```ts
   const strategy = getPaletteStrategy(palette.type);
   assigned = strategy.apply(layerIndices, regionLayers, palette);
   ```

5. Update `src/lib/config.ts`:
   - `parsePalette()` → `getPaletteStrategy(raw.type).parse(raw)`
   - `validateConfig()` palette branches → `getPaletteStrategy(palette.type).validate(palette)`
   - `configToJson()` palette serialization → `getPaletteStrategy(palette.type).toJson(palette)`

6. Update UI components that switch on `palette.type` to use strategy metadata
   where practical. At minimum, `PaletteMapper.tsx` can read the strategy type
   list from the registry for the dropdown. The conditional rendering of
   `CyclicEditor` vs `GradientEditor` may remain as-is (UI components are
   inherently type-specific), but document the pattern for future palette types.

### Files Changed

| File | Action | Detail |
|------|--------|--------|
| `src/lib/palette.ts` | Modify | Add `PaletteStrategy` interface, registry, `CyclicStrategy`, `GradientStrategy`; keep old functions as deprecated wrappers initially |
| `src/lib/config.ts` | Modify | Delegate `parsePalette`, `validateConfig` palette branches, `configToJson` palette serialization to registry |
| `src/lib/pipeline.ts` | Modify | Use `getPaletteStrategy()` in step 3 |
| `src/components/PaletteMapper.tsx` | Modify | Read palette type list from registry for dropdown |

### Verification

- `npm test` — all palette tests pass.
- Adding a hypothetical "solid" palette type: verify it only requires a new strategy registration (no changes to pipeline/config/preview). Write a focused unit test demonstrating this.
- Existing cyclic and gradient behaviors unchanged.

---

## Phase 4: Multi-Region Correctness Fix (Critical)

**Goal**: Fix the conflation bug so overlapping Z-range clusters produce correct
per-face filament output in boundary encoding and preview.

### Steps

#### 4a. Per-Cluster Boundary Encoding

1. Modify `buildLayerFilamentMap()` in `pipeline.ts` to return a
   per-cluster structure instead of a single global map:
   ```ts
   interface ClusterLayerContext {
     inputFilament: number;
     layerMap: Uint8Array | Uint16Array;  // layer index → output filament
     zMin: number;
     layerCount: number;
   }
   ```
   Each cluster gets its own `layerMap` built via the palette strategy's
   `buildLayerMap()` method. Also return the global zMin and max layer count
   for preview sizing.

2. Build a `faceClusterIndex: Uint16Array` mapping face index → cluster index.
   This is derived during step 3's per-cluster loop (when assigning
   `faceFilaments[]`). Pass this to the subdivider.

3. Modify `makeSubdivider()` in `subdivision.ts` to accept:
   ```ts
   clusterLayerMaps: (Uint8Array | Uint16Array)[],
   faceClusterIndex: Uint16Array,
   ```
   Instead of a single `filamentByLayer: Map<number, number>`. On each face
   call, look up the face's cluster via `faceClusterIndex[faceIdx]`, then
   index into `clusterLayerMaps[clusterIdx][layerLo]`.

4. Thread `faceClusterIndex` through `encodeBoundaryFaces()` and
   `encodeBoundaryFacesParallel()`. For the worker path, include
   `faceClusterIndex` and `clusterLayerMaps` in the worker setup message.

5. Update the `SubdivideFn` type to accept an additional `faceIndex` parameter
   so the closure can look up the correct cluster. Update `faceToHex()` and
   the loop in `encodeBoundaryFaces()` to pass the face index.

#### 4b. Cluster-Aware Preview Shader

The Z-based shader is essential: boundary faces span multiple layers, and the
shader correctly colors each pixel by its Z height — this is the whole point
of the triangle bisection visualization. The fix is to make the shader
**cluster-aware** so each face samples from its own cluster's layer→color map
instead of a single global map.

6. Augment `LayerColorData` (or replace with a new interface) to carry
   per-cluster data to the preview:
   ```ts
   export interface LayerColorData {
     /** Per-cluster layer→filament arrays, indexed by cluster index */
     clusterLayerMaps: (Uint8Array | Uint16Array)[];
     /** Face index → cluster index (same array used by subdivider) */
     faceClusterIndex: Uint16Array;
     zMin: number;
     layerHeight: number;
     totalLayers: number;
     /** Number of clusters (rows in the 2D texture) */
     clusterCount: number;
   }
   ```

7. In `MeshViewer.tsx`, replace `buildLayerTexture()` to build a **2D texture**
   instead of a 1D texture. The texture dimensions are
   `width = totalLayers, height = clusterCount`. Each row `y` holds the RGBA
   colors for cluster `y`'s layer map:
   ```ts
   function buildClusterLayerTexture(
     data: LayerColorData,
     filamentColors: readonly string[],
   ): THREE.DataTexture {
     const { clusterLayerMaps, totalLayers, clusterCount } = data;
     const w = Math.max(totalLayers, 1);
     const h = Math.max(clusterCount, 1);
     const pixels = new Uint8Array(w * h * 4);
     for (let ci = 0; ci < h; ci++) {
       const map = clusterLayerMaps[ci];
       for (let li = 0; li < w; li++) {
         const filament = map?.[li] ?? 0;
         const [r, g, b] = hexToRgb(filamentColors[filament] ?? filamentColors[0]);
         const idx = (ci * w + li) * 4;
         pixels[idx] = Math.round(r * 255);
         pixels[idx + 1] = Math.round(g * 255);
         pixels[idx + 2] = Math.round(b * 255);
         pixels[idx + 3] = 255;
       }
     }
     const tex = new THREE.DataTexture(pixels, w, h, THREE.RGBAFormat);
     tex.minFilter = THREE.NearestFilter;
     tex.magFilter = THREE.NearestFilter;
     tex.needsUpdate = true;
     return tex;
   }
   ```

8. Add a per-vertex `aClusterIndex` float attribute to the geometry. Since the
   geometry is already non-indexed (3 unique vertices per face), all 3 vertices
   of face `f` get the same value `faceClusterIndex[f]`. This attribute is
   populated in a `useEffect` from `layerColorData.faceClusterIndex`:
   ```ts
   const clusterAttr = new Float32Array(faceCount * 3);
   for (let f = 0; f < faceCount; f++) {
     const ci = faceClusterIndex[f];
     clusterAttr[f * 3] = ci;
     clusterAttr[f * 3 + 1] = ci;
     clusterAttr[f * 3 + 2] = ci;
   }
   geometry.setAttribute('aClusterIndex',
     new THREE.BufferAttribute(clusterAttr, 1));
   ```

9. Update the GLSL shaders to sample the 2D texture using both layer index
   (x axis) and cluster index (y axis):
   ```glsl
   // Vertex shader — pass cluster index to fragment
   attribute float aClusterIndex;
   varying float vClusterIndex;
   // ... existing vModelZ, vWorldNormal ...
   void main() {
     vClusterIndex = aClusterIndex;
     // ... existing position/normal logic ...
   }

   // Fragment shader — sample 2D texture
   uniform float uClusterCount;
   varying float vClusterIndex;
   // ... existing uZMin, uLayerHeight, uTotalLayers, uLayerColorTex ...
   void main() {
     // ... existing layerF computation ...
     float u = (layerF + 0.5) / uTotalLayers;
     float v = (vClusterIndex + 0.5) / uClusterCount;
     vec3 layerColor = texture2D(uLayerColorTex, vec2(u, v)).rgb;
     // ... existing lighting ...
   }
   ```

10. Update `useProcessing.ts` to dispatch the augmented `layerColorData`
    (now containing `clusterLayerMaps`, `faceClusterIndex`, `clusterCount`)
    in the `PROCESS_SUCCESS` action. The `AppContext` state shape may need
    minor updates to match the new `LayerColorData` fields.

### Files Changed

| File | Action | Detail |
|------|--------|--------|
| `src/lib/pipeline.ts` | Modify | Per-cluster `buildLayerFilamentMap`, `faceClusterIndex`, augmented `LayerColorData` with cluster data |
| `src/lib/subdivision.ts` | Modify | `makeSubdivider` takes cluster maps + face cluster index; `SubdivideFn` takes face index; update `encodeBoundaryFaces` |
| `src/lib/subdivision-pool.ts` | Modify | Thread cluster data through worker messages; update `encodeBoundaryFacesParallel` |
| `src/state/AppContext.tsx` | Modify | Update `LayerColorData` type usage to match augmented interface |
| `src/components/MeshViewer.tsx` | Modify | 2D cluster×layer texture, `aClusterIndex` vertex attribute, updated shaders with `vClusterIndex` sampling |
| `src/hooks/useProcessing.ts` | Modify | Pass augmented `layerColorData` (with cluster arrays) in dispatch |

### Verification

- **Unit test**: Two clusters (filament 1 and 2) overlapping in Z range 0–10mm.
  Cluster 1 has cyclic pattern [3,4], cluster 2 has cyclic pattern [5,6].
  Verify `faceFilaments[i]` matches each face's own cluster's pattern, not the
  global overwritten map.
- **Unit test**: Boundary face belonging to cluster 1 at a Z layer where cluster 2
  would produce a different filament. Verify boundary encoding uses cluster 1's
  filament, not cluster 2's.
- **Unit test**: `buildClusterLayerTexture` produces a texture with correct
  dimensions (`totalLayers × clusterCount`) and each row matches its cluster's
  layer→filament mapping.
- **Visual evidence**: Load 2-color benchy. Process. Preview shows distinct dither
  patterns for hull vs deck at the same Z height — boundary faces display clean
  horizontal color bands from the Z-based shader, not flat per-face colors.
  Screenshot for PR.
- **3MF output**: Re-import the output 3MF into OrcaSlicer. Verify boundary face
  paint colors match the intended per-region palette, not a uniform layer stripe.
- `npm test` — all tests pass.

---

## Phase 5: Configuration Validation Hardening

**Goal**: Warn users when bisection depth is too shallow for extreme layer heights;
enforce a minimum absolute epsilon.

### Steps

1. In `src/lib/config.ts` `validateConfig()`, add a check after the existing
   layer-height validation:
   ```ts
   // Minimum useful depth: layers resolvable at this height require
   // depth >= ceil(log2(layerHeight / MIN_RESOLUTION))
   // For 0.04mm with ~0.001mm target: ~6 subdivisions minimum
   const minUsefulDepth = Math.ceil(Math.log2(config.layerHeightMm / 0.001));
   if (config.maxSplitDepth < minUsefulDepth) {
     warnings.push(
       `Split depth ${config.maxSplitDepth} may be too shallow for ` +
       `${config.layerHeightMm}mm layers (recommended ≥ ${minUsefulDepth})`
     );
   }
   ```

2. In `src/lib/subdivision.ts` (or `pipeline.ts` where epsilon is computed),
   add a minimum absolute epsilon floor:
   ```ts
   const epsilon = Math.max(layerHeight * LAYER_EPSILON_FACTOR, 0.0001); // 100nm floor
   ```

3. Add a constant `MIN_ABSOLUTE_EPSILON = 0.0001` to `src/constants.ts` and
   use it in the epsilon computation.

4. Write unit tests in `src/lib/__tests__/config.test.ts`:
   - `validateConfig` with `layerHeight=0.04, maxSplitDepth=9` → no warning (9 ≥ minUsefulDepth).
   - `validateConfig` with `layerHeight=0.04, maxSplitDepth=3` → warning about shallow depth.
   - Epsilon at 0.04mm layer height is at least 100nm.

### Files Changed

| File | Action | Detail |
|------|--------|--------|
| `src/lib/config.ts` | Modify | Add depth/height coupling warning in `validateConfig` |
| `src/constants.ts` | Modify | Add `MIN_ABSOLUTE_EPSILON` |
| `src/lib/subdivision.ts` | Modify | Clamp epsilon to minimum absolute floor |
| `src/lib/pipeline.ts` | Modify | Use clamped epsilon computation |
| `src/lib/__tests__/config.test.ts` | Modify | Add depth/height and epsilon tests |

### Verification

- `npm test` — new and existing tests pass.
- Manual: set layer height to 0.04mm in UI, verify warning appears if depth is low.

---

## Phase 6: Bisection Allocation Optimization

**Goal**: Reduce GC pressure in the subdivision hot path by pre-allocating scratch
buffers and pre-sizing arrays.

### Steps

1. In `src/lib/subdivision.ts`, modify `makeSubdivider()` to pre-allocate a
   vertex scratch buffer for midpoint calculations:
   ```ts
   // Pre-allocate midpoint scratch: 3 midpoints × 3 components = 9 floats
   // Reused across recursion levels via depth-indexed slots
   const scratchMidpoints = new Float64Array(maxDepth * 9);
   ```
   Replace the per-recursion `m01: Vert3 = [...]`, `m12: Vert3 = [...]`,
   `m20: Vert3 = [...]` allocations with indexed reads/writes into the scratch
   buffer. Each recursion level uses `depth * 9` as its offset.

2. Pre-size the `nibbles` array. At max depth 9 with 3-way splits, worst case
   is `4^9 ≈ 262K` nibbles (theoretical; empirical is much lower). Pre-allocate
   with a generous initial size and use a fill index instead of `push()`:
   ```ts
   const nibbles = new Array<number>(1024); // initial; grows if needed
   let nibbleLen = 0;
   // Replace push(x) with: nibbles[nibbleLen++] = x;
   ```
   This avoids repeated reallocation. Use `nibbleLen` as the actual length
   when encoding.

3. Update `faceToHex()` to accept `nibbles` + `nibbleLen` instead of an array
   with implicit `.length`.

4. Update the worker message protocol in `subdivision-pool.ts` to transfer
   the scratch buffer by reference (not copy) if using `Transferable`. For
   now, keep copying but pre-allocate once in the worker `onmessage` handler
   rather than per-face.

### Files Changed

| File | Action | Detail |
|------|--------|--------|
| `src/lib/subdivision.ts` | Modify | Pre-allocated scratch buffer; pre-sized nibbles; update `faceToHex` signature |
| `src/lib/subdivision-pool.ts` | Modify | Pre-allocate once in worker handler |
| `src/lib/__tests__/subdivision.test.ts` | Modify | Update tests for new `faceToHex` signature if needed |

### Verification

- `npm test` — all subdivision tests pass.
- **Benchmark**: Process a mesh with 10K+ boundary faces before and after.
  Measure with `performance.now()` around the bisection step. Expect measurable
  reduction in total time and GC pauses (Chrome DevTools Performance tab).
- Verify output 3MF is byte-identical for the same input (no behavioral change).

---

## Phase 7: Dense Layer Map & Final Cleanup

**Goal**: Replace `Map<number, number>` with typed arrays for layer filament maps;
clean up any remaining nomenclature issues.

### Steps

1. After Phase 4, `buildLayerFilamentMap` returns per-cluster typed arrays.
   Verify no remaining callers use `Map<number, number>` for layer→filament
   lookups. Remove the old `LayerColorData` interface if fully replaced by
   `OutputColorData`.

2. Rename `computeFaceLayers` to clarify whether it computes global or
   region-local layer indices. If it computes region-local indices, rename to
   `computeRegionLayerIndices`. Update all call sites and tests.

3. Final grep for any remaining palette `if/else` dispatch outside the strategy
   registry. Convert any stragglers.

4. Remove the old 1D `buildLayerTexture()` function from `MeshViewer.tsx` if
   not already replaced by `buildClusterLayerTexture()` in Phase 4. Verify no
   callers reference the old `layerFilamentMap: Map<number,number>` field.

### Files Changed

| File | Action | Detail |
|------|--------|--------|
| `src/lib/pipeline.ts` | Modify | Remove old `LayerColorData` if replaced |
| `src/lib/mesh.ts` | Modify | Rename `computeFaceLayers` if needed |
| `src/components/MeshViewer.tsx` | Modify | Remove dead shader code |
| Various | Modify | Final cleanup of stale references |

### Verification

- `npm test` — all tests pass.
- `npm run build` — clean build, no unused exports.
- `npm run lint` — no lint errors.

---

## Testing Strategy

- [ ] **Unit**: Multi-region correctness — two overlapping clusters produce independent per-face filaments (Phase 4)
- [ ] **Unit**: Boundary face uses correct cluster's layer map, not global (Phase 4)
- [ ] **Unit**: Palette strategy registry — register custom type, apply via registry (Phase 3)
- [ ] **Unit**: `validateConfig` depth/height coupling warning (Phase 5)
- [ ] **Unit**: Epsilon minimum floor enforcement (Phase 5)
- [ ] **Unit**: `configToJson` round-trips correctly from canonical location (Phase 1)
- [ ] **Integration**: Pipeline processes 2-color benchy with distinct patterns per region (Phase 4)
- [ ] **E2E**: Upload painted model → process → download → verify 3MF paint colors (existing `pipeline.spec.ts`)
- [ ] **Visual**: Screenshot of preview showing distinct dither patterns at same Z height (Phase 4)
- [ ] **Performance**: Benchmark bisection on 10K+ boundary faces before/after (Phase 6)

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Worker protocol change for cluster data increases message size | M | Cluster maps are small (≤ a few KB per cluster); size increase negligible vs existing vertex buffer copies |
| Scratch buffer depth indexing off-by-one | M | Unit test subdivision at exact depth boundary; verify nibble output unchanged |
| 2D texture size with many clusters × many layers | L | Typical models have < 20 clusters and < 5000 layers; even 20×5000×4 bytes = 400 KB, well within GPU limits. Add a sanity cap if needed |
| `aClusterIndex` precision as float attribute | L | Cluster count ≪ 2²⁴ (float mantissa); integer values stored as float are exact for reasonable counts |
| Strategy registry adds indirection | L | Registry is a simple Map lookup; no measurable overhead; typed generics preserve type safety |
| Breaking change to `LayerColorData` consumers | M | Search all imports of `LayerColorData`; update AppContext, appReducer tests, MeshViewer in same PR |
| Centroid pass-through increases parameter count | L | Group into a `PipelineContext` struct if parameter lists exceed 4 arguments |

## Phasing Dependencies

```
Phase 1 (Cleanup) ──┐
                     ├── Phase 2 (Unification) ──┐
Phase 5 (Config) ──*─┤                           ├── Phase 4 (Correctness) ── Phase 7 (Final Cleanup)
                     └── Phase 3 (Strategy) ─────┘
Phase 6 (Perf) ── [independent, can run after Phase 2]
```

- Phase 1 must land first (removes dead params, deduplicates utilities used by later phases).
- Phase 2 depends on Phase 1 (needs centroids pass-through).
- Phase 3 depends on Phase 1 (configToJson dedup).
- Phase 4 depends on Phases 2 + 3 (uses unified pipeline + strategy registry's `buildLayerMap`).
- Phase 5 is independent (can land alongside Phase 1 or 2).
- Phase 6 is independent (can land any time after Phase 2 stabilizes the subdivider interface).
- Phase 7 is a cleanup pass after Phase 4.
