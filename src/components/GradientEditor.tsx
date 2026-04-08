import { useTranslation } from 'react-i18next';
import { FILAMENT_COLORS } from '../constants';
import { MAX_FILAMENTS } from '../lib/encoding';
import type { GradientStop } from '../lib/config';

interface GradientEditorProps {
  stops: GradientStop[];
  onChange: (stops: GradientStop[]) => void;
}

function buildGradientCSS(stops: GradientStop[]): string {
  if (stops.length === 0) return 'transparent';
  const sorted = [...stops].sort((a, b) => a.t - b.t);
  const parts = sorted.map(
    (s) => `${FILAMENT_COLORS[s.filament] ?? '#808080'} ${(s.t * 100).toFixed(0)}%`,
  );
  return `linear-gradient(to right, ${parts.join(', ')})`;
}

export function GradientEditor({ stops, onChange }: GradientEditorProps) {
  const { t } = useTranslation();
  const updateStop = (index: number, patch: Partial<GradientStop>) => {
    const next = stops.map((s, i) => (i === index ? { ...s, ...patch } : s));
    onChange(next);
  };

  const removeStop = (index: number) => {
    if (stops.length <= 2) return;
    onChange(stops.filter((_, i) => i !== index));
  };

  const addStop = () => {
    onChange([...stops, { t: 1.0, filament: 1 }]);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-gray-500 dark:text-gray-400">
        {t('gradientEditor.label', { count: stops.length })}
      </span>

      {/* Preview bar */}
      <div
        className="h-3 rounded-sm border border-gray-300 dark:border-gray-600"
        style={{ background: buildGradientCSS(stops) }}
      />

      <div className="flex flex-col gap-1">
        {stops.map((stop, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={stop.t}
              onChange={(e) => updateStop(i, { t: parseFloat(e.target.value) || 0 })}
              className="w-16 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-1.5 py-0.5 text-xs tabular-nums"
            />
            <select
              value={stop.filament}
              onChange={(e) => updateStop(i, { filament: Number(e.target.value) })}
              className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 pl-1 pr-5 py-0.5 text-xs"
              style={{ borderLeftColor: FILAMENT_COLORS[stop.filament] ?? '#808080', borderLeftWidth: 3 }}
            >
              {Array.from({ length: MAX_FILAMENTS }, (_, n) => n + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            {stops.length > 2 && (
              <button
                onClick={() => removeStop(i)}
                className="text-gray-400 hover:text-red-500 text-xs leading-none"
                title={t('gradientEditor.removeStopTooltip')}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>

      <button
        onClick={addStop}
        className="self-start rounded border border-dashed border-gray-300 dark:border-gray-600 px-2 py-0.5 text-xs text-gray-500 hover:text-indigo-600 hover:border-indigo-400"
      >
        {t('gradientEditor.addStop')}
      </button>
    </div>
  );
}
