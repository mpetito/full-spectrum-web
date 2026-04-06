import { useRef, useState } from 'react';
import { useAppState, useAppDispatch } from '../state/AppContext';
import { loadConfigFromJson, type Dither3DConfig } from '../lib/config';

function configToJson(config: Dither3DConfig): string {
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

export function ConfigExportButton() {
  const { config } = useAppState();

  const handleExport = () => {
    const json = configToJson(config);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dither3d.config.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button
      onClick={handleExport}
      className="w-full px-3 py-1.5 rounded text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
    >
      Export config
    </button>
  );
}

export function ConfigImportButton() {
  const dispatch = useAppDispatch();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

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
    <div className="flex flex-col">
      <button
        onClick={handleImport}
        className="px-2 py-0.5 rounded text-xs font-medium border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
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
      {error && (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
