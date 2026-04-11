/** Web Worker for parallel bisection encoding of boundary faces. */

import { makeSubdivider, faceToHex, createFaceToHexBuffers } from '../subdivision';

interface WorkerInput {
  vertices: Float64Array;
  faces: Uint32Array;
  boundaryIndices: number[];
  layerHeight: number;
  globalZMin: number;
  clusterLayerMaps: Uint8Array[];
  faceClusterIndex: Uint16Array;
  defaultFilament: number;
  maxDepth: number;
  epsilon: number;
}

interface WorkerOutput {
  results: [number, string][];
}

self.onmessage = (e: MessageEvent<WorkerInput>) => {
  const {
    vertices,
    faces,
    boundaryIndices,
    layerHeight,
    globalZMin,
    clusterLayerMaps,
    faceClusterIndex,
    defaultFilament,
    maxDepth,
    epsilon,
  } = e.data;

  const subdivideFn = makeSubdivider(
    layerHeight,
    globalZMin,
    clusterLayerMaps,
    faceClusterIndex,
    defaultFilament,
    epsilon,
  );

  const results: [number, string][] = [];
  const buffers = createFaceToHexBuffers();
  for (const faceIdx of boundaryIndices) {
    results.push([faceIdx, faceToHex(subdivideFn, vertices, faces, faceIdx, maxDepth, buffers)]);
  }

  const output: WorkerOutput = { results };
  self.postMessage(output);
};
