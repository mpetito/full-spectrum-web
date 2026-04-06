import { useEffect, useRef } from 'react';
import { useAppState, useAppDispatch } from '../state/AppContext';
import { processAsync } from '../lib/pipeline';
import type { Dither3DConfig } from '../lib/config';

function configToJson(config: Dither3DConfig): Record<string, unknown> {
  return {
    layer_height_mm: config.layerHeightMm,
    target_format: config.targetFormat,
    color_mappings: config.colorMappings.map(cm => ({
      input_filament: cm.inputFilament,
      output_palette: cm.outputPalette.type === 'cyclic'
        ? { type: 'cyclic', pattern: [...cm.outputPalette.pattern] }
        : {
            type: 'gradient',
            stops: (cm.outputPalette as { stops: readonly { t: number; filament: number }[] }).stops.map(
              s => [s.t, s.filament],
            ),
          },
    })),
    boundary_split: config.boundarySplit,
    max_split_depth: config.maxSplitDepth,
    boundary_strategy: config.boundaryStrategy,
  };
}

export function useProcessing() {
    const { rawFileData, config, meshData, status, filamentColors } = useAppState();
    const dispatch = useAppDispatch();
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        // Don't process if no mesh loaded or currently loading
        if (!rawFileData || !meshData) return;
        if (status === 'loading') return;

        // Clear previous debounce
        if (debounceRef.current) clearTimeout(debounceRef.current);

        // Debounce 300ms then process
        debounceRef.current = setTimeout(async () => {
            // Abort any in-flight run (terminates workers, skips remaining steps)
            abortRef.current?.abort();
            const controller = new AbortController();
            abortRef.current = controller;

            dispatch({ type: 'PROCESS_START' });

            const progressCallback = (stage: string, done: number, total: number) => {
                dispatch({ type: 'SET_PROGRESS', progress: { stage, done, total } });
            };

            try {
                const [result, outputBytes, layerColorData] = await processAsync(
                    rawFileData, config, {
                      signal: controller.signal,
                      progressCallback,
                      filamentColors,
                      pipelineConfig: configToJson(config),
                    },
                );
                if (outputBytes) {
                    dispatch({ type: 'PROCESS_SUCCESS', result, outputBytes, layerColorData });
                }
            } catch (e) {
                // Silently ignore aborted runs
                if (controller.signal.aborted) return;
                dispatch({ type: 'PROCESS_ERROR', error: (e as Error).message });
            }
        }, 300);

        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            abortRef.current?.abort();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rawFileData, config]);
}
