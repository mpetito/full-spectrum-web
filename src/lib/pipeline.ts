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
import { MIN_ABSOLUTE_EPSILON } from '../constants';
import { getPaletteStrategy } from './palette';
import { encodeBoundaryFaces, type EncodeBoundaryOptions } from './subdivision';
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

/** Injected bisection strategy — sync returns Map, async returns Promise<Map>. */
export type BisectionStrategy = (
  mesh: MeshData,
  faceFilaments: Uint32Array,
  layerHeight: number,
  options: EncodeBoundaryOptions & { signal?: AbortSignal },
) => Promise<Map<number, string>> | Map<number, string>;

/** Data needed by the preview shader and boundary encoding. */
export interface LayerColorData {
  /** Per-cluster layer→filament arrays, indexed by cluster index. Each Uint8Array is totalLayers long. */
  clusterLayerMaps: Uint8Array[];
  /** Face index → cluster index. */
  faceClusterIndex: Uint16Array;
  /** Global Z minimum (centroid-based, matches bisection encoding). */
  zMin: number;
  /** Layer height in model units (mm). */
  layerHeight: number;
  /** Total number of layers. */
  totalLayers: number;
  /** Number of clusters (= clusterLayerMaps.length). */
  clusterCount: number;
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

export interface ClusterInfo {
  palette: Palette;
  regionLayers: number;
  faceIndices: number[];
}

/**
 * Build per-cluster layer→filament arrays and compute global geometry bounds.
 *
 * Each cluster gets a `totalLayers`-length Uint8Array filled with `defaultFilament`,
 * then overwritten at the cluster's Z range with palette-generated values.
 */
export function buildClusterLayerData(
  mesh: MeshData,
  layerHeight: number,
  clusterInfos: ClusterInfo[],
  defaultFilament: number,
): { clusterLayerMaps: Uint8Array[]; globalZMin: number; totalLayers: number } {
  const epsilon = Math.max(layerHeight * LAYER_EPSILON_FACTOR, MIN_ABSOLUTE_EPSILON);

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
  const totalLayers = Math.max(1, Math.floor((vertexZMax - globalZMin + epsilon) / layerHeight) + 1);

  // Guard: if no clusters, return a single-cluster map filled with the default filament
  if (clusterInfos.length === 0) {
    const map = new Uint8Array(totalLayers);
    map.fill(defaultFilament);
    return { clusterLayerMaps: [map], globalZMin, totalLayers };
  }

  const clusterLayerMaps: Uint8Array[] = [];

  for (const info of clusterInfos) {
    const map = new Uint8Array(totalLayers);
    map.fill(defaultFilament);

    // Compute region offset from cluster face centroids
    const { vertices, faces } = mesh;
    let regionZMin = Infinity;
    for (const fi of info.faceIndices) {
      const i3 = fi * 3;
      const v0 = faces[i3];
      const v1 = faces[i3 + 1];
      const v2 = faces[i3 + 2];
      const cz =
        (vertices[v0 * 3 + 2] + vertices[v1 * 3 + 2] + vertices[v2 * 3 + 2]) / 3.0;
      if (cz < regionZMin) regionZMin = cz;
    }
    const regionOffset = Math.max(
      0,
      Math.floor((regionZMin - globalZMin + epsilon) / layerHeight),
    );

    const strategy = getPaletteStrategy(info.palette.type);
    const layerValues = strategy.buildLayerMap(info.regionLayers, info.palette);
    for (let gl = regionOffset; gl < regionOffset + info.regionLayers && gl < totalLayers; gl++) {
      const localL = gl - regionOffset;
      if (localL < layerValues.length) {
        map[gl] = layerValues[localL];
      }
    }

    clusterLayerMaps.push(map);
  }

  return { clusterLayerMaps, globalZMin, totalLayers };
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
 * @returns [result, outputBytes, layerColorData] where outputBytes is undefined for dry runs
 */
export function process(
  inputData: ArrayBuffer,
  config: Dither3DConfig,
  options?: ProcessOptions,
): Promise<[PipelineResult, Uint8Array | undefined, LayerColorData]> {
  return runPipeline(inputData, config, options, syncStrategy);
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
  return runPipeline(inputData, config, options, asyncStrategy);
}

/** Sync bisection strategy — wraps `encodeBoundaryFaces`. */
const syncStrategy: BisectionStrategy = (mesh, faceFilaments, layerHeight, opts) =>
  encodeBoundaryFaces(mesh, faceFilaments, layerHeight, opts);

/** Async bisection strategy — wraps `encodeBoundaryFacesParallel`. */
const asyncStrategy: BisectionStrategy = (mesh, faceFilaments, layerHeight, opts) =>
  encodeBoundaryFacesParallel(mesh, faceFilaments, layerHeight, opts);

/**
 * Shared pipeline body used by both `process()` and `processAsync()`.
 *
 * Steps 1–5 (load, cluster, palette, distribution, hex) are identical.
 * Step 6 (bisection encoding) delegates to the injected `bisectionStrategy`.
 * Step 7 (3MF write) is shared.
 */
async function runPipeline(
  inputData: ArrayBuffer,
  config: Dither3DConfig,
  options: ProcessOptions | undefined,
  bisectionStrategy: BisectionStrategy,
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
  const faceClusterIndex = new Uint16Array(nFaces);
  const clusterInfos: ClusterInfo[] = [];
  let clusterIdx = 0;

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

    const strategy = getPaletteStrategy(palette.type);
    const assigned = strategy.apply(layerIndices, regionLayers, palette);

    for (let k = 0; k < faceIndices.length; k++) {
      faceFilaments[faceIndices[k]] = assigned[k];
    }

    for (let k = 0; k < faceIndices.length; k++) {
      faceClusterIndex[faceIndices[k]] = clusterIdx;
    }
    clusterInfos.push({ palette, regionLayers, faceIndices });
    clusterIdx++;
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

  // Build per-cluster layer→filament data (used for bisection encoding + preview shader)
  const { clusterLayerMaps, globalZMin, totalLayers: globalTotalLayers } = buildClusterLayerData(
    mesh,
    config.layerHeightMm,
    clusterInfos,
    defaultFilament,
  );

  // Step 6: Bisection encoding for boundary faces (via injected strategy)
  signal?.throwIfAborted();
  let boundaryFaceCount = 0;
  if (config.boundarySplit && config.boundaryStrategy === 'bisection') {
    const boundaryProgress = progressCallback
      ? (done: number, total: number) => progressCallback('bisection', done, total)
      : undefined;

    const boundaryHex = await bisectionStrategy(
      mesh,
      faceFilaments,
      config.layerHeightMm,
      {
        maxDepth: config.maxSplitDepth,
        progressCallback: boundaryProgress,
        clusterLayerMaps,
        faceClusterIndex,
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
    clusterLayerMaps,
    faceClusterIndex,
    zMin: globalZMin,
    layerHeight: config.layerHeightMm,
    totalLayers: globalTotalLayers,
    clusterCount: clusterLayerMaps.length,
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
