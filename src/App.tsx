import { useTranslation } from 'react-i18next';
import { AppProvider } from './state/AppContext';
import { FileUpload } from './components/FileUpload';
import { MeshViewer } from './components/MeshViewer';
import { FilamentList } from './components/FilamentList';
import { ProcessingStatus } from './components/ProcessingStatus';
import { GlobalSettings } from './components/GlobalSettings';
import { PaletteMapper } from './components/PaletteMapper';
import { ConfigExportButton } from './components/ConfigImportExport';
import { FilamentColorEditor } from './components/FilamentColorEditor';
import { DownloadButton } from './components/DownloadButton';
import { OutputStats } from './components/OutputStats';
import { useProcessing } from './hooks/useProcessing';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PreviewToggle } from './components/PreviewToggle';
import { LanguageSelector } from './components/LanguageSelector';

function AppContent() {
  useProcessing();
  const { t } = useTranslation();

  return (
    <div
      className="grid h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100"
      style={{ gridTemplateColumns: '320px 1fr', gridTemplateRows: '1fr auto' }}
    >
      {/* Left sidebar — spans both rows */}
      <aside className="row-span-2 border-r border-gray-200 dark:border-gray-700 overflow-y-auto p-4 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">{t('app.title')}</h1>
          <LanguageSelector />
        </div>
        <FileUpload />
        <FilamentList />
        <GlobalSettings />
        <PaletteMapper />
        <FilamentColorEditor />
      </aside>

      {/* Main viewport area with overlays */}
      <main className="relative overflow-hidden">
        <ErrorBoundary>
          <MeshViewer />
        </ErrorBoundary>

        {/* Preview mode toggle — top-left */}
        <div className="absolute top-4 left-4 z-10">
          <PreviewToggle />
        </div>

        {/* Output panel overlay — top-right */}
        <div className="absolute top-4 right-4 z-10 w-64">
          <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-lg shadow-lg p-3 space-y-2">
            <OutputStats />
            <DownloadButton />
            <ConfigExportButton />
          </div>
        </div>
      </main>

      {/* Status bar — bottom-right */}
      <footer className="border-t border-gray-200 dark:border-gray-700 px-4 py-2 flex items-center justify-between">
        <ProcessingStatus />
        <p className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1 flex-shrink-0">
          {t('app.licenseText')}{' '}
          <a href="https://github.com/mpetito/dither3d/blob/main/LICENSE" className="underline hover:text-gray-600 dark:hover:text-gray-400" target="_blank" rel="noopener noreferrer">{t('app.licenseType')}</a>.
          <a href="https://github.com/mpetito/dither3d" className="ml-1 hover:text-gray-600 dark:hover:text-gray-400" target="_blank" rel="noopener noreferrer" aria-label={t('app.githubAriaLabel')}>
            <svg className="w-4 h-4 inline-block" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
          </a>
        </p>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
