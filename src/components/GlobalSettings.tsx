import { useAppState, useAppDispatch } from '../state/AppContext';
import type { FullSpectrumConfig } from '../lib/config';

export function GlobalSettings() {
  const { config } = useAppState();
  const dispatch = useAppDispatch();

  const update = (patch: Partial<FullSpectrumConfig>) => {
    dispatch({ type: 'UPDATE_CONFIG', config: { ...config, ...patch } });
  };

  return (
    <section>
      <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
        Settings
      </h2>
      <div className="flex flex-col gap-3">
        {/* Layer height */}
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-600 dark:text-gray-400">
            Layer height: {config.layerHeightMm.toFixed(2)} mm
          </span>
          <input
            type="range"
            min={0.04}
            max={0.2}
            step={0.01}
            value={config.layerHeightMm}
            onChange={(e) => update({ layerHeightMm: parseFloat(e.target.value) })}
            className="w-full accent-indigo-600"
          />
        </label>

        {/* Target format */}
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-600 dark:text-gray-400">Target format</span>
          <select
            value={config.targetFormat}
            onChange={(e) => update({ targetFormat: e.target.value })}
            className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-sm"
          >
            <option value="prusaslicer">PrusaSlicer</option>
            <option value="bambu">BambuStudio</option>
            <option value="both">Both</option>
          </select>
        </label>

        {/* Boundary split */}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={config.boundarySplit}
            onChange={(e) => update({ boundarySplit: e.target.checked })}
            className="accent-indigo-600"
          />
          Boundary split
        </label>

        {/* Max split depth */}
        {config.boundarySplit && (
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-600 dark:text-gray-400">
              Max split depth: {config.maxSplitDepth}
            </span>
            <input
              type="range"
              min={1}
              max={15}
              step={1}
              value={config.maxSplitDepth}
              onChange={(e) => update({ maxSplitDepth: parseInt(e.target.value, 10) })}
              className="w-full accent-indigo-600"
            />
          </label>
        )}
      </div>
    </section>
  );
}
