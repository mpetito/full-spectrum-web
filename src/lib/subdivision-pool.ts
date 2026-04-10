/** Worker pool manager for parallel bisection encoding. */

import type { MeshData } from './mesh';
import { MIN_ABSOLUTE_EPSILON } from '../constants';
import { LAYER_EPSILON_FACTOR } from './mesh';
import { encodeBoundaryFaces, prepareBoundaryContext } from './subdivision';

export interface PoolOptions {
    maxDepth?: number;
    progressCallback?: (done: number, total: number) => void;
    clusterLayerMaps: Uint8Array[];
    faceClusterIndex: Uint16Array;
    signal?: AbortSignal;
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
    options: PoolOptions,
): Promise<Map<number, string>> {
    const maxDepth = options.maxDepth ?? 9;
    const progressCallback = options.progressCallback;

    // ---- Shared setup (via prepareBoundaryContext) ----

    const { globalZMin, boundaryMask } =
        prepareBoundaryContext(mesh, layerHeight);

    const { clusterLayerMaps, faceClusterIndex } = options;

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

    // Identify boundary faces (from prepareBoundaryContext)
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
            clusterLayerMaps,
            faceClusterIndex,
        });
    }

    // ---- Parallel path ----

    const epsilon = Math.max(layerHeight * LAYER_EPSILON_FACTOR, MIN_ABSOLUTE_EPSILON);

    // Convert cluster data for worker transfer (plain arrays)
    const clusterMapsForWorker = clusterLayerMaps.map(m => Array.from(m));
    const faceClusterArray = Array.from(faceClusterIndex);

    // Split boundary indices into roughly equal chunks
    const chunkSize = Math.ceil(boundaryIndices.length / workerCount);
    const chunks: number[][] = [];
    for (let i = 0; i < boundaryIndices.length; i += chunkSize) {
        chunks.push(boundaryIndices.slice(i, i + chunkSize));
    }

    const totalBoundary = boundaryIndices.length;
    let completedFaces = 0;

    const merged = new Map<number, string>();

    const signal = options.signal;
    const workers: Worker[] = [];
    let aborted = false;

    // If the caller aborts, terminate all live workers immediately
    const onAbort = signal ? () => {
        aborted = true;
        for (const w of workers) {
            w.terminate();
        }
    } : undefined;
    if (signal && onAbort) {
        signal.addEventListener('abort', onAbort, { once: true });
    }

    const promises = chunks.map((chunk) => {
        return new Promise<void>((resolve, reject) => {
            if (aborted) { resolve(); return; }

            const worker = new Worker(
                new URL('./workers/subdivision.worker.ts', import.meta.url),
                { type: 'module' },
            );
            workers.push(worker);

            worker.onmessage = (e: MessageEvent<{ results: [number, string][] }>) => {
                if (!aborted) {
                    for (const [faceIdx, hexStr] of e.data.results) {
                        merged.set(faceIdx, hexStr);
                    }
                    completedFaces += chunk.length;
                    if (progressCallback) {
                        progressCallback(completedFaces, totalBoundary);
                    }
                }
                worker.terminate();
                resolve();
            };

            worker.onerror = (err) => {
                worker.terminate();
                if (aborted) { resolve(); return; }
                reject(new Error(`Subdivision worker error: ${err.message}`));
            };

            worker.postMessage({
                vertices: mesh.vertices,
                faces: mesh.faces,
                boundaryIndices: chunk,
                layerHeight,
                globalZMin,
                clusterLayerMaps: clusterMapsForWorker,
                faceClusterIndex: faceClusterArray,
                defaultFilament,
                maxDepth,
                epsilon,
            });
        });
    });

    await Promise.all(promises);

    // Clean up abort listener if we finished normally
    if (signal && onAbort) {
        signal.removeEventListener('abort', onAbort);
    }

    signal?.throwIfAborted();
    return merged;
}
