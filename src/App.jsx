import React, { useState, useCallback } from 'react';
import UploadScreen from './components/UploadScreen';
import ResultsScreen from './components/ResultsScreen';
import PhotoViewerScreen from './components/PhotoViewerScreen';
import { loadPhotos, readExifGPS, collectPointIds, createObjectUrl } from './utils/fileUtils';
import { readExcel, detectColumns, parseRows } from './utils/excelUtils';
import { comparePhotoWithExcel, diffSeconds, gpsDiffResult, formatDMS, roundDMSSeconds, decimalToDMS } from './utils/gpsUtils';

export const SCREENS = { UPLOAD: 'upload', RESULTS: 'results', VIEWER: 'viewer' };

const RESULT_PRIORITY = { 'NG': 3, '要確認': 2, 'OK': 1, '-': 0 };
function worstResult(...results) {
  return results.reduce((worst, r) => {
    return (RESULT_PRIORITY[r] ?? 0) > (RESULT_PRIORITY[worst] ?? 0) ? r : worst;
  }, '-');
}

function normalisePointId(id) {
  // Store with original string, but for lookup try both with and without leading zeros
  return String(id).trim();
}

export default function App() {
  const [screen, setScreen] = useState(SCREENS.UPLOAD);

  // Raw photo maps: key = "${pointId}${side}" e.g. "001a"
  const [currentPhotos, setCurrentPhotos] = useState(new Map()); // photo entries
  const [lastYearPhotos, setLastYearPhotos] = useState(new Map());

  // Object URLs cache
  const [photoUrls, setPhotoUrls] = useState({});

  // Excel data
  const [currentExcelData, setCurrentExcelData] = useState(null);  // { rows, headers, colMap }
  const [lastYearExcelData, setLastYearExcelData] = useState(null);

  // Column mapping (may need manual input)
  const [needsColMap, setNeedsColMap] = useState({ current: false, lastYear: false });
  const [pendingHeaders, setPendingHeaders] = useState({ current: null, lastYear: null });

  // Check results: Map<pointId, CheckResult>
  const [checkResults, setCheckResults] = useState(new Map());

  // All point IDs across all sources
  const [allPointIds, setAllPointIds] = useState([]);

  // Viewer
  const [viewerPointIndex, setViewerPointIndex] = useState(0);

  // Loading
  const [loading, setLoading] = useState({ active: false, message: '' });
  const [errors, setErrors] = useState([]);
  const [warnings, setWarnings] = useState([]);

  const addError = msg => setErrors(prev => [...prev, msg]);
  const addWarning = msg => setWarnings(prev => [...prev, msg]);

  // ── Photo loading ──────────────────────────────────────────────────────────

  const handleCurrentPhotos = useCallback(async (source) => {
    setLoading({ active: true, message: '今回写真を読み込み中...' });
    try {
      const { photos, heicNames, unknownNames } = await loadPhotos(source);
      if (heicNames.length > 0) {
        addWarning(`HEICファイルは未対応です。jpg/jpegに変換してください：${heicNames.join(', ')}`);
      }
      if (unknownNames.length > 0) {
        addWarning(`地点番号が認識できないファイルがあります：${unknownNames.join(', ')}`);
      }
      // Build object URLs for immediate display
      const urls = {};
      for (const [key, entry] of photos.entries()) {
        urls[`cur_${key}`] = createObjectUrl(entry.file);
      }
      setPhotoUrls(prev => ({ ...prev, ...urls }));
      setCurrentPhotos(photos);
    } catch (e) {
      addError(`今回写真の読み込みに失敗しました：${e.message}`);
    }
    setLoading({ active: false, message: '' });
  }, []);

  const handleLastYearPhotos = useCallback(async (source) => {
    setLoading({ active: true, message: '昨年写真を読み込み中...' });
    try {
      const { photos, heicNames, unknownNames } = await loadPhotos(source);
      if (heicNames.length > 0) {
        addWarning(`HEICファイルは未対応です。jpg/jpegに変換してください：${heicNames.join(', ')}`);
      }
      if (unknownNames.length > 0) {
        addWarning(`地点番号が認識できないファイルがあります：${unknownNames.join(', ')}`);
      }
      const urls = {};
      for (const [key, entry] of photos.entries()) {
        urls[`ly_${key}`] = createObjectUrl(entry.file);
      }
      setPhotoUrls(prev => ({ ...prev, ...urls }));
      setLastYearPhotos(photos);
    } catch (e) {
      addError(`昨年写真の読み込みに失敗しました：${e.message}`);
    }
    setLoading({ active: false, message: '' });
  }, []);

  // ── Excel loading ──────────────────────────────────────────────────────────

  const handleCurrentExcel = useCallback(async (file) => {
    setLoading({ active: true, message: '今回Excelを読み込み中...' });
    try {
      const { headers, rows, sheetName, rawWorkbook } = await readExcel(file);
      const colMap = detectColumns(headers);
      if (!colMap) {
        setPendingHeaders(prev => ({ ...prev, current: { headers, rows, rawWorkbook } }));
        setNeedsColMap(prev => ({ ...prev, current: true }));
        addWarning('今回Excelの列を自動検出できませんでした。手動でマッピングしてください。');
      } else {
        const parsed = parseRows(rows, colMap);
        setCurrentExcelData({ rows, headers, colMap, parsed, rawWorkbook });
      }
    } catch (e) {
      addError(`今回Excelの読み込みに失敗しました：${e.message}`);
    }
    setLoading({ active: false, message: '' });
  }, []);

  const handleLastYearExcel = useCallback(async (file) => {
    setLoading({ active: true, message: '昨年Excelを読み込み中...' });
    try {
      const { headers, rows, sheetName, rawWorkbook } = await readExcel(file);
      const colMap = detectColumns(headers);
      if (!colMap) {
        setPendingHeaders(prev => ({ ...prev, lastYear: { headers, rows, rawWorkbook } }));
        setNeedsColMap(prev => ({ ...prev, lastYear: true }));
        addWarning('昨年Excelの列を自動検出できませんでした。手動でマッピングしてください。');
      } else {
        const parsed = parseRows(rows, colMap);
        setLastYearExcelData({ rows, headers, colMap, parsed, rawWorkbook });
      }
    } catch (e) {
      addError(`昨年Excelの読み込みに失敗しました：${e.message}`);
    }
    setLoading({ active: false, message: '' });
  }, []);

  // ── Column map submit ──────────────────────────────────────────────────────

  const applyColumnMap = useCallback((which, colMap) => {
    const pending = pendingHeaders[which];
    if (!pending) return;
    const parsed = parseRows(pending.rows, colMap);
    if (which === 'current') {
      setCurrentExcelData({ rows: pending.rows, headers: pending.headers, colMap, parsed, rawWorkbook: pending.rawWorkbook });
      setNeedsColMap(prev => ({ ...prev, current: false }));
    } else {
      setLastYearExcelData({ rows: pending.rows, headers: pending.headers, colMap, parsed, rawWorkbook: pending.rawWorkbook });
      setNeedsColMap(prev => ({ ...prev, lastYear: false }));
    }
  }, [pendingHeaders]);

  // ── Run checks ────────────────────────────────────────────────────────────

  const runChecks = useCallback(async () => {
    setLoading({ active: true, message: 'GPS照合・チェックを実行中...' });

    // Collect all point IDs from all sources
    const idSet = new Set();
    for (const key of currentPhotos.keys()) {
      const m = key.match(/^(\d+)[ab]$/);
      if (m) idSet.add(m[1]);
    }
    for (const key of lastYearPhotos.keys()) {
      const m = key.match(/^(\d+)[ab]$/);
      if (m) idSet.add(m[1]);
    }
    if (currentExcelData?.parsed) {
      currentExcelData.parsed.forEach(r => idSet.add(r.pointId));
    }
    if (lastYearExcelData?.parsed) {
      lastYearExcelData.parsed.forEach(r => idSet.add(r.pointId));
    }

    const ids = [...idSet].sort((a, b) => {
      const na = parseInt(a, 10);
      const nb = parseInt(b, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    });
    setAllPointIds(ids);

    // Build lookup maps from Excel data
    // Key: both raw ID and numeric-normalised ID to handle "001" vs "1" mismatches
    const buildExcelMap = (parsed) => {
      const map = new Map();
      (parsed ?? []).forEach(r => {
        map.set(r.pointId, r);
        const n = parseInt(r.pointId, 10);
        if (!isNaN(n)) map.set(String(n), r); // e.g. "1" → same entry as "001"
      });
      return map;
    };

    // For the ID set: normalise Excel IDs to match photo filename format
    const normaliseId = (id) => {
      // If numeric, keep leading zeros from photos; just add the raw ID
      return id;
    };

    const currentExcelMap = buildExcelMap(currentExcelData?.parsed);
    const lastYearExcelMap = buildExcelMap(lastYearExcelData?.parsed);

    // Lookup: try exact, then numeric match
    const lookupExcel = (map, id) => {
      if (map.has(id)) return map.get(id);
      const n = parseInt(id, 10);
      if (!isNaN(n) && map.has(String(n))) return map.get(String(n));
      return null;
    };

    const results = new Map();

    for (const pointId of ids) {
      const curA = currentPhotos.get(`${pointId}a`) ?? null;
      const curB = currentPhotos.get(`${pointId}b`) ?? null;
      const lyA  = lastYearPhotos.get(`${pointId}a`) ?? null;
      const lyB  = lastYearPhotos.get(`${pointId}b`) ?? null;

      // ── 1. Photo file check ──
      let photoFileCheck = 'OK';
      const missingParts = [];
      if (!curA) missingParts.push('今回a写真なし');
      if (!curB) missingParts.push('今回b写真なし');
      if (!lyA) missingParts.push('昨年a写真なし');
      if (!lyB) missingParts.push('昨年b写真なし');
      if (missingParts.length > 0) {
        photoFileCheck = (!curA || !curB) ? 'NG' : '要確認';
      }

      // ── 2. Read EXIF GPS from current a-photo ──
      let exifLat = null;
      let exifLon = null;
      let photoLatDMS = null;
      let photoLonDMS = null;

      if (curA?.file) {
        const gps = await readExifGPS(curA.file);
        exifLat = gps.lat;
        exifLon = gps.lon;
        if (exifLat != null) {
          photoLatDMS = roundDMSSeconds(decimalToDMS(exifLat));
          photoLonDMS = roundDMSSeconds(decimalToDMS(exifLon));
        }
      }

      // ── 3. Compare photo GPS with current Excel GPS ──
      const curExcel = lookupExcel(currentExcelMap, pointId);
      const lyExcel  = lookupExcel(lastYearExcelMap, pointId);

      let gpsPhotoExcelResult = '-';
      if (curA) {
        if (exifLat == null) {
          gpsPhotoExcelResult = '要確認'; // no GPS in photo
        } else if (curExcel?.lat) {
          const cmp = comparePhotoWithExcel(exifLat, exifLon, curExcel.lat, curExcel.lon);
          gpsPhotoExcelResult = cmp.result;
        } else {
          gpsPhotoExcelResult = '要確認'; // no Excel GPS to compare
        }
      }

      // ── 4. Compare current vs last-year Excel GPS ──
      let latDiffSec = null;
      let lonDiffSec = null;
      let gpsYearDiffResult = '-';

      if (curExcel?.lat && lyExcel?.lat) {
        latDiffSec = diffSeconds(curExcel.lat, lyExcel.lat);
        lonDiffSec = diffSeconds(curExcel.lon, lyExcel.lon);
        gpsYearDiffResult = gpsDiffResult(latDiffSec, lonDiffSec);
      } else if (curExcel && !lyExcel) {
        gpsYearDiffResult = '要確認';
      }

      // ── 5. Overall result ──
      const overall = worstResult(photoFileCheck, gpsPhotoExcelResult, gpsYearDiffResult);

      // Preserve previous user input if re-running
      const prev = results.get(pointId) ?? checkResults.get(pointId);

      results.set(pointId, {
        pointId,
        hasCurrentA: !!curA,
        hasCurrentB: !!curB,
        hasLastYearA: !!lyA,
        hasLastYearB: !!lyB,
        photoFileCheck,
        photoLatDMS,
        photoLonDMS,
        curExcelLat: curExcel?.lat ?? null,
        curExcelLon: curExcel?.lon ?? null,
        lyExcelLat: lyExcel?.lat ?? null,
        lyExcelLon: lyExcel?.lon ?? null,
        gpsPhotoExcelResult,
        latDiffSec,
        lonDiffSec,
        gpsDiffResult: gpsYearDiffResult,
        measurement: curExcel?.measurement ?? '-',
        photoCheckResult: prev?.photoCheckResult ?? '-',
        memo: prev?.memo ?? '',
        overallResult: overall,
      });
    }

    setCheckResults(results);
    setLoading({ active: false, message: '' });
    setScreen(SCREENS.RESULTS);
  }, [currentPhotos, lastYearPhotos, currentExcelData, lastYearExcelData, checkResults]);

  // ── User updates from results/viewer ─────────────────────────────────────

  const updateCheckResult = useCallback((pointId, updates) => {
    setCheckResults(prev => {
      const next = new Map(prev);
      const cr = { ...next.get(pointId), ...updates };
      // Recalculate overall
      cr.overallResult = worstResult(cr.photoFileCheck, cr.gpsPhotoExcelResult, cr.gpsDiffResult, cr.photoCheckResult);
      next.set(pointId, cr);
      return next;
    });
  }, []);

  const openViewer = useCallback((pointId) => {
    const idx = allPointIds.indexOf(pointId);
    setViewerPointIndex(idx >= 0 ? idx : 0);
    setScreen(SCREENS.VIEWER);
  }, [allPointIds]);

  // ── Render ────────────────────────────────────────────────────────────────

  const uploadSummary = {
    currentPhotoCount: currentPhotos.size,
    lastYearPhotoCount: lastYearPhotos.size,
    currentExcelLoaded: !!currentExcelData,
    lastYearExcelLoaded: !!lastYearExcelData,
    currentExcelPointCount: currentExcelData?.parsed?.length ?? 0,
    lastYearExcelPointCount: lastYearExcelData?.parsed?.length ?? 0,
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-blue-800 text-white px-6 py-3 flex items-center justify-between shadow">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-bold tracking-wide">GPS・写真・Excel 照合ツール</h1>
          <span className="text-blue-300 text-sm">放射線移動モニタリング</span>
        </div>
        <nav className="flex gap-2">
          {[
            { key: SCREENS.UPLOAD, label: '① ファイル読み込み' },
            { key: SCREENS.RESULTS, label: '② チェック結果一覧' },
            { key: SCREENS.VIEWER, label: '③ 写真確認' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => key !== SCREENS.VIEWER && setScreen(key)}
              disabled={key === SCREENS.RESULTS && checkResults.size === 0}
              className={`px-3 py-1 rounded text-sm font-medium transition
                ${screen === key ? 'bg-white text-blue-800' : 'text-blue-100 hover:bg-blue-700'}
                disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      {/* Loading overlay */}
      {loading.active && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-xl px-8 py-6 flex flex-col items-center gap-3">
            <div className="animate-spin w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full" />
            <p className="text-gray-700 font-medium">{loading.message}</p>
          </div>
        </div>
      )}

      {/* Errors / Warnings */}
      {(errors.length > 0 || warnings.length > 0) && (
        <div className="mx-6 mt-3 space-y-1">
          {errors.map((e, i) => (
            <div key={i} className="bg-red-50 border border-red-300 text-red-800 px-4 py-2 rounded flex items-start justify-between">
              <span>⚠ {e}</span>
              <button onClick={() => setErrors(prev => prev.filter((_, j) => j !== i))} className="ml-4 text-red-400 hover:text-red-600 font-bold">✕</button>
            </div>
          ))}
          {warnings.map((w, i) => (
            <div key={i} className="bg-yellow-50 border border-yellow-300 text-yellow-800 px-4 py-2 rounded flex items-start justify-between">
              <span>⚠ {w}</span>
              <button onClick={() => setWarnings(prev => prev.filter((_, j) => j !== i))} className="ml-4 text-yellow-400 hover:text-yellow-600 font-bold">✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Screens */}
      <main className="p-6">
        {screen === SCREENS.UPLOAD && (
          <UploadScreen
            onCurrentPhotos={handleCurrentPhotos}
            onLastYearPhotos={handleLastYearPhotos}
            onCurrentExcel={handleCurrentExcel}
            onLastYearExcel={handleLastYearExcel}
            onRunChecks={runChecks}
            summary={uploadSummary}
            currentPhotos={currentPhotos}
            lastYearPhotos={lastYearPhotos}
            currentExcelData={currentExcelData}
            lastYearExcelData={lastYearExcelData}
            needsColMap={needsColMap}
            pendingHeaders={pendingHeaders}
            onApplyColumnMap={applyColumnMap}
          />
        )}
        {screen === SCREENS.RESULTS && (
          <ResultsScreen
            checkResults={checkResults}
            allPointIds={allPointIds}
            currentExcelData={currentExcelData}
            lastYearExcelData={lastYearExcelData}
            onUpdateResult={updateCheckResult}
            onOpenViewer={openViewer}
          />
        )}
        {screen === SCREENS.VIEWER && (
          <PhotoViewerScreen
            allPointIds={allPointIds}
            pointIndex={viewerPointIndex}
            setPointIndex={setViewerPointIndex}
            checkResults={checkResults}
            photoUrls={photoUrls}
            currentPhotos={currentPhotos}
            lastYearPhotos={lastYearPhotos}
            onUpdateResult={updateCheckResult}
            onBack={() => setScreen(SCREENS.RESULTS)}
          />
        )}
      </main>
    </div>
  );
}
