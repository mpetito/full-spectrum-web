# AGENTS.md

> Agent instructions for Dither3D — Z-axis color dithering for multi-material FDM prints.

## Commands

```bash
npm install            # Install dependencies
npm run dev            # Dev server at http://localhost:5173
npm test               # Vitest unit tests (single run)
npm run test:watch     # Vitest in watch mode
npm run test:e2e       # Playwright e2e tests (starts dev server automatically)
npm run lint           # ESLint
npm run build          # TypeScript type-check + Vite production build
```

## Architecture

### Layers

| Directory         | Role                                                                                |
| ----------------- | ----------------------------------------------------------------------------------- |
| `src/lib/`        | Pure TypeScript processing library (uses DOM APIs for XML; needs polyfill for Node) |
| `src/components/` | React UI components (React 19 + Tailwind CSS v4)                                    |
| `src/state/`      | App-wide React context (`AppContext.tsx`)                                           |
| `src/hooks/`      | Custom React hooks (e.g. `useProcessing`)                                           |
| `e2e/`            | Playwright end-to-end tests                                                         |
| `specs/`          | Design specs and implementation plans (reference only)                              |

### Key Domain Concepts

- **3MF** — ZIP-based 3D model format; contains triangle meshes with per-face filament paint data
- **Painted regions** — Triangle faces tagged with a filament index via `paint_color` (OrcaSlicer/BambuStudio) or `slic3rpe:mmu_segmentation` (PrusaSlicer)
- **Cyclic palette** — Strict modulus-based alternation: `filament = palette[layer_index % len]`
- **Gradient palette** — Bresenham-style error accumulation mapping color stops at normalized heights (0.0–1.0) to discrete filament assignments
- **Boundary subdivision** — Bisection of triangle faces that straddle layer boundaries
- **Layer height** — Blending works at ≤ 0.12 mm; layer indexing is relative to region minimum Z: `floor((centroid_z - z_min + ε) / layer_height)`

### Coloring Model — Z-Based, Not Per-Face

Dither3D's core value is **sub-face color precision**. A single input triangle may span
many print layers, so the bisection encoder recursively subdivides it into sub-triangles
that each receive the correct filament for their Z height. The preview shader mirrors this:
every **fragment** independently computes its layer from interpolated model-space Z and
samples a layer→color texture, producing pixel-accurate horizontal bands.

**Per-face or per-vertex coloring is fundamentally wrong for this project** — it would
collapse each face to a single color, destroying the sub-face layer bands that are the
entire purpose of the tool. Always use the Z-based shader for output preview. See
[`src/lib/AGENTS.md`](src/lib/AGENTS.md) for the detailed encoding pipeline.

### Module Boundaries

- `src/lib/` is portable to Node.js with a DOM polyfill (e.g. happy-dom) — never import React here
- `src/components/` may import from `src/lib/` and `src/state/`, never the reverse
- 3MF read supports both OrcaSlicer and PrusaSlicer dialects; `write3mf` outputs `paint_color`, `slic3rpe:mmu_segmentation`, or both via `targetFormat` (default `both`)

## Code Style

- TypeScript strict mode — avoid `any`
- Tailwind CSS v4 (CSS-first config via `@import "tailwindcss"`, not `tailwind.config.js`)
- Tests live in `__tests__/` directories adjacent to the code they test
- E2E tests go in `e2e/` and use Playwright with Chromium

## Testing

- Palette/dithering changes in `src/lib/` require **visual evidence** in PR descriptions (screenshot of 3D preview showing clean horizontal bands, no sawtooth)
- Unit tests alone are insufficient for palette correctness — see [CONTRIBUTING.md](CONTRIBUTING.md)
- E2E fixtures live in `e2e/fixtures/` (`.3mf` files)

## Do Not

- ❌ Use per-face or per-vertex colors for output preview — the Z-based shader is essential; each face spans multiple layers and must show sub-face color bands (see [Coloring Model](#coloring-model--z-based-not-per-face))
- ❌ Import React APIs in `src/lib/` — it must stay portable (DOM APIs for XML parsing are OK)
- ❌ Use `any` types — add proper type annotations
- ❌ Modify files under `coverage/`, `playwright-report/`, or `test-results/` — these are generated
- ❌ Hard-code colors — use Tailwind design tokens
- ❌ Claim the tool works with "any slicer" — tested with OrcaSlicer, BambuStudio, PrusaSlicer only
- ❌ Install packages without asking first

## See Also

- [README.md](README.md) — Project overview and technical details
- [CONTRIBUTING.md](CONTRIBUTING.md) — Contribution guidelines and visual evidence requirements
- [specs/](specs/) — Design specs and implementation plans
