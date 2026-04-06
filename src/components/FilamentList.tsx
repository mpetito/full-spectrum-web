import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppState } from '../state/AppContext';
import { FILAMENT_COLORS } from '../constants';

export function FilamentList() {
  const { t } = useTranslation();
  const { meshData } = useAppState();

  const filaments = useMemo(() => {
    if (!meshData) return [];
    const counts = new Map<number, number>();

    // Count faces with explicit colors
    for (const [, fil] of meshData.faceColors) {
      counts.set(fil, (counts.get(fil) ?? 0) + 1);
    }

    // Count default-filament faces
    const explicitCount = meshData.faceColors.size;
    const defaultCount = meshData.faceCount - explicitCount;
    if (defaultCount > 0) {
      counts.set(
        meshData.defaultFilament,
        (counts.get(meshData.defaultFilament) ?? 0) + defaultCount,
      );
    }

    return Array.from(counts.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([filament, count]) => ({ filament, count }));
  }, [meshData]);

  if (filaments.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
        {t('filamentList.heading')}
      </h2>
      <ul className="flex flex-col gap-1">
        {filaments.map(({ filament, count }) => (
          <li
            key={filament}
            className="flex items-center gap-2 text-sm rounded px-2 py-1 bg-gray-100 dark:bg-gray-800"
          >
            <span
              className="w-4 h-4 rounded-sm flex-shrink-0"
              style={{
                backgroundColor:
                  FILAMENT_COLORS[filament] ?? FILAMENT_COLORS[0],
              }}
            />
            <span className="font-medium">#{filament}</span>
            <span className="ml-auto text-gray-500 dark:text-gray-400 tabular-nums">
              {t('filamentList.faceCount', { count })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
