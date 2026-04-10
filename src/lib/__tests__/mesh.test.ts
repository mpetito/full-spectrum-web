/** Tests for mesh operations. */
import { describe, it, expect } from 'vitest';
import {
  computeCentroidsZ,
  computeGlobalFaceLayers,
  computeRegionLayers,
  clusterFacesByFilament,
  type MeshData,
} from '../mesh';

/** A unit cube from z=0 to z=1, 12 triangles (2 per face). */
function makeCubeMesh(): MeshData {
  const vertices = new Float64Array([
    0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, // bottom (z=0) v0-v3
    0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, // top (z=1)    v4-v7
  ]);
  const faces = new Uint32Array([
    0, 1, 2, 0, 2, 3, // bottom   (f0, f1)
    4, 5, 6, 4, 6, 7, // top      (f2, f3)
    0, 1, 5, 0, 5, 4, // front    (f4, f5)
    2, 3, 7, 2, 7, 6, // back     (f6, f7)
    0, 3, 7, 0, 7, 4, // left     (f8, f9)
    1, 2, 6, 1, 6, 5, // right    (f10, f11)
  ]);
  return { vertices, faces, vertexCount: 8, faceCount: 12 };
}

describe('computeCentroidsZ', () => {
  it('computes correct centroids for cube', () => {
    const mesh = makeCubeMesh();
    const cz = computeCentroidsZ(mesh);
    expect(cz.length).toBe(12);

    // Bottom faces (f0, f1): all vertices at z=0 → centroid z ≈ 0
    expect(cz[0]).toBeCloseTo(0, 5);
    expect(cz[1]).toBeCloseTo(0, 5);

    // Top faces (f2, f3): all vertices at z=1 → centroid z ≈ 1
    expect(cz[2]).toBeCloseTo(1, 5);
    expect(cz[3]).toBeCloseTo(1, 5);

    // Side faces: each triangle has 2 vertices at z=0 or z=1 and 1 at the other
    // front f4: v0(z=0), v1(z=0), v5(z=1) → centroid z ≈ 0.333
    expect(cz[4]).toBeCloseTo(1 / 3, 2);
    // front f5: v0(z=0), v5(z=1), v4(z=1) → centroid z ≈ 0.667
    expect(cz[5]).toBeCloseTo(2 / 3, 2);
  });
});

describe('computeGlobalFaceLayers', () => {
  it('assigns distinct layers with layerHeight=0.5', () => {
    const mesh = makeCubeMesh();
    const layers = computeGlobalFaceLayers(mesh, 0.5);
    expect(layers.length).toBe(12);

    // Bottom faces (centroid z≈0) → layer 0
    expect(layers[0]).toBe(0);
    expect(layers[1]).toBe(0);

    // Top faces (centroid z≈1) → layer 2
    expect(layers[2]).toBe(2);
    expect(layers[3]).toBe(2);

    // Side faces should be in layer 0 or 1 depending on centroid
    // f4 centroid z≈0.333 → layer 0
    expect(layers[4]).toBe(0);
    // f5 centroid z≈0.667 → layer 1
    expect(layers[5]).toBe(1);
  });
});

describe('computeRegionLayers', () => {
  it('returns local layer indices for a subset of faces', () => {
    const mesh = makeCubeMesh();
    // Use just the side faces (f4-f11)
    const sideIndices = [4, 5, 6, 7, 8, 9, 10, 11];
    const [localLayers, totalLayers] = computeRegionLayers(mesh, 0.5, sideIndices);
    expect(localLayers.length).toBe(sideIndices.length);
    expect(totalLayers).toBeGreaterThan(0);

    // All local layer indices should be in [0, totalLayers)
    for (let i = 0; i < localLayers.length; i++) {
      expect(localLayers[i]).toBeLessThan(totalLayers);
    }
  });

  it('returns empty for empty faceIndices', () => {
    const mesh = makeCubeMesh();
    const [localLayers, totalLayers] = computeRegionLayers(mesh, 0.5, []);
    expect(localLayers.length).toBe(0);
    expect(totalLayers).toBe(0);
  });
});

describe('clusterFacesByFilament', () => {
  it('puts all faces in default cluster when faceColors is empty', () => {
    const faceColors = new Map<number, number>();
    const clusters = clusterFacesByFilament(faceColors, 5);
    // All 5 faces should be in cluster for default filament 1
    expect(clusters.get(1)).toHaveLength(5);
    expect(clusters.size).toBe(1);
  });

  it('groups faces by assigned filament', () => {
    const faceColors = new Map<number, number>([
      [0, 2],
      [2, 2],
      [3, 3],
    ]);
    const clusters = clusterFacesByFilament(faceColors, 5);
    // Filament 2: faces 0, 2
    expect(clusters.get(2)).toEqual([0, 2]);
    // Filament 3: face 3
    expect(clusters.get(3)).toEqual([3]);
    // Default filament 1: faces 1, 4
    expect(clusters.get(1)).toEqual([1, 4]);
  });

  it('respects custom defaultFilament', () => {
    const faceColors = new Map<number, number>();
    const clusters = clusterFacesByFilament(faceColors, 3, 5);
    expect(clusters.get(5)).toHaveLength(3);
    expect(clusters.has(1)).toBe(false);
  });
});
