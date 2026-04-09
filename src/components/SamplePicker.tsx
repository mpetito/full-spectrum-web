import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppDispatch } from '../state/AppContext';
import { read3mf } from '../lib/threemf';
import { SAMPLES, fetchSample, type SampleDefinition } from '../lib/samples';
import { FILAMENT_COLORS } from '../constants';

interface SamplePickerProps {
  open: boolean;
  onClose: () => void;
}

export function SamplePicker({ open, onClose }: SamplePickerProps) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Sync dialog close event (e.g. Escape key) back to parent
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleClose = () => onCloseRef.current();
    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, []);

  const handleLoad = useCallback(
    async (sample: SampleDefinition) => {
      setLoadingId(sample.id);
      setError(null);
      dispatch({ type: 'UPLOAD_START' });

      try {
        const data = await fetchSample(sample);
        const meshData = read3mf(data.modelBuffer, true);

        dispatch({ type: 'UPLOAD_SUCCESS', meshData, rawFileData: data.modelBuffer });
        dispatch({ type: 'SET_INPUT_FILENAME', filename: data.filename });
        dispatch({ type: 'UPDATE_CONFIG', config: data.config });

        // Apply filament colors from sample config
        if (data.filamentColors && data.filamentColors.length > 0) {
          const merged: string[] = [...FILAMENT_COLORS];
          for (let i = 0; i < data.filamentColors.length; i++) {
            if (data.filamentColors[i]) {
              merged[i] = data.filamentColors[i];
            }
          }
          dispatch({ type: 'SET_FILAMENT_COLORS', colors: merged });
        }

        onClose();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        dispatch({ type: 'UPLOAD_ERROR', error: msg });
      } finally {
        setLoadingId(null);
      }
    },
    [dispatch, onClose],
  );

  return (
    <dialog
      ref={dialogRef}
      className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl p-0 backdrop:bg-black/40 max-w-sm w-full"
    >
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {t('samples.heading')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            aria-label={t('common.close', 'Close')}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <p role="alert" className="text-xs text-red-600 dark:text-red-400 mb-3">
            {t('samples.error')}
          </p>
        )}

        <div className="flex flex-col gap-2">
          {SAMPLES.map((sample) => {
            const isLoading = loadingId === sample.id;
            return (
              <button
                key={sample.id}
                type="button"
                disabled={loadingId !== null}
                onClick={() => handleLoad(sample)}
                className="flex flex-col items-start rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {isLoading ? t('samples.loading') : t(sample.labelKey)}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {t(sample.descriptionKey)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </dialog>
  );
}
