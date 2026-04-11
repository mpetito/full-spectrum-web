/** Boundary face detection and recursive bisection encoding (serial only). */

import { MIN_ABSOLUTE_EPSILON } from '../constants';
import { LAYER_EPSILON_FACTOR, computeCentroidsZ } from './mesh';
import type { MeshData } from './mesh';

const HEX_CHARS = '0123456789ABCDEF';

/** 3D vertex tuple. */
export type Vert3 = [number, number, number];

/**
 * Identify faces whose vertex Z-span crosses their assigned layer band.
 *
 * @returns boolean array of length faceCount — true for boundary faces.
 */
export function findBoundaryFaces(
    mesh: MeshData,
    layerIndices: Uint32Array,
    layerHeight: number,
    globalZMin: number,
): boolean[] {
    const { vertices, faces, faceCount } = mesh;
    const epsilon = Math.max(layerHeight * LAYER_EPSILON_FACTOR, MIN_ABSOLUTE_EPSILON);
    const result: boolean[] = new Array(faceCount);

    for (let i = 0; i < faceCount; i++) {
        const i3 = i * 3;
        const v0z = vertices[faces[i3] * 3 + 2];
        const v1z = vertices[faces[i3 + 1] * 3 + 2];
        const v2z = vertices[faces[i3 + 2] * 3 + 2];

        const zMin = Math.min(v0z, v1z, v2z);
        const zMax = Math.max(v0z, v1z, v2z);

        const bandLow = globalZMin + layerIndices[i] * layerHeight;
        const bandHigh = bandLow + layerHeight;

        result[i] = zMin < bandLow - epsilon || zMax > bandHigh + epsilon;
    }
    return result;
}

/** Subdivider closure type: returns leaf state (>=0) or -1 if split. */
export type SubdivideFn = (
    z0: number, z1: number, z2: number,
    v0: Vert3, v1: Vert3, v2: Vert3,
    depth: number,
    nibbles: number[],
    faceIdx: number,
) => number;

/**
 * Create a closure that subdivides one face directly to nibbles (no tree objects).
 * The closure captures layer parameters to avoid passing them through every recursive call.
 */
export function makeSubdivider(
    layerHeight: number,
    globalZMin: number,
    clusterLayerMaps: Uint8Array[],
    faceClusterIndex: Uint16Array,
    defaultFilament: number,
    epsilon: number,
): SubdivideFn {
    const invLh = 1.0 / layerHeight;
    const limitSq = layerHeight * layerHeight;

    function subdivide(
        z0: number, z1: number, z2: number,
        v0: Vert3, v1: Vert3, v2: Vert3,
        depth: number,
        nibbles: number[],
        faceIdx: number,
    ): number {
        // min/max z (branchless-style)
        let zLo: number;
        if (z0 <= z1) {
            zLo = z0 <= z2 ? z0 : z2;
        } else {
            zLo = z1 <= z2 ? z1 : z2;
        }
        let zHi: number;
        if (z0 >= z1) {
            zHi = z0 >= z2 ? z0 : z2;
        } else {
            zHi = z1 >= z2 ? z1 : z2;
        }

        const layerLoF = (zLo - globalZMin + epsilon) * invLh;
        const layerLo = layerLoF < 0 ? 0 : Math.floor(layerLoF);
        const layerHiF = (zHi - globalZMin + epsilon) * invLh;
        const layerHi = layerHiF < 0 ? 0 : Math.floor(layerHiF);

        // Leaf: all vertices in same layer
        if (layerLo === layerHi) {
            const layerMap = clusterLayerMaps[faceClusterIndex[faceIdx]];
            const state = layerLo < layerMap.length ? layerMap[layerLo] : defaultFilament;
            if (state <= 2) {
                nibbles.push(state << 2);
            } else {
                nibbles.push(0xC);
                nibbles.push(state - 3);
            }
            return state;
        }

        // Depth cap: assign based on centroid
        if (depth <= 0) {
            const centroidZ = (z0 + z1 + z2) / 3.0;
            const clF = (centroidZ - globalZMin + epsilon) * invLh;
            const cl = clF < 0 ? 0 : Math.floor(clF);
            const layerMap = clusterLayerMaps[faceClusterIndex[faceIdx]];
            const state = cl < layerMap.length ? layerMap[cl] : defaultFilament;
            if (state <= 2) {
                nibbles.push(state << 2);
            } else {
                nibbles.push(0xC);
                nibbles.push(state - 3);
            }
            return state;
        }

        const nd = depth - 1;

        // 3D edge length squared
        const d0x = v1[0] - v0[0]; const d0y = v1[1] - v0[1]; const d0z = v1[2] - v0[2];
        const d1x = v2[0] - v1[0]; const d1y = v2[1] - v1[1]; const d1z = v2[2] - v1[2];
        const d2x = v0[0] - v2[0]; const d2y = v0[1] - v2[1]; const d2z = v0[2] - v2[2];
        const lenSq0 = d0x * d0x + d0y * d0y + d0z * d0z;
        const lenSq1 = d1x * d1x + d1y * d1y + d1z * d1z;
        const lenSq2 = d2x * d2x + d2y * d2y + d2z * d2z;

        const long0 = lenSq0 > limitSq;
        const long1 = lenSq1 > limitSq;
        const long2 = lenSq2 > limitSq;
        const nLong = (long0 ? 1 : 0) + (long1 ? 1 : 0) + (long2 ? 1 : 0);

        // Z-span squared per edge (for edge selection in 2-split)
        const dzSq0 = d0z * d0z; // edge 0: v0→v1
        const dzSq1 = d1z * d1z; // edge 1: v1→v2
        const dzSq2 = d2z * d2z; // edge 2: v2→v0

        if (nLong === 3) {
            // 3-split: bisect all 3 edges, 4 children
            const m01z = (z0 + z1) * 0.5;
            const m12z = (z1 + z2) * 0.5;
            const m20z = (z2 + z0) * 0.5;
            const m01: Vert3 = [(v0[0] + v1[0]) * 0.5, (v0[1] + v1[1]) * 0.5, m01z];
            const m12: Vert3 = [(v1[0] + v2[0]) * 0.5, (v1[1] + v2[1]) * 0.5, m12z];
            const m20: Vert3 = [(v2[0] + v0[0]) * 0.5, (v2[1] + v0[1]) * 0.5, m20z];

            // Reserve slot for split nibble
            const splitPos = nibbles.length;
            nibbles.push(0);

            // DFS children in reverse: c3, c2, c1, c0
            const s3 = subdivide(m01z, m12z, m20z, m01, m12, m20, nd, nibbles, faceIdx);
            const s2 = subdivide(m12z, z2, m20z, m12, v2, m20, nd, nibbles, faceIdx);
            const s1 = subdivide(m01z, z1, m12z, m01, v1, m12, nd, nibbles, faceIdx);
            const s0 = subdivide(z0, m01z, m20z, v0, m01, m20, nd, nibbles, faceIdx);

            // Collapse if all children are identical leaves
            if (s0 >= 0 && s0 === s1 && s1 === s2 && s2 === s3) {
                nibbles.length = splitPos;
                if (s0 <= 2) {
                    nibbles.push(s0 << 2);
                } else {
                    nibbles.push(0xC);
                    nibbles.push(s0 - 3);
                }
                return s0;
            }

            nibbles[splitPos] = 3; // (0 << 2) | 3
            return -1;
        }

        if (nLong >= 1) {
            // 2-split: keep the most horizontal edge (smallest dz²), bisect the other two
            const splitPos = nibbles.length;
            nibbles.push(0);

            let specialSide: number;
            let s0: number;
            let s1: number;
            let s2: number;

            if (dzSq0 <= dzSq1 && dzSq0 <= dzSq2) {
                // Edge v0→v1 most horizontal → keep = Bambu side 2
                specialSide = 2;
                const m12z = (z1 + z2) * 0.5;
                const m20z = (z2 + z0) * 0.5;
                const m12: Vert3 = [(v1[0] + v2[0]) * 0.5, (v1[1] + v2[1]) * 0.5, m12z];
                const m20: Vert3 = [(v2[0] + v0[0]) * 0.5, (v2[1] + v0[1]) * 0.5, m20z];
                // Reverse: c2 (base), c1 (middle), c0 (apex)
                s2 = subdivide(z0, z1, m12z, v0, v1, m12, nd, nibbles, faceIdx);
                s1 = subdivide(m20z, z0, m12z, m20, v0, m12, nd, nibbles, faceIdx);
                s0 = subdivide(z2, m20z, m12z, v2, m20, m12, nd, nibbles, faceIdx);
            } else if (dzSq1 <= dzSq2) {
                // Edge v1→v2 most horizontal → keep = Bambu side 0
                specialSide = 0;
                const m01z = (z0 + z1) * 0.5;
                const m20z = (z2 + z0) * 0.5;
                const m01: Vert3 = [(v0[0] + v1[0]) * 0.5, (v0[1] + v1[1]) * 0.5, m01z];
                const m20: Vert3 = [(v2[0] + v0[0]) * 0.5, (v2[1] + v0[1]) * 0.5, m20z];
                // Reverse: c2 (base), c1 (middle), c0 (apex)
                s2 = subdivide(z1, z2, m20z, v1, v2, m20, nd, nibbles, faceIdx);
                s1 = subdivide(m01z, z1, m20z, m01, v1, m20, nd, nibbles, faceIdx);
                s0 = subdivide(z0, m01z, m20z, v0, m01, m20, nd, nibbles, faceIdx);
            } else {
                // Edge v2→v0 most horizontal → keep = Bambu side 1
                specialSide = 1;
                const m01z = (z0 + z1) * 0.5;
                const m12z = (z1 + z2) * 0.5;
                const m01: Vert3 = [(v0[0] + v1[0]) * 0.5, (v0[1] + v1[1]) * 0.5, m01z];
                const m12: Vert3 = [(v1[0] + v2[0]) * 0.5, (v1[1] + v2[1]) * 0.5, m12z];
                // Reverse: c2 (base), c1 (middle), c0 (apex)
                s2 = subdivide(z2, z0, m01z, v2, v0, m01, nd, nibbles, faceIdx);
                s1 = subdivide(m12z, z2, m01z, m12, v2, m01, nd, nibbles, faceIdx);
                s0 = subdivide(z1, m12z, m01z, v1, m12, m01, nd, nibbles, faceIdx);
            }

            // Collapse if all children are identical leaves
            if (s0 >= 0 && s0 === s1 && s1 === s2) {
                nibbles.length = splitPos;
                if (s0 <= 2) {
                    nibbles.push(s0 << 2);
                } else {
                    nibbles.push(0xC);
                    nibbles.push(s0 - 3);
                }
                return s0;
            }

            nibbles[splitPos] = (specialSide << 2) | 2;
            return -1;
        }

        // n_long === 0: no edges long enough to split, assign via centroid
        const centroidZ = (z0 + z1 + z2) / 3.0;
        const clF = (centroidZ - globalZMin + epsilon) * invLh;
        const cl = clF < 0 ? 0 : Math.floor(clF);
        const layerMap = clusterLayerMaps[faceClusterIndex[faceIdx]];
        const state = cl < layerMap.length ? layerMap[cl] : defaultFilament;
        if (state <= 2) {
            nibbles.push(state << 2);
        } else {
            nibbles.push(0xC);
            nibbles.push(state - 3);
        }
        return state;
    }

    return subdivide;
}

/** Reusable scratch buffers for faceToHex to avoid per-call allocations. */
export interface FaceToHexBuffers {
    nibbles: number[];
    v0: Vert3;
    v1: Vert3;
    v2: Vert3;
}

/** Create a set of reusable buffers for faceToHex calls in a loop. */
export function createFaceToHexBuffers(): FaceToHexBuffers {
    return {
        nibbles: [],
        v0: [0, 0, 0],
        v1: [0, 0, 0],
        v2: [0, 0, 0],
    };
}

/**
 * Subdivide one face and return its hex string.
 *
 * When called in a loop, pass pre-allocated `buffers` (from createFaceToHexBuffers)
 * to avoid GC pressure from repeated Vert3 and nibbles array allocations.
 */
export function faceToHex(
    subdivideFn: SubdivideFn,
    vertices: Float64Array,
    faces: Uint32Array,
    faceIdx: number,
    maxDepth: number,
    buffers?: FaceToHexBuffers,
): string {
    const i3 = faceIdx * 3;
    const vi0 = faces[i3] * 3;
    const vi1 = faces[i3 + 1] * 3;
    const vi2 = faces[i3 + 2] * 3;

    const v0 = buffers ? buffers.v0 : [0, 0, 0] as Vert3;
    const v1 = buffers ? buffers.v1 : [0, 0, 0] as Vert3;
    const v2 = buffers ? buffers.v2 : [0, 0, 0] as Vert3;
    v0[0] = vertices[vi0]; v0[1] = vertices[vi0 + 1]; v0[2] = vertices[vi0 + 2];
    v1[0] = vertices[vi1]; v1[1] = vertices[vi1 + 1]; v1[2] = vertices[vi1 + 2];
    v2[0] = vertices[vi2]; v2[1] = vertices[vi2 + 1]; v2[2] = vertices[vi2 + 2];

    const nibbles = buffers ? buffers.nibbles : [] as number[];
    nibbles.length = 0;
    subdivideFn(v0[2], v1[2], v2[2], v0, v1, v2, maxDepth, nibbles, faceIdx);

    // Reverse nibbles → hex chars → join
    const chars: string[] = new Array(nibbles.length);
    for (let i = nibbles.length - 1, j = 0; i >= 0; i--, j++) {
        chars[j] = HEX_CHARS[nibbles[i]];
    }
    return chars.join('');
}

export interface EncodeBoundaryOptions {
    maxDepth?: number;
    progressCallback?: (done: number, total: number) => void;
    clusterLayerMaps: Uint8Array[];
    faceClusterIndex: Uint16Array;
}

/** Pre-computed boundary detection context shared by serial and parallel paths. */
export interface BoundaryContext {
    globalZMin: number;
    epsilon: number;
    layerIndices: Uint32Array;
    boundaryMask: boolean[];
}

/**
 * Compute the shared boundary context (global Z min, layer indices, boundary mask).
 *
 * Both `encodeBoundaryFaces` and `encodeBoundaryFacesParallel` need this setup;
 * extracting it avoids duplicating the computation.
 */
export function prepareBoundaryContext(
    mesh: MeshData,
    layerHeight: number,
): BoundaryContext {
    const centroidsZ = computeCentroidsZ(mesh);
    let globalZMin = Infinity;
    for (let i = 0; i < centroidsZ.length; i++) {
        if (centroidsZ[i] < globalZMin) globalZMin = centroidsZ[i];
    }

    const epsilon = Math.max(layerHeight * LAYER_EPSILON_FACTOR, MIN_ABSOLUTE_EPSILON);

    // Compute layer indices directly from pre-computed centroids
    // (avoids re-computing centroidsZ inside computeGlobalFaceLayers)
    const layerIndices = new Uint32Array(mesh.faceCount);
    for (let i = 0; i < mesh.faceCount; i++) {
        layerIndices[i] = Math.floor((centroidsZ[i] - globalZMin + epsilon) / layerHeight);
    }

    const boundaryMask = findBoundaryFaces(mesh, layerIndices, layerHeight, globalZMin);

    return { globalZMin, epsilon, layerIndices, boundaryMask };
}

/**
 * Compute bisection tree hex strings for boundary faces (serial only).
 *
 * @returns Map of faceIndex → hexString for boundary faces only.
 */
export function encodeBoundaryFaces(
    mesh: MeshData,
    faceFilaments: Uint32Array,
    layerHeight: number,
    options: EncodeBoundaryOptions,
): Map<number, string> {
    const maxDepth = options.maxDepth ?? 9;
    const progressCallback = options.progressCallback;

    const { globalZMin, epsilon, boundaryMask } =
        prepareBoundaryContext(mesh, layerHeight);

    const { clusterLayerMaps, faceClusterIndex } = options;

    // Validate cluster data consistency
    if (faceClusterIndex.length < mesh.faceCount) {
        throw new Error(
            `faceClusterIndex length (${faceClusterIndex.length}) < faceCount (${mesh.faceCount})`,
        );
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

    const subdivideFn = makeSubdivider(
        layerHeight, globalZMin, clusterLayerMaps,
        faceClusterIndex, defaultFilament, epsilon,
    );

    const result = new Map<number, string>();
    let done = 0;
    let nBoundary = 0;
    for (let i = 0; i < mesh.faceCount; i++) {
        if (boundaryMask[i]) nBoundary++;
    }

    const buffers = createFaceToHexBuffers();
    for (let i = 0; i < mesh.faceCount; i++) {
        if (!boundaryMask[i]) continue;
        result.set(i, faceToHex(subdivideFn, mesh.vertices, mesh.faces, i, maxDepth, buffers));
        done++;
        if (progressCallback && (done & 0xFFF) === 0) {
            progressCallback(done, nBoundary);
        }
    }
    if (progressCallback) {
        progressCallback(nBoundary, nBoundary);
    }

    return result;
}
