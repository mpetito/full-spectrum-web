import { describe, it, expect } from 'vitest';
import {
    appReducer,
    initialState,
    type AppState,
    type AppAction,
} from '../AppContext';
import type { ThreeMFData } from '../../lib/threemf';
import type { PipelineResult, LayerColorData } from '../../lib/pipeline';

const mockMeshData: ThreeMFData = {
    vertices: new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    faces: new Uint32Array([0, 1, 2]),
    vertexCount: 3,
    faceCount: 1,
    faceColors: new Map(),
    defaultFilament: 1,
};

const mockLayerColorData: LayerColorData = {
    layerFilamentMap: new Map([[0, 1]]),
    zMin: 0,
    layerHeight: 0.1,
    totalLayers: 1,
};

const mockResult: PipelineResult = {
    success: true,
    faceCount: 1,
    layerCount: 1,
    filamentDistribution: new Map([[1, 1]]),
    warnings: [],
    boundaryFaceCount: 0,
    boundaryFacePct: 0,
};

describe('appReducer', () => {
    it('returns initial state', () => {
        expect(initialState.status).toBe('idle');
        expect(initialState.meshData).toBeNull();
        expect(initialState.error).toBeNull();
    });

    it('UPLOAD_START sets loading status and clears error', () => {
        const prev: AppState = { ...initialState, status: 'error', error: 'old' };
        const next = appReducer(prev, { type: 'UPLOAD_START' });
        expect(next.status).toBe('loading');
        expect(next.error).toBeNull();
    });

    it('UPLOAD_SUCCESS sets meshData and clears processing results', () => {
        const buf = new ArrayBuffer(10);
        const prev: AppState = {
            ...initialState,
            status: 'loading',
            layerColorData: mockLayerColorData,
            outputBytes: new Uint8Array(5),
        };
        const next = appReducer(prev, {
            type: 'UPLOAD_SUCCESS',
            meshData: mockMeshData,
            rawFileData: buf,
        });
        expect(next.status).toBe('ready');
        expect(next.meshData).toBe(mockMeshData);
        expect(next.rawFileData).toBe(buf);
        expect(next.layerColorData).toBeNull();
        expect(next.outputBytes).toBeNull();
        expect(next.result).toBeNull();
    });

    it('UPLOAD_ERROR sets error status and message', () => {
        const next = appReducer(initialState, {
            type: 'UPLOAD_ERROR',
            error: 'bad file',
        });
        expect(next.status).toBe('error');
        expect(next.error).toBe('bad file');
    });

    it('UPDATE_CONFIG replaces config without changing status', () => {
        const newConfig = { ...initialState.config, layerHeightMm: 0.15 };
        const next = appReducer(initialState, {
            type: 'UPDATE_CONFIG',
            config: newConfig,
        });
        expect(next.config.layerHeightMm).toBe(0.15);
        expect(next.status).toBe(initialState.status);
    });

    it('PROCESS_START sets processing status', () => {
        const prev: AppState = { ...initialState, status: 'ready' };
        const next = appReducer(prev, { type: 'PROCESS_START' });
        expect(next.status).toBe('processing');
        expect(next.error).toBeNull();
    });

    it('PROCESS_SUCCESS stores result, outputBytes, and layerColorData', () => {
        const outputBytes = new Uint8Array([1, 2, 3]);
        const prev: AppState = { ...initialState, status: 'processing' };
        const next = appReducer(prev, {
            type: 'PROCESS_SUCCESS',
            result: mockResult,
            outputBytes,
            layerColorData: mockLayerColorData,
        });
        expect(next.status).toBe('ready');
        expect(next.result).toBe(mockResult);
        expect(next.outputBytes).toBe(outputBytes);
        expect(next.layerColorData).toBe(mockLayerColorData);
        expect(next.error).toBeNull();
    });

    it('PROCESS_ERROR sets error status and message', () => {
        const next = appReducer(initialState, {
            type: 'PROCESS_ERROR',
            error: 'pipeline failed',
        });
        expect(next.status).toBe('error');
        expect(next.error).toBe('pipeline failed');
    });

    it('RESET returns to initial state', () => {
        const modified: AppState = {
            ...initialState,
            status: 'ready',
            meshData: mockMeshData,
            error: 'stale',
        };
        const next = appReducer(modified, { type: 'RESET' });
        expect(next).toEqual(initialState);
    });

    it('unknown action returns state unchanged', () => {
        const state = { ...initialState, status: 'ready' as const };
        const next = appReducer(state, { type: 'UNKNOWN' } as unknown as AppAction);
        expect(next).toBe(state);
    });
});
