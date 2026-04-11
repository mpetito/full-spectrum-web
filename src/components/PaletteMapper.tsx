import { useTranslation } from "react-i18next";
import type { ColorMapping, Palette, Dither3DConfig } from "../lib/config";
import { getPaletteTypes } from "../lib/palette";
import { useAppState, useAppDispatch } from "../state/AppContext";
import { CyclicEditor } from "./CyclicEditor";
import { GradientEditor } from "./GradientEditor";
import { ConfigImportButton } from "./ConfigImportExport";

function paletteTypeOf(mapping: ColorMapping | undefined): string {
  if (!mapping) return "none";
  return mapping.outputPalette.type;
}

function defaultPalette(type: string): Palette {
  if (type === "gradient") {
    return {
      type: "gradient",
      stops: [
        { t: 0, filament: 1 },
        { t: 1, filament: 2 },
      ],
    };
  }
  // Default to cyclic for 'cyclic' and any unknown type
  return { type: "cyclic", pattern: [1, 2] };
}

export function PaletteMapper() {
  const { t } = useTranslation();
  const { config, filamentColors } = useAppState();
  const dispatch = useAppDispatch();

  const mappings: ColorMapping[] = [...config.colorMappings];

  const dispatchMappings = (next: ColorMapping[]) => {
    const updated: Dither3DConfig = { ...config, colorMappings: next };
    dispatch({ type: "UPDATE_CONFIG", config: updated });
  };

  const setType = (index: number, ptype: string) => {
    if (ptype === "none") {
      dispatchMappings(mappings.filter((_, i) => i !== index));
    } else {
      const next = [...mappings];
      next[index] = { ...next[index], outputPalette: defaultPalette(ptype) };
      dispatchMappings(next);
    }
  };

  const updatePalette = (index: number, palette: Palette) => {
    const next = [...mappings];
    next[index] = { ...next[index], outputPalette: palette };
    dispatchMappings(next);
  };

  const setInputFilament = (index: number, fil: number) => {
    const next = [...mappings];
    next[index] = { ...next[index], inputFilament: fil };
    dispatchMappings(next);
  };

  const addMapping = () => {
    const used = new Set(mappings.map((m) => m.inputFilament));
    const maxFil = filamentColors.length - 1;
    let next = 1;
    while (used.has(next) && next <= maxFil) next++;
    if (next > maxFil) return;
    dispatchMappings([
      ...mappings,
      { inputFilament: next, outputPalette: defaultPalette("cyclic") },
    ]);
  };

  const removeMapping = (index: number) => {
    dispatchMappings(mappings.filter((_, i) => i !== index));
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          {t("paletteMapper.heading")}
        </h2>
        <ConfigImportButton />
      </div>

      <div className="flex flex-col gap-2">
        {mappings.map((mapping, i) => (
          <div
            key={i}
            className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 flex flex-col gap-2"
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="w-4 h-4 rounded-full inline-block border border-gray-300 dark:border-gray-600"
                  style={{
                    backgroundColor:
                      filamentColors[mapping.inputFilament] ?? "#808080",
                  }}
                />
                <label className="text-sm font-medium flex items-center gap-1">
                  {t("paletteMapper.inputLabel")}
                  <select
                    value={mapping.inputFilament}
                    onChange={(e) =>
                      setInputFilament(i, Number(e.target.value))
                    }
                    className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-1 py-0.5 text-xs ml-1"
                  >
                    {Array.from(
                      { length: filamentColors.length - 1 },
                      (_, n) => n + 1,
                    ).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                    {mapping.inputFilament >= filamentColors.length && (
                      <option value={mapping.inputFilament}>
                        {t("paletteMapper.filamentRemoved", {
                          index: mapping.inputFilament,
                        })}
                      </option>
                    )}
                  </select>
                </label>
              </div>
              <button
                onClick={() => removeMapping(i)}
                className="text-gray-400 hover:text-red-500 text-xs"
                title={t("paletteMapper.removeMappingTooltip")}
              >
                ✕
              </button>
            </div>

            {/* Palette type selector */}
            <select
              value={paletteTypeOf(mapping)}
              onChange={(e) => setType(i, e.target.value)}
              className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-sm"
            >
              {getPaletteTypes().map((pt) => (
                <option key={pt} value={pt}>
                  {t(
                    `paletteMapper.type${pt.charAt(0).toUpperCase() + pt.slice(1)}`,
                  )}
                </option>
              ))}
            </select>

            {/* Palette editor */}
            {mapping.outputPalette.type === "cyclic" && (
              <CyclicEditor
                pattern={[...mapping.outputPalette.pattern]}
                onChange={(pattern) =>
                  updatePalette(i, { type: "cyclic", pattern })
                }
              />
            )}
            {mapping.outputPalette.type === "gradient" && (
              <GradientEditor
                stops={mapping.outputPalette.stops.map((s) => ({ ...s }))}
                onChange={(stops) =>
                  updatePalette(i, { type: "gradient", stops })
                }
              />
            )}
          </div>
        ))}
      </div>

      {mappings.length < filamentColors.length - 1 && (
        <button
          onClick={addMapping}
          className="mt-2 w-full rounded border border-dashed border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-500 hover:text-indigo-600 hover:border-indigo-400"
        >
          {t("paletteMapper.addMapping")}
        </button>
      )}
    </section>
  );
}
