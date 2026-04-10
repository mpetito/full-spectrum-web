/** JSON palette configuration loading and validation. */

import { MAX_BISECTION_DEPTH, MAX_FILAMENTS } from './encoding';
import { getPaletteStrategy } from './palette';

export class ConfigError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ConfigError';
    }
}

export interface CyclicPalette {
    type: 'cyclic';
    pattern: readonly number[];
}

export interface GradientStop {
    t: number;
    filament: number;
}

export interface GradientPalette {
    type: 'gradient';
    stops: readonly GradientStop[];
}

export type Palette = CyclicPalette | GradientPalette;

export interface ColorMapping {
    inputFilament: number;
    outputPalette: Palette;
}

export interface Dither3DConfig {
    layerHeightMm: number;
    targetFormat: string;
    colorMappings: readonly ColorMapping[];
    boundarySplit: boolean;
    maxSplitDepth: number;
    boundaryStrategy: string;
}

function parsePalette(data: Record<string, unknown>): Palette {
    const paletteType = data['type'];
    if (typeof paletteType !== 'string') {
        throw new ConfigError("Palette requires a 'type' field");
    }
    try {
        return getPaletteStrategy(paletteType).parse(data);
    } catch (e) {
        if (e instanceof Error) throw new ConfigError(e.message);
        throw e;
    }
}

export function loadConfigFromJson(json: string): Dither3DConfig {
    let raw: Record<string, unknown>;
    try {
        raw = JSON.parse(json) as Record<string, unknown>;
    } catch (e) {
        throw new ConfigError(`Invalid JSON: ${(e as Error).message}`);
    }

    const layerHeight = raw['layer_height_mm'];
    if (layerHeight === undefined || layerHeight === null) {
        throw new ConfigError("Missing required field: 'layer_height_mm'");
    }

    const targetFormat = (raw['target_format'] as string) ?? 'both';

    const mappings: ColorMapping[] = [];
    const rawMappings = (raw['color_mappings'] as unknown[]) ?? [];
    for (let i = 0; i < rawMappings.length; i++) {
        const cm = rawMappings[i] as Record<string, unknown>;
        const inputFil = cm['input_filament'];
        if (inputFil === undefined || inputFil === null) {
            throw new ConfigError(`color_mappings[${i}]: missing 'input_filament'`);
        }
        const paletteData = cm['output_palette'] as Record<string, unknown> | undefined;
        if (!paletteData) {
            throw new ConfigError(`color_mappings[${i}]: missing 'output_palette'`);
        }
        let palette: Palette;
        try {
            palette = parsePalette(paletteData);
        } catch (e) {
            if (e instanceof ConfigError) {
                throw new ConfigError(`color_mappings[${i}]: ${e.message}`);
            }
            throw e;
        }
        mappings.push({ inputFilament: inputFil as number, outputPalette: palette });
    }

    const config: Dither3DConfig = {
        layerHeightMm: layerHeight as number,
        targetFormat,
        colorMappings: mappings,
        boundarySplit: (raw['boundary_split'] as boolean) ?? true,
        maxSplitDepth: (raw['max_split_depth'] as number) ?? 9,
        boundaryStrategy: (raw['boundary_strategy'] as string) ?? 'bisection',
    };

    // Validate semantic constraints (throws ConfigError on invalid values)
    validateConfig(config);

    return config;
}

export function validateConfig(config: Dither3DConfig): string[] {
    const warnings: string[] = [];

    if (config.boundaryStrategy !== 'bisection' && config.boundaryStrategy !== 'geometry') {
        throw new ConfigError(
            `boundary_strategy must be 'bisection' or 'geometry', got '${config.boundaryStrategy}'`,
        );
    }

    if (config.maxSplitDepth < 0) {
        throw new ConfigError('max_split_depth must be non-negative');
    }
    if (config.maxSplitDepth > MAX_BISECTION_DEPTH) {
        warnings.push(`max_split_depth ${config.maxSplitDepth} exceeds MAX_BISECTION_DEPTH (${MAX_BISECTION_DEPTH}); clamping`);
        config.maxSplitDepth = MAX_BISECTION_DEPTH;
    }

    if (config.layerHeightMm < 0.04 || config.layerHeightMm > 0.2) {
        throw new ConfigError(
            `layer_height_mm ${config.layerHeightMm} outside valid range [0.04, 0.2]`,
        );
    }
    if (config.layerHeightMm < 0.08 || config.layerHeightMm > 0.12) {
        warnings.push(
            `layer_height_mm ${config.layerHeightMm} outside recommended range [0.08, 0.12]`,
        );
    }

    // Warn if bisection depth may be too shallow for the chosen layer height
    const minUsefulDepth = Math.ceil(Math.log2(config.layerHeightMm / 0.001));
    if (config.maxSplitDepth < minUsefulDepth) {
        warnings.push(
            `Split depth ${config.maxSplitDepth} may be too shallow for ` +
            `${config.layerHeightMm}mm layers (recommended ≥ ${minUsefulDepth})`,
        );
    }

    if (!['prusaslicer', 'bambu', 'both'].includes(config.targetFormat)) {
        warnings.push(
            `target_format '${config.targetFormat}' not recognized; expected 'prusaslicer', 'bambu', or 'both'`,
        );
    }

    for (let i = 0; i < config.colorMappings.length; i++) {
        const cm = config.colorMappings[i];
        if (cm.inputFilament < 1 || cm.inputFilament > MAX_FILAMENTS) {
            throw new ConfigError(
                `color_mappings[${i}]: input_filament ${cm.inputFilament} outside range [1, ${MAX_FILAMENTS}]`,
            );
        }
        try {
            getPaletteStrategy(cm.outputPalette.type).validate(cm.outputPalette, i);
        } catch (e) {
            if (e instanceof Error) throw new ConfigError(e.message);
            throw e;
        }
    }

    return warnings;
}

export function configToJson(config: Dither3DConfig): Record<string, unknown> {
    return {
        layer_height_mm: config.layerHeightMm,
        target_format: config.targetFormat,
        color_mappings: config.colorMappings.map((cm) => ({
            input_filament: cm.inputFilament,
            output_palette: getPaletteStrategy(cm.outputPalette.type).toJson(cm.outputPalette),
        })),
        boundary_split: config.boundarySplit,
        max_split_depth: config.maxSplitDepth,
        boundary_strategy: config.boundaryStrategy,
    };
}

export function defaultConfig(
    layerHeight: number,
    targetFormat = 'both',
): Dither3DConfig {
    return {
        layerHeightMm: layerHeight,
        targetFormat,
        colorMappings: [
            {
                inputFilament: 1,
                outputPalette: { type: 'cyclic', pattern: [1, 2] },
            },
        ],
        boundarySplit: true,
        maxSplitDepth: 9,
        boundaryStrategy: 'bisection',
    };
}
