import { useRef, useState } from 'react';
import { useAppState, useAppDispatch } from '../state/AppContext';
import { loadConfigFromJson, type FullSpectrumConfig } from '../lib/config';

function configToJson(config: FullSpectrumConfig): string {
  return JSON.stringify(
    {
      layer_height_mm: config.layerHeightMm,
      target_format: config.targetFormat,
      boundary_split: config.boundarySplit,
      max_split_depth: config.maxSplitDepth,
      boundary_strategy: config.boundaryStrategy,
      color_mappings: config.colorMappings.map((cm) => ({
        input_filament: cm.inputFilament,
        output_palette:
          cm.outputPalette.type === 'cyclic'
            ? { type: 'cyclic', pattern: [...cm.outputPalette.pattern] }
            : {
                type: 'gradient',
                stops: cm.outputPalette.stops.map((s) => [s.t, s.filament]),
              },
      })),
    },
    null,
    2,
  );
}

export function ConfigImportExport() {
  const { config } = useAppState();
  const dispatch = useAppDispatch();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExport = () => {
    const json = configToJson(config);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'full-spectrum.config.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = loadConfigFromJson(text);
      dispatch({ type: 'UPDATE_CONFIG', config: parsed });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse config');
    }
    // Reset input so same file can be re-imported
    e.target.value = '';
  };

  return (
    <section>
      <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
        Config
      </h2>
      <div className="flex gap-2">
        <button
          onClick={handleExport}
          className="px-3 py-1.5 rounded text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700"
        >
          Export
        </button>
        <button
          onClick={handleImport}
          className="px-3 py-1.5 rounded text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          Import
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
      {error && (
        <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </section>
  );
}
