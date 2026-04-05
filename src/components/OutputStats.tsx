import { useAppState } from '../state/AppContext';

export function OutputStats() {
  const { result, filamentColors } = useAppState();

  if (!result) return null;

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 text-sm space-y-1">
      <h3 className="font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-xs">
        Output
      </h3>
      <div className="flex justify-between">
        <span className="text-gray-500">Faces</span>
        <span>{result.faceCount.toLocaleString()}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-500">Layers</span>
        <span>{result.layerCount}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-500">Boundary faces</span>
        <span>
          {result.boundaryFaceCount.toLocaleString()} (
          {result.boundaryFacePct.toFixed(1)}%)
        </span>
      </div>
      {/* Filament distribution */}
      <div className="pt-1 border-t border-gray-100 dark:border-gray-700">
        <span className="text-gray-500 text-xs">Distribution</span>
        {Array.from(result.filamentDistribution.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([fil, count]) => (
            <div key={fil} className="flex justify-between">
              <span className="flex items-center gap-1">
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ backgroundColor: filamentColors[fil] ?? '#999' }}
                />
                Filament {fil}
              </span>
              <span>{count.toLocaleString()}</span>
            </div>
          ))}
      </div>
      {/* Warnings */}
      {result.warnings.length > 0 && (
        <div className="pt-1 border-t border-yellow-200 dark:border-yellow-800">
          {result.warnings.map((w, i) => (
            <p key={i} className="text-yellow-600 dark:text-yellow-400 text-xs">
              {w}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
