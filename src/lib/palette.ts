/**
 * Cyclic and gradient dithering algorithm implementations.
 *
 * Gradient dithering uses sequential error diffusion to distribute
 * minority-color layers maximally apart, eliminating structural banding.
 */

import type { Palette, CyclicPalette, GradientPalette, GradientStop } from './config';
import { MAX_FILAMENTS } from './encoding';

export class PaletteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaletteError';
  }
}

/** Strategy for a single palette type. */
export interface PaletteStrategy<T extends Palette = Palette> {
  readonly type: string;
  /** Apply palette to face layer indices for a single cluster. */
  apply(layerIndices: Uint32Array, regionLayers: number, palette: T): Uint8Array;
  /** Build a layer→filament map for a single cluster (for boundary encoding). */
  buildLayerMap(regionLayers: number, palette: T): Uint8Array;
  /** Validate palette-specific config; throw PaletteError on failure. */
  validate(palette: T, mappingIndex: number): void;
  /** Serialize palette to JSON-safe object. */
  toJson(palette: T): Record<string, unknown>;
  /** Parse raw config object into typed palette. */
  parse(raw: Record<string, unknown>): T;
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

// --- Palette Strategy Registry ---

const cyclicStrategy: PaletteStrategy<CyclicPalette> = {
  type: 'cyclic',
  apply(layerIndices, _regionLayers, palette) {
    return applyCyclic(layerIndices, palette.pattern);
  },
  buildLayerMap(regionLayers, palette) {
    const map = new Uint8Array(regionLayers);
    for (let i = 0; i < regionLayers; i++) {
      map[i] = palette.pattern[i % palette.pattern.length];
    }
    return map;
  },
  validate(palette, mappingIndex) {
    for (let j = 0; j < palette.pattern.length; j++) {
      if (palette.pattern[j] < 1 || palette.pattern[j] > MAX_FILAMENTS) {
        throw new PaletteError(
          `color_mappings[${mappingIndex}].pattern[${j}]: filament ${palette.pattern[j]} outside range [1, ${MAX_FILAMENTS}]`,
        );
      }
    }
  },
  toJson(palette) {
    return { type: 'cyclic', pattern: [...palette.pattern] };
  },
  parse(raw) {
    const pattern = raw['pattern'];
    if (!Array.isArray(pattern) || pattern.length === 0) {
      throw new PaletteError("Cyclic palette requires non-empty 'pattern' list");
    }
    for (let i = 0; i < pattern.length; i++) {
      if (typeof pattern[i] !== 'number' || !Number.isInteger(pattern[i])) {
        throw new PaletteError(`Cyclic pattern[${i}]: expected integer, got ${typeof pattern[i]}`);
      }
    }
    return { type: 'cyclic', pattern: pattern as number[] };
  },
};

const gradientStrategy: PaletteStrategy<GradientPalette> = {
  type: 'gradient',
  apply(layerIndices, regionLayers, palette) {
    const stops = palette.stops.map((s) => [s.t, s.filament] as [number, number]);
    return applyGradient(layerIndices, regionLayers, stops);
  },
  buildLayerMap(regionLayers, palette) {
    const stops = palette.stops.map((s) => [s.t, s.filament] as [number, number]);
    return buildGradientLayerMap(regionLayers, stops);
  },
  validate(palette, mappingIndex) {
    if (palette.stops.length < 2) {
      throw new PaletteError(`color_mappings[${mappingIndex}]: gradient requires at least 2 stops`);
    }
    for (let j = 1; j < palette.stops.length; j++) {
      if (palette.stops[j].t < palette.stops[j - 1].t) {
        throw new PaletteError(`color_mappings[${mappingIndex}]: gradient stops not sorted by t`);
      }
    }
    for (let j = 0; j < palette.stops.length; j++) {
      const stop = palette.stops[j];
      if (stop.t < 0.0 || stop.t > 1.0) {
        throw new PaletteError(
          `color_mappings[${mappingIndex}].stops[${j}]: t=${stop.t} outside [0.0, 1.0]`,
        );
      }
      if (stop.filament < 1 || stop.filament > MAX_FILAMENTS) {
        throw new PaletteError(
          `color_mappings[${mappingIndex}].stops[${j}]: filament ${stop.filament} outside range [1, ${MAX_FILAMENTS}]`,
        );
      }
    }
  },
  toJson(palette) {
    return { type: 'gradient', stops: palette.stops.map((s) => [s.t, s.filament]) };
  },
  parse(raw) {
    const rawStops = raw['stops'];
    if (!Array.isArray(rawStops) || rawStops.length < 2) {
      throw new PaletteError('Gradient palette requires at least 2 stops');
    }
    const stops: GradientStop[] = [];
    for (let i = 0; i < rawStops.length; i++) {
      const s = rawStops[i];
      if (!Array.isArray(s) || s.length !== 2) {
        throw new PaletteError(`Gradient stop ${i} must be in format [t, filament]`);
      }
      if (typeof s[0] !== 'number') {
        throw new PaletteError(`Gradient stop ${i}: t must be a number, got ${typeof s[0]}`);
      }
      if (typeof s[1] !== 'number' || !Number.isInteger(s[1])) {
        throw new PaletteError(`Gradient stop ${i}: filament must be an integer, got ${typeof s[1]}`);
      }
      stops.push({ t: s[0] as number, filament: s[1] as number });
    }
    return { type: 'gradient', stops };
  },
};

const strategies = new Map<string, PaletteStrategy>();

export function registerPalette(strategy: PaletteStrategy): void {
  strategies.set(strategy.type, strategy);
}

export function getPaletteStrategy(type: string): PaletteStrategy {
  const strategy = strategies.get(type);
  if (!strategy) throw new PaletteError(`Unknown palette type: '${type}'`);
  return strategy;
}

/** Get all registered palette type names. */
export function getPaletteTypes(): string[] {
  return [...strategies.keys()];
}

// Register built-in palette strategies
registerPalette(cyclicStrategy as PaletteStrategy);
registerPalette(gradientStrategy as PaletteStrategy);
