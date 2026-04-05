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

function AppContent() {
  useProcessing();

  return (
    <div
      className="grid h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100"
      style={{ gridTemplateColumns: '320px 1fr', gridTemplateRows: '1fr auto' }}
    >
      {/* Left sidebar — spans both rows */}
      <aside className="row-span-2 border-r border-gray-200 dark:border-gray-700 overflow-y-auto p-4 flex flex-col gap-4">
        <h1 className="text-xl font-bold">Full Spectrum</h1>
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
      <footer className="border-t border-gray-200 dark:border-gray-700 px-4 py-2">
        <ProcessingStatus />
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
