import { useCallback } from 'react';
import { useAppState, useAppDispatch } from '../state/AppContext';
import { FILAMENT_COLORS } from '../constants';

const MAX_FILAMENT_SLOTS = 32;

export function FilamentColorEditor() {
  const { filamentColors } = useAppState();
  const dispatch = useAppDispatch();

  const handleColorChange = useCallback(
    (index: number, color: string) => {
      const updated = [...filamentColors];
      updated[index] = color;
      dispatch({ type: 'SET_FILAMENT_COLORS', colors: updated });
    },
    [filamentColors, dispatch],
  );

  const addColor = useCallback(() => {
    if (filamentColors.length >= MAX_FILAMENT_SLOTS) return;
    dispatch({ type: 'SET_FILAMENT_COLORS', colors: [...filamentColors, '#808080'] });
  }, [filamentColors, dispatch]);

  const removeColor = useCallback(
    (index: number) => {
      if (filamentColors.length <= 2) return;
      dispatch({ type: 'SET_FILAMENT_COLORS', colors: filamentColors.filter((_, i) => i !== index) });
    },
    [filamentColors, dispatch],
  );

  const resetColor = useCallback(
    (index: number) => {
      const defaultColor = index < FILAMENT_COLORS.length ? FILAMENT_COLORS[index] : '#808080';
      const updated = [...filamentColors];
      updated[index] = defaultColor;
      dispatch({ type: 'SET_FILAMENT_COLORS', colors: updated });
    },
    [filamentColors, dispatch],
  );

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 text-sm space-y-2">
      <h3 className="font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-xs">
        Filament Colors
      </h3>
      <div className="grid grid-cols-4 gap-x-3 gap-y-2 justify-items-center">
        {filamentColors.map((color, i) => (
          <div key={i} className="group flex flex-col items-center gap-1 relative" onDoubleClick={() => resetColor(i)} title="Double-click to reset">
            <label className="cursor-pointer">
              <span
                className="w-8 h-8 rounded-full border-2 border-gray-300 dark:border-gray-600 overflow-hidden relative block"
                style={{ backgroundColor: color }}
              >
                <input
                  type="color"
                  value={color}
                  onChange={(e) => handleColorChange(i, e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  aria-label={`Filament ${i} color`}
                />
              </span>
            </label>
            {filamentColors.length > 2 && (
              <button
                onClick={() => removeColor(i)}
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200 text-[10px] leading-none flex items-center justify-center hover:bg-red-400 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                title="Remove filament"
                aria-label={`Remove filament ${i}`}
              >
                ×
              </button>
            )}
            <span className="text-xs text-gray-500">{i}</span>
          </div>
        ))}
        {filamentColors.length < MAX_FILAMENT_SLOTS && (
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={addColor}
              className="w-8 h-8 rounded-full border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center text-gray-400 hover:text-indigo-500 hover:border-indigo-400"
              title="Add filament color"
              aria-label="Add filament color"
            >
              +
            </button>
            <span className="text-xs text-transparent select-none" aria-hidden="true">0</span>
          </div>
        )}
      </div>
    </div>
  );
}
