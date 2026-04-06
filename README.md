# Dither3D

**Z-axis color dithering for multi-material FDM prints.**

Dither3D assigns a single filament to each Z-layer band within a painted region,
then rapidly alternates which filament appears from one layer to the next. At fine
layer heights (≤ 0.12 mm) the eye blends adjacent colors together, the same way
halftone dots merge into continuous tones in print media.

Load a painted 3MF, map each painted region to a cyclic or gradient color palette,
and Dither3D outputs a new 3MF with the dithered pattern baked in. Tested with
**OrcaSlicer**, **BambuStudio**, and **PrusaSlicer**; other slicers may work if
they support painted multi-material 3MF objects.

No slicer plugins. No forked slicer builds. Runs entirely in your browser —
nothing is uploaded to a server.

---

## Features

- **3MF Upload & Parse** — reads PrusaSlicer and BambuStudio painted 3MF formats
- **3D Preview** — real-time Three.js viewer with per-face filament colors
- **Cyclic Palette Mode** — strict alternating patterns (e.g. red→blue→red→blue) for
  flat blended color
- **Gradient Palette Mode** — pulse-density modulated gradients that transition
  smoothly between colors over the height of a region (e.g. red→orange→yellow)
- **Boundary Subdivision** — bisection splitting of faces that straddle layer
  boundaries for clean transitions
- **Configuration** — import/export JSON configs for reuse across prints
- **Download** — processed 3MF ready for immediate slicing

---

## How It Works — Technical Overview

### The Core Technique

FDM color dithering works along the Z axis. Within a painted region, each
Z-layer band uses a single filament, but Dither3D controls *which* filament is
assigned to each band. At fine layer heights (≤ 0.12 mm), alternating red and
blue bands blend perceptually into purple from normal viewing distances — the
same principle behind halftone printing.

This technique was pioneered by the community around
[OrcaSlicer-FullSpectrum](https://github.com/ratdoux/OrcaSlicer-FullSpectrum),
which demonstrated the approach inside a modified slicer coupled to specific
gcode dialects and printer profiles. Dither3D takes a different path — it
operates on the 3MF mesh directly, so the output works with any stock slicer
that supports painted multi-material 3MF files (tested with OrcaSlicer,
BambuStudio, and PrusaSlicer).

### Mesh Processing

Dither3D works on the triangle mesh embedded in the 3MF file. For each triangle face,
it computes the face centroid Z coordinate and maps it to a layer index:

```
layer_index = floor(centroid_z / layer_height)
```

Faces whose centroid falls within a layer boundary tolerance are split using
bisection along the layer plane, ensuring no single face spans two color bands.

### Palette Modes

**Cyclic (modulus-based):**

```
filament = palette[layer_index % palette.length]
```

A two-color cyclic palette `[red, blue]` produces a strict 1:1 alternation.
A three-color pattern `[red, red, yellow]` biases the ratio 2:1, yielding a
darker orange. Ratio control is the primary tool for tuning the perceived blend.

**Gradient (pulse-density modulated):**

A gradient palette defines color stops at normalized heights (0.0–1.0) within
a region. Dither3D maps these stops to a sequence of discrete filament assignments
using a Bresenham-style error accumulation algorithm — the same technique used in
halftone printing. The result is a smooth ramp from one color to another over the
full height of the painted region.

### 3MF Color Encoding

Dither3D reads and writes the per-triangle filament index using the XML attribute
encoding defined in the OrcaSlicer/BambuStudio dialect of 3MF:

```xml
<triangle v1="0" v2="1" v3="2" paint_color="4" />
```

The `paint_color` value is a bit-packed hex integer:

- Extruder 1: `"4"` (binary: `0100`)
- Extruder 2: `"8"` (binary: `1000`)
- Extruder 3: `"C"` (binary: `1100`)
- Each 4-bit nibble encodes one segment of the triangle's coloring

PrusaSlicer uses a different attribute (`slic3rpe:mmu_segmentation`) with the same
bit-encoding. Dither3D handles both dialects on read, and writes OrcaSlicer format
on output.

### Tech Stack

| Layer      | Technology                            |
| ---------- | ------------------------------------- |
| Framework  | React 19 + TypeScript                 |
| Build      | Vite 8                                |
| 3D Preview | Three.js via React Three Fiber + Drei |
| CSS        | Tailwind CSS v4                       |
| ZIP / 3MF  | fflate                                |
| Unit Tests | Vitest                                |
| E2E Tests  | Playwright                            |

The processing library (`src/lib/`) is pure TypeScript with no DOM dependencies,
making it portable to Node.js or a future CLI companion tool.

---

## Development

```bash
npm install
npm run dev        # Dev server at http://localhost:5173
npm test           # Unit tests
npm run test:e2e   # Playwright e2e tests
npm run build      # Production build
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Bug reports and feature requests welcome via
[GitHub Issues](https://github.com/mpetito/dither3d/issues).

---

## License

AGPLv3 — See [LICENSE](LICENSE).

