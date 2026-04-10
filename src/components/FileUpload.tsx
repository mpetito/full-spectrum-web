import { useCallback, useRef, useState } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { useAppDispatch, useAppState } from '../state/AppContext';
import { read3mf } from '../lib/threemf';
import { loadConfigFromJson } from '../lib/config';
import { FILAMENT_COLORS } from '../constants';
import { SamplePicker } from './SamplePicker';

export function FileUpload() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { status, meshData } = useAppState();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [sampleOpen, setSampleOpen] = useState(false);

  const handleSampleOpen = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setSampleOpen(true);
  }, []);

  const handleSampleClose = useCallback(() => setSampleOpen(false), []);

  const handleFile = useCallback(
    async (file: File) => {
      dispatch({ type: 'UPLOAD_START' });
      try {
        const buf = await file.arrayBuffer();
        const data = read3mf(buf, true);
        setFileName(file.name);
        dispatch({ type: 'UPLOAD_SUCCESS', meshData: data, rawFileData: buf });
        const stem = file.name.replace(/\.3mf$/i, '');
        dispatch({ type: 'SET_INPUT_FILENAME', filename: stem });

        // Pre-fill from embedded metadata (round-trip support)
        if (data.dither3dConfig) {
          try {
            const config = loadConfigFromJson(JSON.stringify(data.dither3dConfig));
            dispatch({ type: 'UPDATE_CONFIG', config });
          } catch {
            // Ignore invalid embedded config
          }
        }
        if (data.filamentColors && data.filamentColors.length > 0) {
          const merged: string[] = [...FILAMENT_COLORS];
          for (let i = 0; i < data.filamentColors.length; i++) {
            if (data.filamentColors[i]) {
              merged[i] = data.filamentColors[i];
            }
          }
          dispatch({ type: 'SET_FILAMENT_COLORS', colors: merged });
        }
      } catch (e) {
        dispatch({
          type: 'UPLOAD_ERROR',
          error: e instanceof Error ? e.message : String(e),
        });
      }
    },
    [dispatch],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback(() => setDragOver(false), []);

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const isLoading = status === 'loading';

  const hasFile = !!fileName && !!meshData;

  return (
    <>
    <div
      role="button"
      aria-label={t('fileUpload.ariaLabel')}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onClick={() => inputRef.current?.click()}
      className={`flex items-center justify-center rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
        hasFile ? 'gap-2 p-2' : 'flex-col gap-2 p-6'
      } ${
        dragOver
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
          : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
      } ${isLoading ? 'opacity-60 pointer-events-none' : ''}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".3mf,.stl"
        aria-label={t('fileUpload.inputAriaLabel')}
        aria-describedby="file-upload-hint"
        className="hidden"
        onChange={onInputChange}
      />

      {/* Upload cloud icon — hidden once file loaded */}
      {!hasFile && (
        <svg
          className="w-10 h-10 text-gray-400 dark:text-gray-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M7 16a4 4 0 0 1-.88-7.903A5 5 0 1 1 15.9 6h.1a5 5 0 0 1 1 9.9M15 13l-3-3m0 0-3 3m3-3v12"
          />
        </svg>
      )}

      {isLoading ? (
        <p className="text-sm text-gray-500" aria-live="polite">{t('fileUpload.loading')}</p>
      ) : hasFile ? (
        <div className="flex items-center gap-2 min-w-0">
          <div className="min-w-0">
            <p className="text-sm font-medium truncate max-w-[14rem]">
              {fileName}
            </p>
            <p className="text-xs text-gray-500">
              {t('fileUpload.fileInfo', { count: meshData.faceCount })}
            </p>
          </div>
        </div>
      ) : (
        <div className="text-center">
          <p className="text-sm font-medium" id="file-upload-hint">{t('fileUpload.dropHint')}</p>
          <p className="text-xs text-gray-500">
            <Trans i18nKey="fileUpload.browseHintWithSample">
              click to browse or <button
                type="button"
                onClick={handleSampleOpen}
                className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >try a sample</button>
            </Trans>
          </p>
        </div>
      )}
    </div>
    <SamplePicker open={sampleOpen} onClose={handleSampleClose} />
    </>
  );
}
