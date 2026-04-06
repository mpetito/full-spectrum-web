/** Pipeline orchestration: wire all modules together. */

import type { Dither3DConfig, ColorMapping, Palette } from './config';
import { filamentToHex } from './encoding';
import type { MeshData } from './mesh';
import {
  computeRegionLayers,
  clusterFacesByFilament,
  computeCentroidsZ,
  LAYER_EPSILON_FACTOR,
} from './mesh';
import { applyCyclic, applyGradient, buildGradientLayerMap } from './palette';
import { encodeBoundaryFaces } from './subdivision';
import { encodeBoundaryFacesParallel } from './subdivision-pool';
import { read3mf, write3mf, type ThreeMFData } from './threemf';

export interface PipelineResult {
  success: boolean;
  faceCount: number;
  layerCount: number;
  filamentDistribution: Map<number, number>;
  warnings: string[];
  boundaryFaceCount: number;
  boundaryFacePct: number;
}

/** Data the shader needs to preview layer-based coloring. */
export interface LayerColorData {
  /** Layer index → 1-based filament. */
  layerFilamentMap: Map<number, number>;
  /** Global Z minimum (centroid-based, matches bisection encoding). */
  zMin: number;
  /** Layer height in model units (mm). */
  layerHeight: number;
  /** Total number of layers. */
  totalLayers: number;
}

function findMapping(
  config: Dither3DConfig,
  inputFilament: number,
): ColorMapping | undefined {
  return config.colorMappings.find((cm) => cm.inputFilament === inputFilament);
}

function defaultCyclicPalette(): Palette {
  return { type: 'cyclic', pattern: [1, 2] };
}

/**
 * Build a complete layer→filament map covering all layers from palette logic.
 *
 * Uses the same globalZMin reference as encodeBoundaryFaces so layer indices
 * are consistent between the map and the subdivision code.
 */
function buildLayerFilamentMap(
  mesh: MeshData,
  config: Dither3DConfig,
  clusters: Map<number, number[]>,
  defaultFilament: number,
): { layerMap: Map<number, number>; globalZMin: number } {
  const lh = config.layerHeightMm;
  const epsilon = lh * LAYER_EPSILON_FACTOR;

  // globalZMin must match encodeBoundaryFaces (centroid-based)
  const centroidsZ = computeCentroidsZ(mesh);
  let globalZMin = Infinity;
  for (let i = 0; i < centroidsZ.length; i++) {
    if (centroidsZ[i] < globalZMin) globalZMin = centroidsZ[i];
  }

  // Find max layer from vertex Z max
  let vertexZMax = -Infinity;
  for (let i = 2; i < mesh.vertices.length; i += 3) {
    if (mesh.vertices[i] > vertexZMax) vertexZMax = mesh.vertices[i];
  }
  const maxLayer = Math.max(0, Math.floor((vertexZMax - globalZMin + epsilon) / lh));

  // Initialize every layer to default
  const layerMap = new Map<number, number>();
  for (let layer = 0; layer <= maxLayer; layer++) {
    layerMap.set(layer, defaultFilament);
  }

  for (const [inputFil, faceIndices] of clusters) {
    const mapping = findMapping(config, inputFil);
    const palette: Palette = mapping?.outputPalette ?? defaultCyclicPalette();

    const [, regionLayers] = computeRegionLayers(
      mesh,
      config.layerHeightMm,
      faceIndices,
    );

    // Compute region offset
    const regionCentroidsZ = new Float64Array(faceIndices.length);
    for (let k = 0; k < faceIndices.length; k++) {
      const fi = faceIndices[k];
      const i3 = fi * 3;
      const v0 = mesh.faces[i3];
      const v1 = mesh.faces[i3 + 1];
      const v2 = mesh.faces[i3 + 2];
      regionCentroidsZ[k] =
        (mesh.vertices[v0 * 3 + 2] +
          mesh.vertices[v1 * 3 + 2] +
          mesh.vertices[v2 * 3 + 2]) /
        3.0;
    }
    let regionZMin = Infinity;
    for (let k = 0; k < regionCentroidsZ.length; k++) {
      if (regionCentroidsZ[k] < regionZMin) regionZMin = regionCentroidsZ[k];
    }
    const regionOffset = Math.max(
      0,
      Math.floor((regionZMin - globalZMin + epsilon) / lh),
    );

    if (palette.type === 'cyclic') {
      for (let gl = regionOffset; gl < regionOffset + regionLayers && gl <= maxLayer; gl++) {
        layerMap.set(
          gl,
          palette.pattern[(gl - regionOffset) % palette.pattern.length],
        );
      }
    } else if (palette.type === 'gradient') {
      const stops = palette.stops.map((s) => [s.t, s.filament] as [number, number]);
      const gradientMap = buildGradientLayerMap(regionLayers, stops);
      for (let gl = regionOffset; gl < regionOffset + regionLayers; gl++) {
        const localL = gl - regionOffset;
        if (localL >= 0 && localL < regionLayers) {
          layerMap.set(gl, gradientMap[localL]);
        }
      }
    }
  }

  return { layerMap, globalZMin };
}

export type ProgressCallback = (stage: string, done: number, total: number) => void;

export interface ProcessOptions {
  flatten?: boolean;
  dryRun?: boolean;
  progressCallback?: ProgressCallback;
  signal?: AbortSignal;
  filamentColors?: string[];
  pipelineConfig?: Record<string, unknown>;
}

/**
 * Run the Dither3D pipeline on a 3MF ArrayBuffer.
 *
 * @param inputData Raw 3MF file bytes
 * @param config Palette configuration
 * @param options Processing options
 * @returns [result, outputBytes] where outputBytes is undefined for dry runs
 */
export function process(
  inputData: ArrayBuffer,
  config: Dither3DConfig,
  options?: ProcessOptions,
): [PipelineResult, Uint8Array | undefined, LayerColorData] {
  const flatten = options?.flatten ?? false;
  const dryRun = options?.dryRun ?? false;
  const progressCallback = options?.progressCallback;
  const warnings: string[] = [];

  // Step 1: Load 3MF
  const data3mf: ThreeMFData = read3mf(inputData, flatten);
  const nFaces = data3mf.faceCount;
  const defaultFilament = data3mf.defaultFilament;

  const mesh: MeshData = {
    vertices: data3mf.vertices,
    faces: data3mf.faces,
    vertexCount: data3mf.vertexCount,
    faceCount: data3mf.faceCount,
  };

  // Step 2: Cluster faces by input filament
  const clusters = clusterFacesByFilament(data3mf.faceColors, nFaces, defaultFilament);

  // Step 3: Apply palette to each cluster
  const faceFilaments = new Uint32Array(nFaces);
  faceFilaments.fill(defaultFilament);
  let totalLayerCount = 0;

  for (const [inputFil, faceIndices] of clusters) {
    const mapping = findMapping(config, inputFil);
    let palette: Palette;

    if (!mapping) {
      palette = defaultCyclicPalette();
      warnings.push(
        `No mapping for input filament ${inputFil}; using default cyclic [1, 2]`,
      );
    } else {
      palette = mapping.outputPalette;
    }

    const [layerIndices, regionLayers] = computeRegionLayers(
      mesh,
      config.layerHeightMm,
      faceIndices,
    );
    totalLayerCount = Math.max(totalLayerCount, regionLayers);

    let assigned: Uint8Array;
    if (palette.type === 'cyclic') {
      assigned = applyCyclic(layerIndices, palette.pattern);
    } else if (palette.type === 'gradient') {
      const stops = palette.stops.map((s) => [s.t, s.filament] as [number, number]);
      assigned = applyGradient(layerIndices, regionLayers, stops);
    } else {
      warnings.push(`Unknown palette type for filament ${inputFil}; skipping`);
      continue;
    }

    for (let k = 0; k < faceIndices.length; k++) {
      faceFilaments[faceIndices[k]] = assigned[k];
    }
  }

  // Step 4: Compute distribution
  const distribution = new Map<number, number>();
  for (let i = 0; i < nFaces; i++) {
    const f = faceFilaments[i];
    distribution.set(f, (distribution.get(f) ?? 0) + 1);
  }

  // Step 5: Convert to hex strings
  const faceHex: string[] = new Array(nFaces);
  for (let i = 0; i < nFaces; i++) {
    const fil = faceFilaments[i];
    faceHex[i] = fil === defaultFilament ? '' : filamentToHex(fil);
  }

  // Build layer → filament map (used for bisection encoding + preview shader)
  const { layerMap: layerFilamentMap, globalZMin: syncZMin } = buildLayerFilamentMap(
    mesh,
    config,
    clusters,
    defaultFilament,
  );

  // Step 6: Bisection encoding for boundary faces
  let boundaryFaceCount = 0;
  if (config.boundarySplit && config.boundaryStrategy === 'bisection') {
    const boundaryProgress = progressCallback
      ? (done: number, total: number) => progressCallback('bisection', done, total)
      : undefined;

    const boundaryHex = encodeBoundaryFaces(mesh, faceFilaments, config.layerHeightMm, {
      maxDepth: config.maxSplitDepth,
      progressCallback: boundaryProgress,
      layerFilamentMap,
    });

    for (const [faceIdx, hexStr] of boundaryHex) {
      faceHex[faceIdx] = hexStr;
    }
    boundaryFaceCount = boundaryHex.size;
  }

  const boundaryFacePct = nFaces > 0 ? (boundaryFaceCount / nFaces) * 100.0 : 0.0;

  // Step 7: Write output
  let outputBytes: Uint8Array | undefined;
  if (!dryRun) {
    outputBytes = write3mf(
      data3mf.vertices,
      data3mf.faces,
      data3mf.vertexCount,
      data3mf.faceCount,
      faceHex,
      defaultFilament,
      config.targetFormat,
      {
        config: options?.pipelineConfig,
        filamentColors: options?.filamentColors,
        layerHeight: config.layerHeightMm,
      },
    );
  }

  const layerColorData: LayerColorData = {
    layerFilamentMap,
    zMin: syncZMin,
    layerHeight: config.layerHeightMm,
    totalLayers: layerFilamentMap.size,
  };

  const result: PipelineResult = {
    success: true,
    faceCount: nFaces,
    layerCount: totalLayerCount,
    filamentDistribution: distribution,
    warnings,
    boundaryFaceCount,
    boundaryFacePct,
  };

  return [result, outputBytes, layerColorData];
}

/**
 * Async variant of {@link process} that uses Web Workers for bisection encoding.
 *
 * Identical to `process()` except the bisection step calls
 * `encodeBoundaryFacesParallel` for parallel execution.
 */
export async function processAsync(
  inputData: ArrayBuffer,
  config: Dither3DConfig,
  options?: ProcessOptions,
): Promise<[PipelineResult, Uint8Array | undefined, LayerColorData]> {
  const flatten = options?.flatten ?? false;
  const dryRun = options?.dryRun ?? false;
  const progressCallback = options?.progressCallback;
  const signal = options?.signal;
  const warnings: string[] = [];

  // Step 1: Load 3MF
  const data3mf: ThreeMFData = read3mf(inputData, flatten);
  const nFaces = data3mf.faceCount;
  const defaultFilament = data3mf.defaultFilament;

  const mesh: MeshData = {
    vertices: data3mf.vertices,
    faces: data3mf.faces,
    vertexCount: data3mf.vertexCount,
    faceCount: data3mf.faceCount,
  };

  // Step 2: Cluster faces by input filament
  const clusters = clusterFacesByFilament(data3mf.faceColors, nFaces, defaultFilament);

  // Step 3: Apply palette to each cluster
  const faceFilaments = new Uint32Array(nFaces);
  faceFilaments.fill(defaultFilament);
  let totalLayerCount = 0;

  for (const [inputFil, faceIndices] of clusters) {
    const mapping = findMapping(config, inputFil);
    let palette: Palette;

    if (!mapping) {
      palette = defaultCyclicPalette();
      warnings.push(
        `No mapping for input filament ${inputFil}; using default cyclic [1, 2]`,
      );
    } else {
      palette = mapping.outputPalette;
    }

    const [layerIndices, regionLayers] = computeRegionLayers(
      mesh,
      config.layerHeightMm,
      faceIndices,
    );
    totalLayerCount = Math.max(totalLayerCount, regionLayers);

    let assigned: Uint8Array;
    if (palette.type === 'cyclic') {
      assigned = applyCyclic(layerIndices, palette.pattern);
    } else if (palette.type === 'gradient') {
      const stops = palette.stops.map((s) => [s.t, s.filament] as [number, number]);
      assigned = applyGradient(layerIndices, regionLayers, stops);
    } else {
      warnings.push(`Unknown palette type for filament ${inputFil}; skipping`);
      continue;
    }

    for (let k = 0; k < faceIndices.length; k++) {
      faceFilaments[faceIndices[k]] = assigned[k];
    }
  }

  // Step 4: Compute distribution
  const distribution = new Map<number, number>();
  for (let i = 0; i < nFaces; i++) {
    const f = faceFilaments[i];
    distribution.set(f, (distribution.get(f) ?? 0) + 1);
  }

  // Step 5: Convert to hex strings
  const faceHex: string[] = new Array(nFaces);
  for (let i = 0; i < nFaces; i++) {
    const fil = faceFilaments[i];
    faceHex[i] = fil === defaultFilament ? '' : filamentToHex(fil);
  }

  // Build layer → filament map (used for bisection encoding + preview shader)
  const { layerMap: layerFilamentMap, globalZMin: asyncZMin } = buildLayerFilamentMap(
    mesh,
    config,
    clusters,
    defaultFilament,
  );

  // Step 6: Bisection encoding for boundary faces (parallel)
  signal?.throwIfAborted();
  let boundaryFaceCount = 0;
  if (config.boundarySplit && config.boundaryStrategy === 'bisection') {
    const boundaryProgress = progressCallback
      ? (done: number, total: number) => progressCallback('bisection', done, total)
      : undefined;

    const boundaryHex = await encodeBoundaryFacesParallel(
      mesh,
      faceFilaments,
      config.layerHeightMm,
      {
        maxDepth: config.maxSplitDepth,
        progressCallback: boundaryProgress,
        layerFilamentMap,
        signal,
      },
    );

    for (const [faceIdx, hexStr] of boundaryHex) {
      faceHex[faceIdx] = hexStr;
    }
    boundaryFaceCount = boundaryHex.size;
  }

  const boundaryFacePct = nFaces > 0 ? (boundaryFaceCount / nFaces) * 100.0 : 0.0;

  // Step 7: Write output
  signal?.throwIfAborted();
  let outputBytes: Uint8Array | undefined;
  if (!dryRun) {
    outputBytes = write3mf(
      data3mf.vertices,
      data3mf.faces,
      data3mf.vertexCount,
      data3mf.faceCount,
      faceHex,
      defaultFilament,
      config.targetFormat,
      {
        config: options?.pipelineConfig,
        filamentColors: options?.filamentColors,
        layerHeight: config.layerHeightMm,
      },
    );
  }

  const layerColorData: LayerColorData = {
    layerFilamentMap,
    zMin: asyncZMin,
    layerHeight: config.layerHeightMm,
    totalLayers: layerFilamentMap.size,
  };

  const result: PipelineResult = {
    success: true,
    faceCount: nFaces,
    layerCount: totalLayerCount,
    filamentDistribution: distribution,
    warnings,
    boundaryFaceCount,
    boundaryFacePct,
  };

  return [result, outputBytes, layerColorData];
}
