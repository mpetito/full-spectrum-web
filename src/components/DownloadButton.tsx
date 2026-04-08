import { useTranslation } from 'react-i18next';
import { useAppState } from '../state/AppContext';

export function DownloadButton() {
  const { t } = useTranslation();
  const { outputBytes, status, inputFilename } = useAppState();

  const downloadName = inputFilename
    ? `${inputFilename}_dither3d.3mf`
    : 'dither3d-output.3mf';

  const handleDownload = () => {
    if (!outputBytes) return;
    const blob = new Blob([outputBytes.slice()], {
      type: 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = downloadName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const disabled = !outputBytes || status === 'processing';

  return (
    <button
      onClick={handleDownload}
      disabled={disabled}
      className="w-full px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {t('downloadButton.label')}
    </button>
  );
}
