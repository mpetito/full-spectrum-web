/** Tests for parallel subdivision pool (fallback path). */
import { describe, it, expect } from 'vitest';
import { encodeBoundaryFacesParallel } from '../subdivision-pool';
import { encodeBoundaryFaces } from '../subdivision';
import type { MeshData } from '../mesh';

/** Triangle spanning z=0..1 — boundary with layerHeight=0.2 */
function makeSpanningTriangle(): MeshData {
  return {
    vertices: new Float64Array([0, 0, 0, 1, 0, 0, 0.5, 0, 1]),
    faces: new Uint32Array([0, 1, 2]),
    vertexCount: 3,
    faceCount: 1,
  };
}

/** Flat triangle at z=0.5 — never boundary */
function makeFlatTriangle(): MeshData {
  return {
    vertices: new Float64Array([0, 0, 0.5, 1, 0, 0.5, 0.5, 1, 0.5]),
    faces: new Uint32Array([0, 1, 2]),
    vertexCount: 3,
    faceCount: 1,
  };
}

/** Cube with 12 faces — some boundary, some not */
function makeCube(size: number): MeshData {
  const s = size;
  // 8 vertices of axis-aligned cube at origin
  const vertices = new Float64Array([
    0, 0, 0, s, 0, 0, s, s, 0, 0, s, 0, // bottom
    0, 0, s, s, 0, s, s, s, s, 0, s, s, // top
  ]);
  // 12 triangles (2 per face, 6 faces)
  const faces = new Uint32Array([
    // bottom (z=0)
    0, 1, 2, 0, 2, 3,
    // top (z=s)
    4, 6, 5, 4, 7, 6,
    // front (y=0)
    0, 1, 5, 0, 5, 4,
    // back (y=s)
    2, 3, 7, 2, 7, 6,
    // left (x=0)
    0, 3, 7, 0, 7, 4,
    // right (x=s)
    1, 2, 6, 1, 6, 5,
  ]);
  return { vertices, faces, vertexCount: 8, faceCount: 12 };
}

describe('encodeBoundaryFacesParallel', () => {
  it('falls back to serial for small face counts', async () => {
    const mesh = makeSpanningTriangle();
    const faceFilaments = new Uint32Array([1]);
    const clusterLayerMaps = [new Uint8Array([1, 1, 1, 1, 1, 1])];
    const faceClusterIndex = new Uint16Array([0]);

    const result = await encodeBoundaryFacesParallel(mesh, faceFilaments, 0.2, {
      clusterLayerMaps,
      faceClusterIndex,
    });
    // Spanning triangle is a boundary face
    expect(result.size).toBe(1);
    expect(result.has(0)).toBe(true);
    expect(result.get(0)).toMatch(/^[0-9A-F]+$/);
  });

  it('returns empty map for non-boundary faces', async () => {
    const mesh = makeFlatTriangle();
    const faceFilaments = new Uint32Array([1]);
    const clusterLayerMaps = [new Uint8Array([1])];
    const faceClusterIndex = new Uint16Array([0]);

    const result = await encodeBoundaryFacesParallel(mesh, faceFilaments, 0.2, {
      clusterLayerMaps,
      faceClusterIndex,
    });
    expect(result.size).toBe(0);
  });

  it('produces same output as serial encodeBoundaryFaces', async () => {
    const mesh = makeCube(1.0);
    const faceFilaments = new Uint32Array(12);
    // alternating filaments by face
    for (let i = 0; i < 12; i++) faceFilaments[i] = (i % 2) + 1;

    const clusterLayerMaps = [new Uint8Array([1, 2, 1, 2, 1, 2])];
    const faceClusterIndex = new Uint16Array(12); // all cluster 0

    const serial = encodeBoundaryFaces(mesh, faceFilaments, 0.2, {
      maxDepth: 5,
      clusterLayerMaps,
      faceClusterIndex,
    });
    const parallel = await encodeBoundaryFacesParallel(mesh, faceFilaments, 0.2, {
      maxDepth: 5,
      clusterLayerMaps,
      faceClusterIndex,
    });

    expect(parallel.size).toBe(serial.size);
    for (const [faceIdx, hexStr] of serial) {
      expect(parallel.get(faceIdx)).toBe(hexStr);
    }
  });

  it('reports progress via callback', async () => {
    const mesh = makeSpanningTriangle();
    const faceFilaments = new Uint32Array([1]);
    const clusterLayerMaps = [new Uint8Array([1, 1, 1, 1, 1, 1])];
    const faceClusterIndex = new Uint16Array([0]);

    const calls: [number, number][] = [];
    await encodeBoundaryFacesParallel(mesh, faceFilaments, 0.2, {
      clusterLayerMaps,
      faceClusterIndex,
      progressCallback: (done, total) => calls.push([done, total]),
    });

    // At least the final progress call should report all done
    expect(calls.length).toBeGreaterThan(0);
    const last = calls[calls.length - 1];
    expect(last[0]).toBe(last[1]);
  });

  it('accepts explicit clusterLayerMaps', async () => {
    const mesh = makeSpanningTriangle();
    const faceFilaments = new Uint32Array([2]);
    const clusterLayerMaps = [new Uint8Array([1, 2, 1, 2, 1])];
    const faceClusterIndex = new Uint16Array([0]);

    const result = await encodeBoundaryFacesParallel(mesh, faceFilaments, 0.2, {
      clusterLayerMaps,
      faceClusterIndex,
    });
    expect(result.size).toBe(1);
    expect(result.get(0)).toMatch(/^[0-9A-F]+$/);
  });
});
