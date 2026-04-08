import { useTranslation } from 'react-i18next';
import { useAppState, useAppDispatch } from '../state/AppContext';

export function PreviewToggle() {
  const { t } = useTranslation();
  const { previewMode, layerColorData } = useAppState();
  const dispatch = useAppDispatch();

  const setMode = (mode: 'input' | 'output') => {
    dispatch({ type: 'SET_PREVIEW_MODE', mode });
  };

  return (
    <div className="inline-flex rounded-md shadow-sm" role="group">
      <button
        type="button"
        onClick={() => setMode('input')}
        aria-pressed={previewMode === 'input'}
        className={`px-3 py-1 text-xs font-medium rounded-l-md border ${
          previewMode === 'input'
            ? 'bg-indigo-600 text-white border-indigo-600'
            : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
        }`}
      >
        {t('previewToggle.input')}
      </button>
      <button
        type="button"
        onClick={() => setMode('output')}
        aria-pressed={previewMode === 'output'}
        disabled={!layerColorData}
        className={`px-3 py-1 text-xs font-medium rounded-r-md border-t border-b border-r ${
          previewMode === 'output'
            ? 'bg-indigo-600 text-white border-indigo-600'
            : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
        } disabled:opacity-40 disabled:cursor-not-allowed`}
      >
        {t('previewToggle.output')}
      </button>
    </div>
  );
}
