import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SAMPLES, fetchSample, type SampleDefinition } from '../samples';

describe('SAMPLES registry', () => {
  it('contains at least one sample', () => {
    expect(SAMPLES.length).toBeGreaterThanOrEqual(1);
  });

  it('each sample has required fields', () => {
    for (const s of SAMPLES) {
      expect(s.id).toBeTruthy();
      expect(s.modelPath).toMatch(/\.3mf$/);
      expect(s.configPath).toMatch(/\.config\.json$/);
      expect(s.labelKey).toBeTruthy();
      expect(s.descriptionKey).toBeTruthy();
    }
  });

  it('sample ids are unique', () => {
    const ids = SAMPLES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('fetchSample', () => {
  const sampleConfig = {
    filament_colors: ['#808080', '#E74C3C', '#3498DB'],
    layer_height_mm: 0.08,
    target_format: 'both',
    boundary_split: true,
    max_split_depth: 9,
    boundary_strategy: 'bisection',
    color_mappings: [
      {
        input_filament: 1,
        output_palette: { type: 'cyclic', pattern: [1, 2] },
      },
    ],
  };

  // Minimal valid 3MF is a ZIP with model XML — mock the fetch response
  const mockModelBuffer = new ArrayBuffer(8);
  const mockConfigText = JSON.stringify(sampleConfig);

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns config and filament colors from a successful fetch', async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('.3mf')) {
        return Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(mockModelBuffer),
        });
      }
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve(mockConfigText),
      });
    });
    vi.stubGlobal('fetch', mockFetch);

    // We need to mock read3mf since the mock arrayBuffer isn't real 3MF
    // Instead, just test that fetchSample calls fetch with correct URLs and parses config
    const sample: SampleDefinition = SAMPLES[0];

    // fetchSample calls read3mf internally in the component, not in fetchSample itself
    // fetchSample returns the raw buffer + parsed config
    const data = await fetchSample(sample, '/');

    expect(mockFetch).toHaveBeenCalledWith(sample.modelPath);
    expect(mockFetch).toHaveBeenCalledWith(sample.configPath);
    expect(data.modelBuffer).toBe(mockModelBuffer);
    expect(data.config.layerHeightMm).toBe(0.08);
    expect(data.config.colorMappings).toHaveLength(1);
    expect(data.filamentColors).toEqual(['#808080', '#E74C3C', '#3498DB']);
    expect(data.filename).toBe('3DBenchy');
  });

  it('prefixes fetch URLs with baseUrl', async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('.3mf')) {
        return Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(mockModelBuffer),
        });
      }
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve(mockConfigText),
      });
    });
    vi.stubGlobal('fetch', mockFetch);

    await fetchSample(SAMPLES[0], '/dither3d/');

    expect(mockFetch).toHaveBeenCalledWith(`/dither3d${SAMPLES[0].modelPath}`);
    expect(mockFetch).toHaveBeenCalledWith(`/dither3d${SAMPLES[0].configPath}`);
  });

  it('throws on model fetch failure', async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('.3mf')) {
        return Promise.resolve({ ok: false, status: 404 });
      }
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve(mockConfigText),
      });
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(fetchSample(SAMPLES[0], '/')).rejects.toThrow('Failed to fetch model');
  });

  it('throws on config fetch failure', async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('.config.json')) {
        return Promise.resolve({ ok: false, status: 500 });
      }
      return Promise.resolve({
        ok: true,
        arrayBuffer: () => Promise.resolve(mockModelBuffer),
      });
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(fetchSample(SAMPLES[0], '/')).rejects.toThrow('Failed to fetch config');
  });

  it('handles config without filament_colors', async () => {
    const configNoColors = { ...sampleConfig };
    delete (configNoColors as Record<string, unknown>)['filament_colors'];

    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('.3mf')) {
        return Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(mockModelBuffer),
        });
      }
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(configNoColors)),
      });
    });
    vi.stubGlobal('fetch', mockFetch);

    const data = await fetchSample(SAMPLES[0], '/');
    expect(data.filamentColors).toBeUndefined();
  });

  it('throws descriptive error on malformed JSON config', async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('.3mf')) {
        return Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(mockModelBuffer),
        });
      }
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve('not valid json {{{'),
      });
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(fetchSample(SAMPLES[0], '/')).rejects.toThrow(
      `Failed to parse config: ${SAMPLES[0].configPath}`,
    );
  });

  it('ignores filament_colors with non-string elements', async () => {
    const configBadColors = { ...sampleConfig, filament_colors: [1, null, '#FF0000'] };

    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('.3mf')) {
        return Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(mockModelBuffer),
        });
      }
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(configBadColors)),
      });
    });
    vi.stubGlobal('fetch', mockFetch);

    const data = await fetchSample(SAMPLES[0], '/');
    expect(data.filamentColors).toBeUndefined();
  });

  it('clamps filament_colors to FILAMENT_COLORS length', async () => {
    const longColors = Array.from({ length: 50 }, (_, i) => `#${String(i).padStart(6, '0')}`);
    const configLong = { ...sampleConfig, filament_colors: longColors };

    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('.3mf')) {
        return Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(mockModelBuffer),
        });
      }
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(configLong)),
      });
    });
    vi.stubGlobal('fetch', mockFetch);

    const data = await fetchSample(SAMPLES[0], '/');
    // FILAMENT_COLORS has 11 entries
    expect(data.filamentColors).toHaveLength(11);
  });

  it('works with empty string baseUrl', async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('.3mf')) {
        return Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(mockModelBuffer),
        });
      }
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve(mockConfigText),
      });
    });
    vi.stubGlobal('fetch', mockFetch);

    await fetchSample(SAMPLES[0], '');

    expect(mockFetch).toHaveBeenCalledWith(SAMPLES[0].modelPath);
    expect(mockFetch).toHaveBeenCalledWith(SAMPLES[0].configPath);
  });

  it('ignores filament_colors with invalid hex format', async () => {
    const configBadHex = { ...sampleConfig, filament_colors: ['#808080', 'not-a-color', '#3498DB'] };

    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('.3mf')) {
        return Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(mockModelBuffer),
        });
      }
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(configBadHex)),
      });
    });
    vi.stubGlobal('fetch', mockFetch);

    const data = await fetchSample(SAMPLES[0], '/');
    expect(data.filamentColors).toBeUndefined();
  });

  it('preserves original error as cause on malformed JSON', async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('.3mf')) {
        return Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(mockModelBuffer),
        });
      }
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve('not valid json {{{'),
      });
    });
    vi.stubGlobal('fetch', mockFetch);

    try {
      await fetchSample(SAMPLES[0], '/');
      expect.fail('Expected an error');
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect((e as Error).cause).toBeInstanceOf(SyntaxError);
    }
  });
});
