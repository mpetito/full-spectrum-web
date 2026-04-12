import { useTranslation } from 'react-i18next';
import { MAX_FILAMENTS } from '../lib/encoding';

interface CyclicEditorProps {
  pattern: number[];
  onChange: (pattern: number[]) => void;
  filamentColors: string[];
}

export function CyclicEditor({ pattern, onChange, filamentColors }: CyclicEditorProps) {
  const { t } = useTranslation();
  const updateEntry = (index: number, value: number) => {
    const next = [...pattern];
    next[index] = value;
    onChange(next);
  };

  const removeEntry = (index: number) => {
    if (pattern.length <= 1) return;
    onChange(pattern.filter((_, i) => i !== index));
  };

  const addEntry = () => {
    onChange([...pattern, 1]);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-gray-500 dark:text-gray-400">
        {t('cyclicEditor.label', { count: pattern.length })}
      </span>
      <div className="flex flex-wrap gap-1.5 items-center">
        {pattern.map((filament, i) => (
          <div key={i} className="flex items-center gap-0.5">
            <select
              value={filament}
              onChange={(e) => updateEntry(i, Number(e.target.value))}
              className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 pl-1 pr-5 py-0.5 text-xs"
              style={{ borderLeftColor: filamentColors[filament] ?? '#808080', borderLeftWidth: 3 }}
            >
              {Array.from({ length: MAX_FILAMENTS }, (_, n) => n + 1).map((n) => (
                <option key={n} value={n} style={{ backgroundColor: filamentColors[n] ?? '#808080', color: '#fff' }}>
                  {n}
                </option>
              ))}
            </select>
            {pattern.length > 1 && (
              <button
                onClick={() => removeEntry(i)}
                className="text-gray-400 hover:text-red-500 text-xs leading-none"
                title={t('cyclicEditor.removeTooltip')}
              >
                ×
              </button>
            )}
          </div>
        ))}
        <button
          onClick={addEntry}
          className="rounded border border-dashed border-gray-300 dark:border-gray-600 px-1.5 py-0.5 text-xs text-gray-500 hover:text-indigo-600 hover:border-indigo-400"
        >
          {t('cyclicEditor.addEntry')}
        </button>
      </div>
    </div>
  );
}
