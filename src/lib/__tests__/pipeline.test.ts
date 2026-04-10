/** Tests for pipeline utility functions. */
import { describe, it, expect } from 'vitest';
import { buildClusterLayerData } from '../pipeline';
import type { ClusterInfo } from '../pipeline';
import type { MeshData } from '../mesh';

/** Simple mesh: two triangles at different Z ranges. */
function makeTwoTriangleMesh(): MeshData {
  // face 0: z = 0..0.5 (centroid z ≈ 0.167)
  // face 1: z = 0.5..1.0 (centroid z ≈ 0.667)
  const vertices = new Float64Array([
    // face 0
    0, 0, 0,      // v0
    1, 0, 0,      // v1
    0.5, 0, 0.5,  // v2
    // face 1
    0, 0, 0.5,    // v3
    1, 0, 0.5,    // v4
    0.5, 0, 1.0,  // v5
  ]);
  const faces = new Uint32Array([0, 1, 2, 3, 4, 5]);
  return { vertices, faces, vertexCount: 6, faceCount: 2 };
}

describe('buildClusterLayerData', () => {
  it('produces correct layer maps for two clusters at different Z ranges', () => {
    const mesh = makeTwoTriangleMesh();
    const layerHeight = 0.2;

    const clusterInfos: ClusterInfo[] = [
      {
        palette: { type: 'cyclic', pattern: [1, 2] },
        regionLayers: 3,
        faceIndices: [0],
      },
      {
        palette: { type: 'cyclic', pattern: [3, 4] },
        regionLayers: 3,
        faceIndices: [1],
      },
    ];

    const result = buildClusterLayerData(mesh, layerHeight, clusterInfos, 0);

    expect(result.clusterLayerMaps).toHaveLength(2);
    expect(result.totalLayers).toBeGreaterThanOrEqual(1);
    expect(Number.isFinite(result.globalZMin)).toBe(true);

    // Cluster 0 should contain alternating filaments 1,2 in its region
    const map0 = result.clusterLayerMaps[0];
    expect(map0.length).toBe(result.totalLayers);
    // At least some layers should have palette values (1 or 2)
    const cluster0Values = new Set(Array.from(map0));
    expect(cluster0Values.has(1) || cluster0Values.has(2)).toBe(true);

    // Cluster 1 should contain filaments 3,4 in its region
    const map1 = result.clusterLayerMaps[1];
    const cluster1Values = new Set(Array.from(map1));
    expect(cluster1Values.has(3) || cluster1Values.has(4)).toBe(true);
  });

  it('returns single default-filled cluster for empty clusterInfos', () => {
    const mesh = makeTwoTriangleMesh();
    const layerHeight = 0.2;
    const defaultFilament = 5;

    const result = buildClusterLayerData(mesh, layerHeight, [], defaultFilament);

    expect(result.clusterLayerMaps).toHaveLength(1);
    expect(result.totalLayers).toBeGreaterThanOrEqual(1);
    // All layers should be filled with the default filament
    const map = result.clusterLayerMaps[0];
    for (let i = 0; i < map.length; i++) {
      expect(map[i]).toBe(defaultFilament);
    }
  });

  it('fills non-cluster layers with defaultFilament', () => {
    const mesh = makeTwoTriangleMesh();
    const layerHeight = 0.2;
    const defaultFilament = 7;

    // Single cluster covering only the lower Z range
    const clusterInfos: ClusterInfo[] = [
      {
        palette: { type: 'cyclic', pattern: [1, 2] },
        regionLayers: 2,
        faceIndices: [0],
      },
    ];

    const result = buildClusterLayerData(mesh, layerHeight, clusterInfos, defaultFilament);
    const map = result.clusterLayerMaps[0];

    // Layers beyond the cluster's region should be the default filament
    let hasDefault = false;
    for (let i = 0; i < map.length; i++) {
      if (map[i] === defaultFilament) hasDefault = true;
    }
    expect(hasDefault).toBe(true);
  });
});
