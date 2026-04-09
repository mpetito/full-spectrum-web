import { loadConfigFromJson, type Dither3DConfig } from './config';
import { FILAMENT_COLORS } from '../constants';

export interface SampleDefinition {
  /** Unique slug used as i18n key prefix and HTML id */
  id: string;
  /** Path relative to the public root for the 3MF file */
  modelPath: string;
  /** Path relative to the public root for the config JSON */
  configPath: string;
  /** i18n key for the human-readable label */
  labelKey: string;
  /** i18n key for a short description */
  descriptionKey: string;
}

export interface SampleData {
  modelBuffer: ArrayBuffer;
  config: Dither3DConfig;
  filamentColors?: string[];
  filename: string;
}

export const SAMPLES: readonly SampleDefinition[] = [
  {
    id: 'benchy-cyclic',
    modelPath: '/samples/3DBenchy.3mf',
    configPath: '/samples/3DBenchy-cyclic.config.json',
    labelKey: 'samples.benchyCyclic.label',
    descriptionKey: 'samples.benchyCyclic.description',
  },
  {
    id: 'benchy-2color-gradient',
    modelPath: '/samples/3DBenchy-2color.3mf',
    configPath: '/samples/3DBenchy-2color-gradient.config.json',
    labelKey: 'samples.benchy2colorGradient.label',
    descriptionKey: 'samples.benchy2colorGradient.description',
  },
  {
    id: 'cylinder-cyclic',
    modelPath: '/samples/Cylinder.3mf',
    configPath: '/samples/Cylinder-cyclic.config.json',
    labelKey: 'samples.cylinderCyclic.label',
    descriptionKey: 'samples.cylinderCyclic.description',
  },
] as const;

export async function fetchSample(
  sample: SampleDefinition,
  baseUrl: string = import.meta.env.BASE_URL,
): Promise<SampleData> {
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const [modelRes, configRes] = await Promise.all([
    fetch(`${base}${sample.modelPath}`),
    fetch(`${base}${sample.configPath}`),
  ]);

  if (!modelRes.ok) {
    throw new Error(`Failed to fetch model: ${sample.modelPath} (${modelRes.status})`);
  }
  if (!configRes.ok) {
    throw new Error(`Failed to fetch config: ${sample.configPath} (${configRes.status})`);
  }

  const modelBuffer = await modelRes.arrayBuffer();
  const configText = await configRes.text();

  // Parse the raw JSON to extract filament_colors before passing to loadConfigFromJson
  let rawJson: Record<string, unknown>;
  try {
    rawJson = JSON.parse(configText) as Record<string, unknown>;
  } catch (cause) {
    throw new Error(`Failed to parse config: ${sample.configPath}`, { cause });
  }

  const HEX_COLOR_RE = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;
  const { filament_colors: rawColors, ...rest } = rawJson;
  const filamentColors =
    Array.isArray(rawColors) && rawColors.every((x): x is string => typeof x === 'string' && HEX_COLOR_RE.test(x))
      ? rawColors.slice(0, FILAMENT_COLORS.length)
      : undefined;

  const config = loadConfigFromJson(JSON.stringify(rest));

  // Derive filename stem from model path
  const filename = sample.modelPath.split('/').pop()?.replace(/\.3mf$/i, '') ?? sample.id;

  return { modelBuffer, config, filamentColors, filename };
}
