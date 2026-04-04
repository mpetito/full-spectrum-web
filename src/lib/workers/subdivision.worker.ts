/** Web Worker for parallel bisection encoding of boundary faces. */

import { makeSubdivider, faceToHex } from '../subdivision';

interface WorkerInput {
  vertices: Float64Array;
  faces: Uint32Array;
  boundaryIndices: number[];
  layerHeight: number;
  globalZMin: number;
  filamentByLayer: [number, number][];
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
    filamentByLayer,
    defaultFilament,
    maxDepth,
    epsilon,
  } = e.data;

  const layerMap = new Map<number, number>(filamentByLayer);

  const subdivideFn = makeSubdivider(
    layerHeight,
    globalZMin,
    layerMap,
    defaultFilament,
    maxDepth,
    epsilon,
  );

  const results: [number, string][] = [];
  for (const faceIdx of boundaryIndices) {
    results.push([faceIdx, faceToHex(subdivideFn, vertices, faces, faceIdx, maxDepth)]);
  }

  const output: WorkerOutput = { results };
  self.postMessage(output);
};
