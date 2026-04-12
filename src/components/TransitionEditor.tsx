import { useTranslation } from 'react-i18next';
import { MAX_FILAMENTS } from '../lib/encoding';
import type { GradientStop, TransitionWidth, TransitionPalette } from '../lib/config';
import { buildTransitionLayerMap, type PaletteContext } from '../lib/palette';
import { NumericInput } from './NumericInput';

interface TransitionEditorProps {
  stops: GradientStop[];
  transitionWidth: TransitionWidth;
  maxCycleLength: number;
  onChange: (update: Partial<TransitionPalette>) => void;
  filamentColors: string[];
}

function contrastText(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 0xff, g = (n >> 8) & 0xff, b = n & 0xff;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5 ? '#000' : '#fff';
}

const PREVIEW_LAYERS = 100;

function buildPreviewCSS(
  stops: GradientStop[],
  transitionWidth: TransitionWidth,
  maxCycleLength: number,
  filamentColors: string[],
): string {
  if (stops.length < 2) return 'transparent';

  const ctx: PaletteContext = { layerHeightMm: 0.12 };
  const tuples = stops.map((s) => [s.t, s.filament] as [number, number]);
  const layerMap = buildTransitionLayerMap(PREVIEW_LAYERS, tuples, transitionWidth, maxCycleLength, ctx);

  // Build CSS gradient from layer map segments
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

export function TransitionEditor({ stops, transitionWidth, maxCycleLength, onChange, filamentColors }: TransitionEditorProps) {
  const { t } = useTranslation();

  const updateStop = (index: number, patch: Partial<GradientStop>) => {
    const next = stops.map((s, i) => (i === index ? { ...s, ...patch } : s));
    onChange({ stops: next });
  };

  const removeStop = (index: number) => {
    if (stops.length <= 2) return;
    onChange({ stops: stops.filter((_, i) => i !== index) });
  };

  const addStop = () => {
    onChange({ stops: [...stops, { t: 1.0, filament: 1 }] });
  };

  const setWidthMode = (mode: TransitionWidth['mode']) => {
    if (mode === 'auto') {
      onChange({ transitionWidth: { mode: 'auto' } });
    } else if (mode === 'percent') {
      onChange({ transitionWidth: { mode: 'percent', value: 0.5 } });
    } else {
      onChange({ transitionWidth: { mode: 'mm', value: 2.4 } });
    }
  };

  const setWidthValue = (value: number) => {
    if (transitionWidth.mode === 'percent') {
      onChange({ transitionWidth: { mode: 'percent', value } });
    } else if (transitionWidth.mode === 'mm') {
      onChange({ transitionWidth: { mode: 'mm', value } });
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-gray-500 dark:text-gray-400">
        {t('transitionEditor.label', { count: stops.length })}
      </span>

      {/* Preview bar */}
      <div
        className="h-3 rounded-sm border border-gray-300 dark:border-gray-600"
        style={{ background: buildPreviewCSS(stops, transitionWidth, maxCycleLength, filamentColors) }}
      />

      {/* Stops editor */}
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
                title={t('transitionEditor.removeStopTooltip')}
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
        {t('transitionEditor.addStop')}
      </button>

      {/* Transition width mode */}
      <div className="flex items-center gap-1.5">
        <select
          value={transitionWidth.mode}
          onChange={(e) => setWidthMode(e.target.value as TransitionWidth['mode'])}
          className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-1 py-0.5 text-xs"
        >
          <option value="auto">{t('transitionEditor.widthModeAuto')}</option>
          <option value="percent">{t('transitionEditor.widthModePercent')}</option>
          <option value="mm">{t('transitionEditor.widthModeMm')}</option>
        </select>
        {transitionWidth.mode === 'percent' && (
          <NumericInput
            value={transitionWidth.value}
            onChange={(v) => setWidthValue(v)}
            min={0.01}
            max={1}
            step={0.01}
            className="w-16 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-1.5 py-0.5 text-xs tabular-nums"
          />
        )}
        {transitionWidth.mode === 'mm' && (
          <NumericInput
            value={transitionWidth.value}
            onChange={(v) => setWidthValue(v)}
            min={0.01}
            step={0.1}
            className="w-16 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-1.5 py-0.5 text-xs tabular-nums"
          />
        )}
      </div>

      {/* Max cycle length */}
      <div className="flex items-center gap-1.5">
        <label className="text-xs text-gray-500 dark:text-gray-400">
          {t('transitionEditor.maxCycleLength')}
        </label>
        <NumericInput
          value={maxCycleLength}
          onChange={(v) => onChange({ maxCycleLength: v })}
          min={1}
          step={1}
          integer
          className="w-16 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-1.5 py-0.5 text-xs tabular-nums"
        />
      </div>
    </div>
  );
}
