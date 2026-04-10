import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppState, useAppDispatch } from "../state/AppContext";
import { configToJson, loadConfigFromJson } from "../lib/config";

export function ConfigExportButton() {
  const { t } = useTranslation();
  const { config } = useAppState();

  const handleExport = () => {
    const json = JSON.stringify(configToJson(config), null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "dither3d.config.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button
      onClick={handleExport}
      className="w-full px-3 py-1.5 rounded text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
    >
      {t("configImportExport.exportButton")}
    </button>
  );
}

export function ConfigImportButton() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = loadConfigFromJson(text);
      dispatch({ type: "UPDATE_CONFIG", config: parsed });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("configImportExport.parseError"),
      );
    }
    // Reset input so same file can be re-imported
    e.target.value = "";
  };

  return (
    <div className="flex flex-col">
      <button
        onClick={handleImport}
        className="px-2 py-0.5 rounded text-xs font-medium border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        {t("configImportExport.importButton")}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileChange}
        className="hidden"
      />
      {error && (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
