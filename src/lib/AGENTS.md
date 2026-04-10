# src/lib/ — Processing Library

> Pure TypeScript encoding pipeline. No React, no DOM rendering.
> Portable to Node.js with a DOM polyfill (e.g. happy-dom) for XML parsing.

## Coloring Model — Why Z-Based Is Non-Negotiable

### The Problem

An input triangle may be tens or hundreds of layers tall. The slicer needs to
know which filament to use at _every_ Z height within that face, not just one
color for the whole face.

### The Encoding Pipeline (3MF Output)

```
Input face (one triangle, many layers tall)
  │
  ├─ Non-boundary face: centroid Z → layer index → palette lookup → single filament
  │    (face fits entirely within one layer band — safe to assign one color)
  │
  └─ Boundary face: vertex Z-span crosses layer boundaries
       │
       └─ Recursive bisection (makeSubdivider)
            │  Split the triangle along its longest edge
            │  Each sub-triangle's centroid Z → layer index → palette → filament
            │  Continue splitting until sub-triangles fit within a single layer
            │
            └─ Nibble stream: encodes the bisection tree as hex digits
                 Written to 3MF paint_color / mmu_segmentation attribute
```

A single boundary face produces a _tree_ of sub-triangles, each with its own
filament. This is serialized as a hex-encoded nibble stream in the 3MF per-face
attribute. **There is no way to represent this as one color per face.**

### The Preview (Z-Based Fragment Shader)

The preview shader mirrors the encoding model at pixel precision:

```
Vertex shader → passes model-space Z (position.z) as varying vModelZ
Fragment shader:
  1. layerIndex = floor((vModelZ - zMin + ε) / layerHeight)
  2. Sample layer→color texture at layerIndex
  3. Output the color for this specific pixel's Z height
```

Every fragment independently computes its own layer. A single triangle rendered
on screen shows multiple horizontal color bands — exactly matching what the
printer will produce from the bisection-encoded sub-triangles.

### Why Per-Face / Per-Vertex Coloring Is Wrong

| Approach              | What it does                               | Why it fails                                                  |
| --------------------- | ------------------------------------------ | ------------------------------------------------------------- |
| Per-face vertex color | All 3 vertices of a face get the same RGB  | Entire face renders as one solid color — destroys layer bands |
| Per-vertex color      | Each vertex gets a color, GPU interpolates | Produces smooth gradients instead of sharp layer boundaries   |
| Per-face flat color   | One color per face                         | Same as per-face vertex — one color, no sub-face detail       |

**All three approaches collapse a multi-layer face to ≤ 3 colors.** The whole
purpose of Dither3D is sub-face Z-precision. The Z-based shader is the only
correct approach for output preview.

### Multi-Region Clusters

Input faces are grouped into **clusters** by their painted filament index. Each
cluster has its own palette mapping (cyclic or gradient), producing independent
layer→filament assignments.

**Current bug (spec 007):** `buildLayerFilamentMap()` conflates all clusters
into a single global `Map<number, number>`. When clusters overlap in Z range,
the last writer wins — both the subdivider and the shader produce wrong colors.

**Planned fix:** Per-cluster layer maps + a face→cluster index, so the subdivider
and shader each look up the correct cluster's mapping. The shader will use a 2D
texture (layers × clusters) with a per-vertex cluster index attribute.

## Module Inventory

| Module                | Data granularity                    | Purpose                                                                                     |
| --------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------- |
| `mesh.ts`             | Per-face (centroid Z → layer index) | Geometry types, `computeCentroidsZ`, `computeGlobalFaceLayers`, `computeRegionLayers`       |
| `palette.ts`          | Per-layer (layer index → filament)  | `applyCyclic`, `applyGradient`, `buildGradientLayerMap`                                     |
| `pipeline.ts`         | Per-face + per-layer                | Orchestrates read → cluster → palette → encode → write; builds `LayerColorData` for preview |
| `subdivision.ts`      | Per-sub-triangle (recursive)        | `findBoundaryFaces`, `makeSubdivider` (bisection closure), `encodeBoundaryFaces`            |
| `subdivision-pool.ts` | Same as subdivision.ts              | Parallel worker dispatch for `encodeBoundaryFacesParallel`                                  |
| `encoding.ts`         | Per-face (hex nibble stream)        | Filament ↔ hex mapping, `BisectionNode` tree, nibble serialization                          |
| `threemf.ts`          | Per-face (XML attributes)           | `read3mf` / `write3mf` — ZIP-based 3MF I/O                                                  |
| `config.ts`           | N/A (schema)                        | `Dither3DConfig`, `Palette`, `ColorMapping`, `parsePalette`, `validateConfig`               |

## Key Types

```
MeshData          — vertices: Float64Array, faces: Uint32Array, faceCount
Dither3DConfig    — layerHeightMm, colorMappings[], maxSplitDepth, targetFormat
Palette           — CyclicPalette { pattern[] } | GradientPalette { stops[] }
LayerColorData    — layerFilamentMap, zMin, layerHeight, totalLayers (feeds shader)
PipelineResult    — faceCount, layerCount, filamentDistribution, warnings
```

## Do Not

- ❌ Use per-face or per-vertex coloring for output preview — see [Coloring Model](#coloring-model--why-z-based-is-non-negotiable)
- ❌ Build a single global layer→filament map when multiple clusters exist — each cluster gets its own map
- ❌ Import React — this library must stay portable to Node.js
- ❌ Assume one face = one color — boundary faces contain a bisection _tree_ of sub-triangle filaments
- ❌ Use smooth interpolation for layer colors — layers are discrete; always use `NearestFilter` / `floor()`
