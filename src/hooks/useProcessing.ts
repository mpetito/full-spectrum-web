import { useEffect, useRef } from 'react';
import { useAppState, useAppDispatch } from '../state/AppContext';
import { processAsync } from '../lib/pipeline';

export function useProcessing() {
    const { rawFileData, config, meshData, status } = useAppState();
    const dispatch = useAppDispatch();
    const debounceRef = useRef<ReturnType<typeof setTimeout>>();

    useEffect(() => {
        // Don't process if no mesh loaded or currently loading
        if (!rawFileData || !meshData) return;
        if (status === 'loading') return;

        // Clear previous debounce
        if (debounceRef.current) clearTimeout(debounceRef.current);

        // Debounce 300ms then process
        debounceRef.current = setTimeout(async () => {
            dispatch({ type: 'PROCESS_START' });

            try {
                const [result, outputBytes, layerColorData] = await processAsync(rawFileData, config);
                if (outputBytes) {
                    dispatch({ type: 'PROCESS_SUCCESS', result, outputBytes, layerColorData });
                }
            } catch (e) {
                dispatch({ type: 'PROCESS_ERROR', error: (e as Error).message });
            }
        }, 300);

        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rawFileData, config]);
}
