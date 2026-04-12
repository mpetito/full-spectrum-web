import { useTranslation } from 'react-i18next';
import { MAX_FILAMENTS } from '../lib/encoding';
import { buildBresenhamLayerMap } from '../lib/palette';
import type { GradientStop } from '../lib/config';
import { NumericInput } from './NumericInput';

interface BresenhamEditorProps {
  stops: GradientStop[];
  onChange: (stops: GradientStop[]) => void;
  filamentColors: string[];
}

function contrastText(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 0xff, g = (n >> 8) & 0xff, b = n & 0xff;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5 ? '#000' : '#fff';
}

const PREVIEW_LAYERS = 100;

function buildBresenhamCSS(stops: GradientStop[], filamentColors: string[]): string {
  if (stops.length === 0) return 'transparent';
  const tuples = stops
    .map((s) => [s.t, s.filament] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const layerMap = buildBresenhamLayerMap(PREVIEW_LAYERS, tuples);

  const parts: string[] = [];
  let runStart = 0;
  let runColor = filamentColors[layerMap[0]] ?? '#808080';

  for (let i = 1; i <= PREVIEW_LAYERS; i++) {
    const color = i < PREVIEW_LAYERS ? (filamentColors[layerMap[i]] ?? '#808080') : '#808080';
    if (i === PREVIEW_LAYERS || color !== runColor) {
      const startPct = ((runStart / PREVIEW_LAYERS) * 100).toFixed(1);
      const endPct = ((i / PREVIEW_LAYERS) * 100).toFixed(1);
      parts.push(`${runColor} ${startPct}% ${endPct}%`);
      if (i < PREVIEW_LAYERS) {
        runStart = i;
        runColor = color;
      }
    }
  }

  return `linear-gradient(to right, ${parts.join(', ')})`;
}

export function BresenhamEditor({ stops, onChange, filamentColors }: BresenhamEditorProps) {
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
        {t('bresenhamEditor.label', { count: stops.length })}
      </span>

      {/* Preview bar */}
      <div
        className="h-3 rounded-sm border border-gray-300 dark:border-gray-600"
        style={{ background: buildBresenhamCSS(stops, filamentColors) }}
      />

      <div className="flex flex-col gap-1">
        {stops.map((stop, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <NumericInput
              value={stop.t}
              onChange={(v) => updateStop(i, { t: v })}
              min={0}
              max={1}
              step={0.01}
              className="w-16 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-1.5 py-0.5 text-xs tabular-nums"
            />
            <select
              value={stop.filament}
              onChange={(e) => updateStop(i, { filament: Number(e.target.value) })}
              className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 pl-1 pr-5 py-0.5 text-xs"
              style={{ borderLeftColor: filamentColors[stop.filament] ?? '#808080', borderLeftWidth: 3 }}
            >
              {Array.from({ length: MAX_FILAMENTS }, (_, n) => n + 1).map((n) => (
                <option key={n} value={n} style={{ backgroundColor: filamentColors[n] ?? '#808080', color: contrastText(filamentColors[n] ?? '#808080') }}>
                  {n}
                </option>
              ))}
            </select>
            {stops.length > 2 && (
              <button
                onClick={() => removeStop(i)}
                className="text-gray-400 hover:text-red-500 text-xs leading-none"
                title={t('bresenhamEditor.removeStopTooltip')}
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
        {t('bresenhamEditor.addStop')}
      </button>
    </div>
  );
}
