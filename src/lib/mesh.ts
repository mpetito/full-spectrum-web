/** Mesh operations: centroid computation, layer assignment, face clustering. */

import { MIN_ABSOLUTE_EPSILON } from '../constants';

export const LAYER_EPSILON_FACTOR = 0.001;

export class MeshError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MeshError';
  }
}

/** Raw mesh data as typed arrays. */
export interface MeshData {
  /** (V*3) flat Float64Array: x0,y0,z0, x1,y1,z1, ... */
  vertices: Float64Array;
  /** (F*3) flat Uint32Array: v0,v1,v2 per triangle */
  faces: Uint32Array;
  vertexCount: number;
  faceCount: number;
}

/**
 * Compute the centroid Z coordinate for each face.
 * Returns Float64Array of length faceCount.
 */
export function computeCentroidsZ(mesh: MeshData): Float64Array {
  const { vertices, faces, faceCount } = mesh;
  const result = new Float64Array(faceCount);
  for (let i = 0; i < faceCount; i++) {
    const i3 = i * 3;
    const v0 = faces[i3];
    const v1 = faces[i3 + 1];
    const v2 = faces[i3 + 2];
    result[i] = (vertices[v0 * 3 + 2] + vertices[v1 * 3 + 2] + vertices[v2 * 3 + 2]) / 3.0;
  }
  return result;
}

/**
 * Assign each face to a Z-layer based on its centroid Z coordinate.
 * Returns Uint32Array of 0-based layer indices.
 */
export function computeGlobalFaceLayers(mesh: MeshData, layerHeight: number): Uint32Array {
  const centroidsZ = computeCentroidsZ(mesh);
  let zMin = Infinity;
  for (let i = 0; i < centroidsZ.length; i++) {
    if (centroidsZ[i] < zMin) zMin = centroidsZ[i];
  }
  const epsilon = Math.max(layerHeight * LAYER_EPSILON_FACTOR, MIN_ABSOLUTE_EPSILON);
  const result = new Uint32Array(mesh.faceCount);
  for (let i = 0; i < mesh.faceCount; i++) {
    result[i] = Math.floor((centroidsZ[i] - zMin + epsilon) / layerHeight);
  }
  return result;
}

/**
 * Compute layer indices for a subset of faces relative to their local Z range.
 * Returns [layerIndices, totalLayers].
 */
export function computeRegionLayers(
  mesh: MeshData,
  layerHeight: number,
  faceIndices: number[],
): [Uint32Array, number] {
  if (faceIndices.length === 0) {
    return [new Uint32Array(0), 0];
  }

  const { vertices, faces } = mesh;
  const n = faceIndices.length;
  const centroidsZ = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const i = faceIndices[k];
    const i3 = i * 3;
    const v0 = faces[i3];
    const v1 = faces[i3 + 1];
    const v2 = faces[i3 + 2];
    centroidsZ[k] = (vertices[v0 * 3 + 2] + vertices[v1 * 3 + 2] + vertices[v2 * 3 + 2]) / 3.0;
  }

  let zMin = Infinity;
  for (let i = 0; i < n; i++) {
    if (centroidsZ[i] < zMin) zMin = centroidsZ[i];
  }

  const epsilon = Math.max(layerHeight * LAYER_EPSILON_FACTOR, MIN_ABSOLUTE_EPSILON);
  const layerIndices = new Uint32Array(n);
  let maxLayer = 0;
  for (let i = 0; i < n; i++) {
    const layer = Math.floor((centroidsZ[i] - zMin + epsilon) / layerHeight);
    layerIndices[i] = layer;
    if (layer > maxLayer) maxLayer = layer;
  }

  return [layerIndices, maxLayer + 1];
}

/**
 * Group face indices by their assigned filament.
 * Faces not in faceColors are assigned the defaultFilament.
 */
export function clusterFacesByFilament(
  faceColors: Map<number, number>,
  nFaces: number,
  defaultFilament = 1,
): Map<number, number[]> {
  const clusters = new Map<number, number[]>();
  for (let i = 0; i < nFaces; i++) {
    const filament = faceColors.get(i) ?? defaultFilament;
    let list = clusters.get(filament);
    if (!list) {
      list = [];
      clusters.set(filament, list);
    }
    list.push(i);
  }
  return clusters;
}
