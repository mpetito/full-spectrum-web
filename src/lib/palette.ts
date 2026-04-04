/**
 * Cyclic and gradient dithering algorithm implementations.
 *
 * Gradient dithering uses sequential error diffusion to distribute
 * minority-color layers maximally apart, eliminating structural banding.
 */

export class PaletteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaletteError';
  }
}

/**
 * Apply a cyclic (repeating) palette pattern to face layer indices.
 *
 * @param layerIndices (n_faces) 0-based layer indices
 * @param pattern Sequence of 1-based filament indices
 * @returns (n_faces) 1-based filament assignments
 */
export function applyCyclic(
  layerIndices: Uint32Array,
  pattern: readonly number[],
): Uint8Array {
  const n = layerIndices.length;
  const patLen = pattern.length;
  const result = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    result[i] = pattern[layerIndices[i] % patLen];
  }
  return result;
}

/**
 * Build a complete layer→filament map using sequential error diffusion.
 *
 * Processes layers sequentially so the error accumulator carries across
 * segment boundaries, eliminating phase-alignment artifacts.
 */
export function buildGradientLayerMap(
  totalLayers: number,
  stops: readonly [number, number][],
): Uint8Array {
  const layerMap = new Uint8Array(totalLayers);
  const denom = Math.max(totalLayers - 1, 1);

  const stopTs = stops.map((s) => s[0]);
  const stopColors = stops.map((s) => s[1]);
  const nStops = stops.length;

  let error = 0.0;

  for (let layer = 0; layer < totalLayers; layer++) {
    const t = layer / denom;

    // At or before first stop
    if (t <= stopTs[0]) {
      layerMap[layer] = stopColors[0];
      continue;
    }
    // At or after last stop
    if (t >= stopTs[nStops - 1]) {
      layerMap[layer] = stopColors[nStops - 1];
      continue;
    }

    // Find segment (search from end for last stop where t >= stop_t)
    let seg = 0;
    for (let s = nStops - 2; s >= 0; s--) {
      if (t >= stopTs[s]) {
        seg = s;
        break;
      }
    }

    const c0 = stopColors[seg];
    const c1 = stopColors[seg + 1];
    const span = stopTs[seg + 1] - stopTs[seg];

    if (span < 1e-9 || c0 === c1) {
      layerMap[layer] = c0;
      continue;
    }

    // ratio = fraction of c1 at this position
    const ratio = (t - stopTs[seg]) / span;

    // Error diffusion
    error += ratio;
    if (error >= 0.5) {
      layerMap[layer] = c1;
      error -= 1.0;
    } else {
      layerMap[layer] = c0;
    }
  }

  return layerMap;
}

/**
 * Apply a gradient palette across face layer indices.
 *
 * Uses sequential error diffusion to distribute color transitions
 * maximally apart, eliminating structural banding artifacts.
 */
export function applyGradient(
  layerIndices: Uint32Array,
  totalLayers: number,
  stops: readonly [number, number][],
): Uint8Array {
  if (stops.length < 2) {
    throw new PaletteError('Gradient requires at least 2 stops');
  }

  const layerMap = buildGradientLayerMap(totalLayers, stops);

  const n = layerIndices.length;
  const result = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const idx = Math.max(0, Math.min(layerIndices[i], totalLayers - 1));
    result[i] = layerMap[idx];
  }
  return result;
}
