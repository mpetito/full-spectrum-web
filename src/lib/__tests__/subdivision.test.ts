/** Tests for boundary detection and bisection encoding. */
import { describe, it, expect } from 'vitest';
import {
  findBoundaryFaces,
  makeSubdivider,
  faceToHex,
  createFaceToHexBuffers,
  encodeBoundaryFaces,
} from '../subdivision';
import { computeGlobalFaceLayers, LAYER_EPSILON_FACTOR } from '../mesh';
import type { MeshData } from '../mesh';
import { MIN_ABSOLUTE_EPSILON } from '../../constants';

/** A triangle spanning z=0 to z=1 — should be boundary with layerHeight=0.2. */
function makeSpanningTriangle(): MeshData {
  const vertices = new Float64Array([
    0, 0, 0,    // v0 at z=0
    1, 0, 0,    // v1 at z=0
    0.5, 0, 1,  // v2 at z=1
  ]);
  const faces = new Uint32Array([0, 1, 2]);
  return { vertices, faces, vertexCount: 3, faceCount: 1 };
}

/** A flat triangle at z=0.5 — should NOT be boundary. */
function makeFlatTriangle(): MeshData {
  const vertices = new Float64Array([
    0, 0, 0.5,
    1, 0, 0.5,
    0.5, 1, 0.5,
  ]);
  const faces = new Uint32Array([0, 1, 2]);
  return { vertices, faces, vertexCount: 3, faceCount: 1 };
}

describe('findBoundaryFaces', () => {
  it('detects spanning triangle as boundary', () => {
    const mesh = makeSpanningTriangle();
    const layerIndices = computeGlobalFaceLayers(mesh, 0.2);
    const globalZMin = 0;
    const boundary = findBoundaryFaces(mesh, layerIndices, 0.2, globalZMin);
    expect(boundary).toHaveLength(1);
    expect(boundary[0]).toBe(true);
  });

  it('detects flat triangle as non-boundary', () => {
    const mesh = makeFlatTriangle();
    const layerIndices = computeGlobalFaceLayers(mesh, 0.2);
    // Centroid z=0.5 → globalZMin = 0.5
    const globalZMin = 0.5;
    const boundary = findBoundaryFaces(mesh, layerIndices, 0.2, globalZMin);
    expect(boundary).toHaveLength(1);
    expect(boundary[0]).toBe(false);
  });
});

describe('makeSubdivider', () => {
  it('produces leaf for flat triangle in single layer', () => {
    const layerHeight = 1.0; // single layer covers everything
    const clusterLayerMaps = [new Uint8Array([2])]; // cluster 0: layer 0 → filament 2
    const faceClusterIndex = new Uint16Array([0]); // face 0 → cluster 0
    const epsilon = layerHeight * 0.001;

    const subdiv = makeSubdivider(layerHeight, 0.0, clusterLayerMaps, faceClusterIndex, 1, epsilon);
    const nibbles: number[] = [];
    const result = subdiv(0.5, 0.5, 0.5, [0, 0, 0.5], [1, 0, 0.5], [0.5, 1, 0.5], 5, nibbles, 0);

    // Should be a leaf (returns state >= 0), not a split (-1)
    expect(result).toBeGreaterThanOrEqual(0);
    // Leaf produces exactly 1 nibble (or 2 for filament > 2)
    expect(nibbles.length).toBeGreaterThanOrEqual(1);
    expect(nibbles.length).toBeLessThanOrEqual(2);
  });

  it('produces split nodes for multi-layer spanning triangle', () => {
    const layerHeight = 0.2;
    const clusterLayerMaps = [new Uint8Array([1, 2, 1, 2, 1])]; // cluster 0
    const faceClusterIndex = new Uint16Array([0]); // face 0 → cluster 0
    const epsilon = layerHeight * 0.001;

    const subdiv = makeSubdivider(layerHeight, 0.0, clusterLayerMaps, faceClusterIndex, 1, epsilon);
    const nibbles: number[] = [];
    subdiv(0, 0, 1, [0, 0, 0], [1, 0, 0], [0.5, 0, 1], 5, nibbles, 0);

    // Spanning triangle should require splits → more nibbles
    expect(nibbles.length).toBeGreaterThan(1);
  });
});

describe('faceToHex', () => {
  it('returns a valid hex string', () => {
    const mesh = makeSpanningTriangle();
    const layerHeight = 0.2;
    const clusterLayerMaps = [new Uint8Array([1, 2, 1, 2, 1])];
    const faceClusterIndex = new Uint16Array([0]);
    const epsilon = layerHeight * 0.001;

    const subdiv = makeSubdivider(layerHeight, 0.0, clusterLayerMaps, faceClusterIndex, 1, epsilon);
    const hex = faceToHex(subdiv, mesh.vertices, mesh.faces, 0, 5);

    expect(typeof hex).toBe('string');
    expect(hex.length).toBeGreaterThan(0);
    // All chars should be valid hex
    expect(hex).toMatch(/^[0-9A-F]+$/);
  });
});

describe('encodeBoundaryFaces', () => {
  it('returns hex only for boundary faces', () => {
    const mesh = makeSpanningTriangle();
    const faceFilaments = new Uint32Array([1]);
    const clusterLayerMaps = [new Uint8Array([1, 1, 1, 1, 1, 1])];
    const faceClusterIndex = new Uint16Array([0]);
    const result = encodeBoundaryFaces(mesh, faceFilaments, 0.2, {
      clusterLayerMaps,
      faceClusterIndex,
    });
    // Spanning triangle is boundary → should appear in result
    expect(result.size).toBe(1);
    expect(result.has(0)).toBe(true);
    expect(typeof result.get(0)).toBe('string');
  });

  it('excludes non-boundary faces', () => {
    const mesh = makeFlatTriangle();
    const faceFilaments = new Uint32Array([1]);
    const clusterLayerMaps = [new Uint8Array([1])];
    const faceClusterIndex = new Uint16Array([0]);
    const result = encodeBoundaryFaces(mesh, faceFilaments, 0.2, {
      clusterLayerMaps,
      faceClusterIndex,
    });
    // Flat triangle is not boundary → result should be empty
    expect(result.size).toBe(0);
  });
});

describe('multi-cluster encoding', () => {
  it('assigns different filaments per cluster for overlapping faces', () => {
    // Two spanning triangles sharing the same Z range, assigned to different clusters
    const vertices = new Float64Array([
      // face 0
      0, 0, 0,    // v0
      1, 0, 0,    // v1
      0.5, 0, 1,  // v2
      // face 1
      2, 0, 0,    // v3
      3, 0, 0,    // v4
      2.5, 0, 1,  // v5
    ]);
    const faces = new Uint32Array([0, 1, 2, 3, 4, 5]);
    const mesh: MeshData = { vertices, faces, vertexCount: 6, faceCount: 2 };
    const faceFilaments = new Uint32Array([1, 2]);
    const layerHeight = 0.2;

    // Cluster 0 alternates filament 1,2; cluster 1 uses filament 3,4
    const clusterLayerMaps = [
      new Uint8Array([1, 2, 1, 2, 1]),  // cluster 0
      new Uint8Array([3, 4, 3, 4, 3]),  // cluster 1
    ];
    const faceClusterIndex = new Uint16Array([0, 1]); // face0→cluster0, face1→cluster1

    const result = encodeBoundaryFaces(mesh, faceFilaments, layerHeight, {
      maxDepth: 5,
      clusterLayerMaps,
      faceClusterIndex,
    });

    // Both spanning triangles should be boundary faces
    expect(result.size).toBe(2);
    expect(result.has(0)).toBe(true);
    expect(result.has(1)).toBe(true);

    // The hex strings should differ because the clusters use different filament assignments
    expect(result.get(0)).not.toBe(result.get(1));
  });
});

describe('epsilon floor', () => {
  it('epsilon is at least MIN_ABSOLUTE_EPSILON even for small layer heights', () => {
    const layerHeight = 0.04;
    const epsilon = Math.max(layerHeight * LAYER_EPSILON_FACTOR, MIN_ABSOLUTE_EPSILON);
    expect(epsilon).toBeGreaterThanOrEqual(MIN_ABSOLUTE_EPSILON);
    expect(epsilon).toBe(MIN_ABSOLUTE_EPSILON); // 0.04 * 0.001 = 0.00004 < 0.0001
  });
});

describe('faceToHex with reusable buffers', () => {
  it('produces identical output with and without buffers', () => {
    const mesh = makeSpanningTriangle();
    const layerHeight = 0.2;
    const clusterLayerMaps = [new Uint8Array([1, 2, 1, 2, 1])];
    const faceClusterIndex = new Uint16Array([0]);
    const epsilon = layerHeight * 0.001;

    const subdiv = makeSubdivider(layerHeight, 0.0, clusterLayerMaps, faceClusterIndex, 1, epsilon);
    const hexWithout = faceToHex(subdiv, mesh.vertices, mesh.faces, 0, 5);
    const hexWith = faceToHex(subdiv, mesh.vertices, mesh.faces, 0, 5, createFaceToHexBuffers());

    expect(hexWith).toBe(hexWithout);
  });

  it('produces correct results when buffers are reused across multiple faces', () => {
    const vertices = new Float64Array([
      // face 0
      0, 0, 0, 1, 0, 0, 0.5, 0, 1,
      // face 1
      2, 0, 0, 3, 0, 0, 2.5, 0, 1,
    ]);
    const faces = new Uint32Array([0, 1, 2, 3, 4, 5]);
    const layerHeight = 0.2;
    const clusterLayerMaps = [new Uint8Array([1, 2, 1, 2, 1])];
    const faceClusterIndex = new Uint16Array([0, 0]);
    const epsilon = layerHeight * 0.001;

    const subdiv = makeSubdivider(layerHeight, 0.0, clusterLayerMaps, faceClusterIndex, 1, epsilon);

    // Without buffers
    const hex0 = faceToHex(subdiv, vertices, faces, 0, 5);
    const hex1 = faceToHex(subdiv, vertices, faces, 1, 5);

    // With reused buffers
    const buffers = createFaceToHexBuffers();
    const hex0b = faceToHex(subdiv, vertices, faces, 0, 5, buffers);
    const hex1b = faceToHex(subdiv, vertices, faces, 1, 5, buffers);

    expect(hex0b).toBe(hex0);
    expect(hex1b).toBe(hex1);
  });
});
