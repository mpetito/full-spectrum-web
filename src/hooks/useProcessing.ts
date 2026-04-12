import { useEffect, useRef } from 'react';
import { useAppState, useAppDispatch } from '../state/AppContext';
import { processAsync } from '../lib/pipeline';
import { configToJson } from '../lib/config';

export function useProcessing() {
    const { rawFileData, config, meshData, status, filamentColors, autoApply, manualApplyCount } = useAppState();
    const dispatch = useAppDispatch();
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const runProcessing = async () => {
        if (!rawFileData || !meshData) return;
        if (status === 'loading') return;

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
    };

    // Auto-apply: debounced processing on config/file changes
    useEffect(() => {
        if (!autoApply) return;
        if (!rawFileData || !meshData) return;
        if (status === 'loading') return;

        // Clear previous debounce
        if (debounceRef.current) clearTimeout(debounceRef.current);

        debounceRef.current = setTimeout(() => {
            runProcessing();
        }, 300);

        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            abortRef.current?.abort();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rawFileData, config, autoApply]);

    // Manual apply: immediate processing when manualApplyCount changes
    useEffect(() => {
        if (manualApplyCount === 0) return;
        runProcessing();

        return () => {
            abortRef.current?.abort();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [manualApplyCount]);
}
