/** Tests for cyclic and gradient palette application. */
import { describe, it, expect } from 'vitest';
import { applyCyclic, buildGradientLayerMap, applyGradient } from '../palette';

describe('applyCyclic', () => {
  it('applies a 2-color repeating pattern', () => {
    const layers = new Uint32Array([0, 1, 2, 3, 4, 5]);
    const result = applyCyclic(layers, [1, 2]);
    expect(Array.from(result)).toEqual([1, 2, 1, 2, 1, 2]);
  });

  it('applies a 3-color repeating pattern', () => {
    const layers = new Uint32Array([0, 1, 2, 3, 4, 5]);
    const result = applyCyclic(layers, [1, 2, 3]);
    expect(Array.from(result)).toEqual([1, 2, 3, 1, 2, 3]);
  });

  it('handles a single-color pattern', () => {
    const layers = new Uint32Array([0, 1, 2]);
    const result = applyCyclic(layers, [5]);
    expect(Array.from(result)).toEqual([5, 5, 5]);
  });

  it('assigns first pattern element to layer 0', () => {
    const layers = new Uint32Array([0]);
    const result = applyCyclic(layers, [7, 8, 9]);
    expect(result[0]).toBe(7);
  });
});

describe('buildGradientLayerMap', () => {
  it('builds a 2-stop gradient', () => {
    const map = buildGradientLayerMap(10, [[0.0, 1], [1.0, 2]]);
    expect(map.length).toBe(10);
    // First layer should be color 1
    expect(map[0]).toBe(1);
    // Last layer should be color 2
    expect(map[9]).toBe(2);
    // Both colors should appear due to dithering
    const values = new Set(Array.from(map));
    expect(values.has(1)).toBe(true);
    expect(values.has(2)).toBe(true);
  });

  it('builds a 3-stop gradient', () => {
    const map = buildGradientLayerMap(20, [[0.0, 1], [0.5, 2], [1.0, 3]]);
    expect(map.length).toBe(20);
    expect(map[0]).toBe(1);
    expect(map[19]).toBe(3);
    // Middle region should contain color 2
    const mid = Array.from(map.slice(8, 12));
    expect(mid.some((v) => v === 2)).toBe(true);
  });

  it('returns first stop color for single layer', () => {
    const map = buildGradientLayerMap(1, [[0.0, 5], [1.0, 6]]);
    expect(map.length).toBe(1);
    expect(map[0]).toBe(5);
  });
});

describe('applyGradient', () => {
  it('maps face layer indices through gradient', () => {
    const layers = new Uint32Array([0, 4, 9]);
    const result = applyGradient(layers, 10, [[0.0, 1], [1.0, 2]]);
    expect(result.length).toBe(3);
    // Layer 0 → first stop color
    expect(result[0]).toBe(1);
    // Layer 9 → last stop color
    expect(result[2]).toBe(2);
  });

  it('clamps out-of-range indices', () => {
    const layers = new Uint32Array([0, 100]);
    const result = applyGradient(layers, 10, [[0.0, 1], [1.0, 2]]);
    // Index 100 should be clamped to last layer
    expect(result[1]).toBe(2);
  });

  it('requires at least 2 stops', () => {
    const layers = new Uint32Array([0]);
    expect(() => applyGradient(layers, 10, [[0.5, 1]])).toThrow('at least 2 stops');
  });
});
