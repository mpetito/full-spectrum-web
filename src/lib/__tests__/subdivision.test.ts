/** Tests for boundary detection and bisection encoding. */
import { describe, it, expect } from 'vitest';
import {
  findBoundaryFaces,
  makeSubdivider,
  faceToHex,
  encodeBoundaryFaces,
} from '../subdivision';
import { computeFaceLayers } from '../mesh';
import type { MeshData } from '../mesh';

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
    const layerIndices = computeFaceLayers(mesh, 0.2);
    const globalZMin = 0;
    const boundary = findBoundaryFaces(mesh, layerIndices, 0.2, globalZMin);
    expect(boundary).toHaveLength(1);
    expect(boundary[0]).toBe(true);
  });

  it('detects flat triangle as non-boundary', () => {
    const mesh = makeFlatTriangle();
    const layerIndices = computeFaceLayers(mesh, 0.2);
    // Centroid z=0.5 → globalZMin = 0.5
    const globalZMin = 0.5;
    const boundary = findBoundaryFaces(mesh, layerIndices, 0.2, globalZMin);
    expect(boundary).toHaveLength(1);
    expect(boundary[0]).toBe(false);
  });
});

describe('makeSubdivider', () => {
  it('produces leaf for flat triangle in single layer', () => {
    const mesh = makeFlatTriangle();
    const layerHeight = 1.0; // single layer covers everything
    const filamentByLayer = new Map<number, number>([[0, 2]]);
    const epsilon = layerHeight * 0.001;

    const subdiv = makeSubdivider(layerHeight, 0.0, filamentByLayer, 1, 5, epsilon);
    const nibbles: number[] = [];
    const result = subdiv(0.5, 0.5, 0.5, [0, 0, 0.5], [1, 0, 0.5], [0.5, 1, 0.5], 5, nibbles);

    // Should be a leaf (returns state >= 0), not a split (-1)
    expect(result).toBeGreaterThanOrEqual(0);
    // Leaf produces exactly 1 nibble (or 2 for filament > 2)
    expect(nibbles.length).toBeGreaterThanOrEqual(1);
    expect(nibbles.length).toBeLessThanOrEqual(2);
  });

  it('produces split nodes for multi-layer spanning triangle', () => {
    const mesh = makeSpanningTriangle();
    const layerHeight = 0.2;
    const filamentByLayer = new Map<number, number>([
      [0, 1], [1, 2], [2, 1], [3, 2], [4, 1],
    ]);
    const epsilon = layerHeight * 0.001;

    const subdiv = makeSubdivider(layerHeight, 0.0, filamentByLayer, 1, 5, epsilon);
    const nibbles: number[] = [];
    subdiv(0, 0, 1, [0, 0, 0], [1, 0, 0], [0.5, 0, 1], 5, nibbles);

    // Spanning triangle should require splits → more nibbles
    expect(nibbles.length).toBeGreaterThan(1);
  });
});

describe('faceToHex', () => {
  it('returns a valid hex string', () => {
    const mesh = makeSpanningTriangle();
    const layerHeight = 0.2;
    const filamentByLayer = new Map<number, number>([
      [0, 1], [1, 2], [2, 1], [3, 2], [4, 1],
    ]);
    const epsilon = layerHeight * 0.001;

    const subdiv = makeSubdivider(layerHeight, 0.0, filamentByLayer, 1, 5, epsilon);
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
    const result = encodeBoundaryFaces(mesh, faceFilaments, 0.2);
    // Spanning triangle is boundary → should appear in result
    expect(result.size).toBe(1);
    expect(result.has(0)).toBe(true);
    expect(typeof result.get(0)).toBe('string');
  });

  it('excludes non-boundary faces', () => {
    const mesh = makeFlatTriangle();
    const faceFilaments = new Uint32Array([1]);
    const result = encodeBoundaryFaces(mesh, faceFilaments, 0.2);
    // Flat triangle is not boundary → result should be empty
    expect(result.size).toBe(0);
  });
});
