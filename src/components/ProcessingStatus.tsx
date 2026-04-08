import { useTranslation } from 'react-i18next';
import { useAppState } from '../state/AppContext';

export function ProcessingStatus() {
  const { t } = useTranslation();
  const { status, error, progress } = useAppState();

  const showProgress = status === 'processing' && progress && progress.total > 0;

  return (
    <div className="flex-1 min-w-0 flex items-center gap-2 text-sm">
      {showProgress ? (
        <>
          <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-300"
              style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
            />
          </div>
          <span className="text-gray-500 dark:text-gray-400 whitespace-nowrap">
            {progress.stage} {Math.round((progress.done / progress.total) * 100)}%
          </span>
        </>
      ) : (
        <>
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0 ${
              status === 'error'
                ? 'bg-red-500'
                : status === 'processing' || status === 'loading'
                  ? 'bg-yellow-400 animate-pulse'
                  : status === 'ready'
                    ? 'bg-green-500'
                    : 'bg-gray-400'
            }`}
          />
          <span
            className={
              status === 'error'
                ? 'text-red-600 dark:text-red-400'
                : 'text-gray-500 dark:text-gray-400'
            }
          >
            {t('processingStatus.' + status)}
          </span>
          {error && (
            <span className="text-red-600 dark:text-red-400 truncate ml-1">
              — {error}
            </span>
          )}
        </>
      )}
    </div>
  );
}
