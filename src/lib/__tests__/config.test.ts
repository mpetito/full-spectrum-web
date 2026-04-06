/** Tests for config loading and validation. */
import { describe, it, expect } from 'vitest';
import { loadConfigFromJson, validateConfig, defaultConfig, ConfigError, type Dither3DConfig } from '../config';

const VALID_CYCLIC_JSON = JSON.stringify({
    layer_height_mm: 0.1,
    target_format: 'both',
    color_mappings: [
        {
            input_filament: 1,
            output_palette: {
                type: 'cyclic',
                pattern: [1, 2, 3],
            },
        },
    ],
});

const VALID_GRADIENT_JSON = JSON.stringify({
    layer_height_mm: 0.1,
    color_mappings: [
        {
            input_filament: 1,
            output_palette: {
                type: 'gradient',
                stops: [[0.0, 1], [0.5, 2], [1.0, 3]],
            },
        },
    ],
});

describe('loadConfigFromJson', () => {
    it('parses a valid cyclic config', () => {
        const cfg = loadConfigFromJson(VALID_CYCLIC_JSON);
        expect(cfg.layerHeightMm).toBe(0.1);
        expect(cfg.targetFormat).toBe('both');
        expect(cfg.colorMappings).toHaveLength(1);
        expect(cfg.colorMappings[0].inputFilament).toBe(1);
        expect(cfg.colorMappings[0].outputPalette.type).toBe('cyclic');
        const palette = cfg.colorMappings[0].outputPalette;
        if (palette.type === 'cyclic') {
            expect([...palette.pattern]).toEqual([1, 2, 3]);
        }
        expect(cfg.boundarySplit).toBe(true);
        expect(cfg.maxSplitDepth).toBe(9);
        expect(cfg.boundaryStrategy).toBe('bisection');
    });

    it('parses a valid gradient config', () => {
        const cfg = loadConfigFromJson(VALID_GRADIENT_JSON);
        expect(cfg.colorMappings).toHaveLength(1);
        const palette = cfg.colorMappings[0].outputPalette;
        expect(palette.type).toBe('gradient');
        if (palette.type === 'gradient') {
            expect(palette.stops).toHaveLength(3);
            expect(palette.stops[0]).toEqual({ t: 0.0, filament: 1 });
            expect(palette.stops[1]).toEqual({ t: 0.5, filament: 2 });
            expect(palette.stops[2]).toEqual({ t: 1.0, filament: 3 });
        }
    });

    it('throws on missing layer_height_mm', () => {
        const json = JSON.stringify({ color_mappings: [] });
        expect(() => loadConfigFromJson(json)).toThrow(ConfigError);
        expect(() => loadConfigFromJson(json)).toThrow('layer_height_mm');
    });

    it('throws on invalid JSON', () => {
        expect(() => loadConfigFromJson('not json{')).toThrow(ConfigError);
        expect(() => loadConfigFromJson('not json{')).toThrow('Invalid JSON');
    });

    it('defaults color_mappings to empty array when missing', () => {
        const json = JSON.stringify({ layer_height_mm: 0.1 });
        const cfg = loadConfigFromJson(json);
        expect(cfg.colorMappings).toEqual([]);
    });

    it('throws on unknown palette type', () => {
        const json = JSON.stringify({
            layer_height_mm: 0.1,
            color_mappings: [
                {
                    input_filament: 1,
                    output_palette: { type: 'unknown' },
                },
            ],
        });
        expect(() => loadConfigFromJson(json)).toThrow(ConfigError);
        expect(() => loadConfigFromJson(json)).toThrow('Unknown palette type');
    });
});

describe('validateConfig', () => {
    // Helper to build a valid config with overrides for isolated validation tests
    function testConfig(overrides: Partial<Dither3DConfig> = {}): Dither3DConfig {
        return {
            layerHeightMm: 0.1,
            targetFormat: 'both',
            colorMappings: [],
            boundarySplit: true,
            maxSplitDepth: 9,
            boundaryStrategy: 'bisection',
            ...overrides,
        };
    }

    it('returns no warnings for a valid config', () => {
        const cfg = loadConfigFromJson(VALID_CYCLIC_JSON);
        const warnings = validateConfig(cfg);
        expect(warnings).toEqual([]);
    });

    it('throws when layer_height outside [0.04, 0.2]', () => {
        const cfg = testConfig({ layerHeightMm: 0.01 });
        expect(() => validateConfig(cfg)).toThrow(ConfigError);
        expect(() => validateConfig(cfg)).toThrow('outside valid range');
    });

    it('warns when layer_height outside [0.08, 0.12]', () => {
        const cfg = testConfig({ layerHeightMm: 0.05 });
        const warnings = validateConfig(cfg);
        expect(warnings.length).toBeGreaterThan(0);
        expect(warnings[0]).toContain('outside recommended range');
    });

    it('throws on invalid boundary_strategy', () => {
        const cfg = testConfig({ boundaryStrategy: 'invalid' });
        expect(() => validateConfig(cfg)).toThrow(ConfigError);
        expect(() => validateConfig(cfg)).toThrow('boundary_strategy');
    });

    it('throws when max_split_depth is negative', () => {
        const cfg = testConfig({ maxSplitDepth: -1 });
        expect(() => validateConfig(cfg)).toThrow(ConfigError);
        expect(() => validateConfig(cfg)).toThrow('non-negative');
    });

    it('clamps max_split_depth exceeding MAX_BISECTION_DEPTH', () => {
        const cfg = testConfig({ maxSplitDepth: 25 });
        const warnings = validateConfig(cfg);
        expect(warnings.some((w) => w.includes('clamping'))).toBe(true);
        expect(cfg.maxSplitDepth).toBe(20);
    });

    it('throws when input_filament out of [1, 10]', () => {
        const cfg = testConfig({
            colorMappings: [
                { inputFilament: 0, outputPalette: { type: 'cyclic', pattern: [1] } },
            ],
        });
        expect(() => validateConfig(cfg)).toThrow(ConfigError);
        expect(() => validateConfig(cfg)).toThrow('input_filament');
    });

    it('throws when cyclic pattern filament out of range', () => {
        const cfg = testConfig({
            colorMappings: [
                { inputFilament: 1, outputPalette: { type: 'cyclic', pattern: [1, 99] } },
            ],
        });
        expect(() => validateConfig(cfg)).toThrow(ConfigError);
        expect(() => validateConfig(cfg)).toThrow('outside range');
    });

    it('throws when gradient stops not sorted', () => {
        const cfg = testConfig({
            colorMappings: [
                {
                    inputFilament: 1,
                    outputPalette: {
                        type: 'gradient',
                        stops: [{ t: 0.5, filament: 1 }, { t: 0.2, filament: 2 }],
                    },
                },
            ],
        });
        expect(() => validateConfig(cfg)).toThrow(ConfigError);
        expect(() => validateConfig(cfg)).toThrow('not sorted');
    });

    it('throws when gradient t outside [0, 1]', () => {
        const cfg = testConfig({
            colorMappings: [
                {
                    inputFilament: 1,
                    outputPalette: {
                        type: 'gradient',
                        stops: [{ t: -0.1, filament: 1 }, { t: 1.0, filament: 2 }],
                    },
                },
            ],
        });
        expect(() => validateConfig(cfg)).toThrow(ConfigError);
        expect(() => validateConfig(cfg)).toThrow('outside [0.0, 1.0]');
    });

    it('rejects invalid configs via loadConfigFromJson', () => {
        expect(() =>
            loadConfigFromJson(JSON.stringify({ layer_height_mm: 0.01, color_mappings: [] })),
        ).toThrow(ConfigError);
        expect(() =>
            loadConfigFromJson(JSON.stringify({ layer_height_mm: 0.01, color_mappings: [] })),
        ).toThrow('outside valid range');
    });
});

describe('defaultConfig', () => {
    it('creates a valid config', () => {
        const cfg = defaultConfig(0.1);
        expect(cfg.layerHeightMm).toBe(0.1);
        expect(cfg.colorMappings.length).toBeGreaterThan(0);
    });

    it('uses "both" as default target_format', () => {
        const cfg = defaultConfig(0.1);
        expect(cfg.targetFormat).toBe('both');
    });

    it('validates without errors', () => {
        const cfg = defaultConfig(0.1);
        const warnings = validateConfig(cfg);
        expect(warnings).toEqual([]);
    });
});
