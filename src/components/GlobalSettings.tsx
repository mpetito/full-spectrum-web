import { useTranslation } from 'react-i18next';
import { useAppState, useAppDispatch } from '../state/AppContext';
import { defaultConfig, type Dither3DConfig } from '../lib/config';

export function GlobalSettings() {
  const { t } = useTranslation();
  const { config, autoApply, status } = useAppState();
  const dispatch = useAppDispatch();

  const update = (patch: Partial<Dither3DConfig>) => {
    dispatch({ type: 'UPDATE_CONFIG', config: { ...config, ...patch } });
  };

  const defaults = defaultConfig(0.1);

  return (
    <section>
      <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
        {t('globalSettings.heading')}
      </h2>
      <div className="flex flex-col gap-3">
        {/* Layer height */}
        <label htmlFor="layer-height" className="flex flex-col gap-1" onDoubleClick={() => update({ layerHeightMm: defaults.layerHeightMm })} title={t('globalSettings.resetTooltip')}>
          <span className="text-xs text-gray-600 dark:text-gray-400">
            {t('globalSettings.layerHeight', { value: config.layerHeightMm.toFixed(2) })}
          </span>
          <input
            id="layer-height"
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
        <label htmlFor="target-format" className="flex flex-col gap-1" onDoubleClick={() => update({ targetFormat: defaults.targetFormat })} title={t('globalSettings.resetTooltip')}>
          <span className="text-xs text-gray-600 dark:text-gray-400">{t('globalSettings.targetFormat')}</span>
          <select
            id="target-format"
            value={config.targetFormat}
            onChange={(e) => update({ targetFormat: e.target.value })}
            className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-sm"
          >
            <option value="prusaslicer">{t('globalSettings.formatPrusaslicer')}</option>
            <option value="bambu">{t('globalSettings.formatBambu')}</option>
            <option value="both">{t('globalSettings.formatBoth')}</option>
          </select>
        </label>

        {/* Boundary split */}
        <label htmlFor="boundary-split" className="flex items-center gap-2 text-sm" onDoubleClick={() => update({ boundarySplit: defaults.boundarySplit })} title={t('globalSettings.resetTooltip')}>
          <input
            id="boundary-split"
            type="checkbox"
            checked={config.boundarySplit}
            onChange={(e) => update({ boundarySplit: e.target.checked })}
            className="accent-indigo-600"
          />
          {t('globalSettings.boundarySplit')}
        </label>

        {/* Max split depth */}
        {config.boundarySplit && (
          <label htmlFor="max-split-depth" className="flex flex-col gap-1" onDoubleClick={() => update({ maxSplitDepth: defaults.maxSplitDepth })} title={t('globalSettings.resetTooltip')}>
            <span className="text-xs text-gray-600 dark:text-gray-400">
              {t('globalSettings.maxSplitDepth', { value: config.maxSplitDepth })}
            </span>
            <input
              id="max-split-depth"
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

        {/* Auto-apply toggle */}
        <div className="flex items-center gap-2 mt-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoApply}
              onChange={() => dispatch({ type: "TOGGLE_AUTO_APPLY" })}
              className="accent-indigo-600"
            />
            {t('globalSettings.autoApply')}
          </label>
        </div>
        {!autoApply && (
          <button
            onClick={() => dispatch({ type: "MANUAL_APPLY" })}
            disabled={status === 'processing'}
            className="mt-2 px-4 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 disabled:opacity-50"
          >
            {t('globalSettings.applyButton')}
          </button>
        )}
      </div>
    </section>
  );
}
