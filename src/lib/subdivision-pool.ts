/** Worker pool manager for parallel bisection encoding. */

import type { MeshData } from './mesh';
import { computeCentroidsZ, computeFaceLayers, LAYER_EPSILON_FACTOR } from './mesh';
import { findBoundaryFaces, encodeBoundaryFaces } from './subdivision';

export interface PoolOptions {
    maxDepth?: number;
    progressCallback?: (done: number, total: number) => void;
    layerFilamentMap?: Map<number, number>;
}

/**
 * Encode boundary faces using a pool of Web Workers for parallelism.
 *
 * Falls back to serial {@link encodeBoundaryFaces} when fewer than 100 boundary
 * faces exist or when only one hardware thread is available.
 */
export async function encodeBoundaryFacesParallel(
    mesh: MeshData,
    faceFilaments: Uint32Array,
    layerHeight: number,
    options?: PoolOptions,
): Promise<Map<number, string>> {
    const maxDepth = options?.maxDepth ?? 9;
    const progressCallback = options?.progressCallback;

    // ---- Shared setup (mirrors serial encodeBoundaryFaces) ----

    const centroidsZ = computeCentroidsZ(mesh);
    let globalZMin = Infinity;
    for (let i = 0; i < centroidsZ.length; i++) {
        if (centroidsZ[i] < globalZMin) globalZMin = centroidsZ[i];
    }

    const layerIndices = computeFaceLayers(mesh, layerHeight);

    // Build layer→filament map if not provided
    let layerFilamentMap = options?.layerFilamentMap;
    if (!layerFilamentMap) {
        layerFilamentMap = new Map<number, number>();
        const layerBuckets = new Map<number, Map<number, number>>();
        for (let i = 0; i < mesh.faceCount; i++) {
            const layer = layerIndices[i];
            const fil = faceFilaments[i];
            let counts = layerBuckets.get(layer);
            if (!counts) {
                counts = new Map<number, number>();
                layerBuckets.set(layer, counts);
            }
            counts.set(fil, (counts.get(fil) ?? 0) + 1);
        }
        layerBuckets.forEach((counts, layer) => {
            let bestFil = 0;
            let bestCount = -1;
            counts.forEach((count, fil) => {
                if (count > bestCount) {
                    bestCount = count;
                    bestFil = fil;
                }
            });
            layerFilamentMap!.set(layer, bestFil);
        });
    }

    // Default filament = overall mode
    const overallCounts = new Map<number, number>();
    for (let i = 0; i < faceFilaments.length; i++) {
        const f = faceFilaments[i];
        overallCounts.set(f, (overallCounts.get(f) ?? 0) + 1);
    }
    let defaultFilament = 0;
    let bestCount = -1;
    overallCounts.forEach((count, fil) => {
        if (count > bestCount) {
            bestCount = count;
            defaultFilament = fil;
        }
    });

    // Identify boundary faces
    const boundaryMask = findBoundaryFaces(mesh, layerIndices, layerHeight, globalZMin);
    const boundaryIndices: number[] = [];
    for (let i = 0; i < mesh.faceCount; i++) {
        if (boundaryMask[i]) boundaryIndices.push(i);
    }

    const workerCount = Math.min(
        typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4,
        8,
    );

    // Fall back to serial for small workloads or single thread
    if (boundaryIndices.length < 100 || workerCount <= 1) {
        return encodeBoundaryFaces(mesh, faceFilaments, layerHeight, {
            maxDepth,
            progressCallback,
            layerFilamentMap,
        });
    }

    // ---- Parallel path ----

    const epsilon = layerHeight * LAYER_EPSILON_FACTOR;
    const filamentEntries: [number, number][] = [...layerFilamentMap.entries()];

    // Split boundary indices into roughly equal chunks
    const chunkSize = Math.ceil(boundaryIndices.length / workerCount);
    const chunks: number[][] = [];
    for (let i = 0; i < boundaryIndices.length; i += chunkSize) {
        chunks.push(boundaryIndices.slice(i, i + chunkSize));
    }

    const totalBoundary = boundaryIndices.length;
    let completedFaces = 0;

    const merged = new Map<number, string>();

    const promises = chunks.map((chunk) => {
        return new Promise<void>((resolve, reject) => {
            const worker = new Worker(
                new URL('./workers/subdivision.worker.ts', import.meta.url),
                { type: 'module' },
            );

            worker.onmessage = (e: MessageEvent<{ results: [number, string][] }>) => {
                for (const [faceIdx, hexStr] of e.data.results) {
                    merged.set(faceIdx, hexStr);
                }
                completedFaces += chunk.length;
                if (progressCallback) {
                    progressCallback(completedFaces, totalBoundary);
                }
                worker.terminate();
                resolve();
            };

            worker.onerror = (err) => {
                worker.terminate();
                reject(new Error(`Subdivision worker error: ${err.message}`));
            };

            worker.postMessage({
                vertices: mesh.vertices,
                faces: mesh.faces,
                boundaryIndices: chunk,
                layerHeight,
                globalZMin,
                filamentByLayer: filamentEntries,
                defaultFilament,
                maxDepth,
                epsilon,
            });
        });
    });

    await Promise.all(promises);
    return merged;
}
