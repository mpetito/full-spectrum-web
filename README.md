# Dither3D

**Turn any 3D print into a blended, multi-color object — no specialized slicer required.**

Modern FDM printers with multi-material setups can only print one filament per layer.
Dither3D works around this by rapidly alternating filament colors across layers — the
same way an inkjet printer blends colors by interspersing dots. Load your 3MF file,
assign a color palette to each filament region, and Dither3D produces a new 3MF with
the layer-by-layer color pattern already baked in, ready to slice with OrcaSlicer,
BambuStudio, PrusaSlicer, or any other slicer that supports multi-material 3MF files.

No plugins. No modified slicer. Works entirely in your browser — nothing is uploaded
to a server.

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

FDM color dithering exploits the limited Z resolution of the human eye. At a 0.1 mm
layer height, alternating red and blue layers from even a modest viewing distance
blend perceptually into purple — just as a TV screen blends subpixels into solid
colors. Dither3D automates the assignment of per-face filament indices that produce
this effect.

This technique was pioneered by the community around
[OrcaSlicer-FullSpectrum](https://github.com/ratdoux/OrcaSlicer-FullSpectrum), which
demonstrated the approach via a modified slicer. Dither3D takes a different path —
working directly on the 3MF mesh so you can use any unmodified slicer.

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

