import XLSX from 'xlsx-js-style';
import { buildDMSFromParts, parseGPSFromValue } from './gpsUtils.js';

/**
 * Read an Excel file and return { headers, rows, sheetName }.
 * rows is an array of objects keyed by header name.
 */
export async function readExcel(file) {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellStyles: true });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  // header: 1 → raw array rows; header row is rows[0]
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (raw.length < 2) return { headers: [], rows: [], sheetName, rawWorkbook: wb, sheetName };

  const headers = raw[0].map(h => String(h ?? '').trim());
  const rows = raw.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] ?? ''; });
    return obj;
  });

  return { headers, rows, sheetName, rawWorkbook: wb };
}

/**
 * Auto-detect column mapping from header array.
 * Returns a columnMap object or null if confidence is too low.
 *
 * columnMap shape:
 * {
 *   pointId: string,           // header name for point ID
 *   latMode: 'combined'|'parts',
 *   lat: string,               // combined header
 *   latDeg: string, latMin: string, latSec: string, // parts headers
 *   lonMode: 'combined'|'parts',
 *   lon: string,
 *   lonDeg: string, lonMin: string, lonSec: string,
 *   measurement: string|null,
 * }
 */
export function detectColumns(headers) {
  const h = headers.map(x => x.toLowerCase());

  const find = (...candidates) => {
    for (const c of candidates) {
      const idx = h.findIndex(x => x.includes(c));
      if (idx >= 0) return headers[idx];
    }
    return null;
  };

  // Point ID
  const pointId = find('地点番号', '地点', 'ポイント', 'no.', '番号', 'point', 'id');

  // Latitude parts
  const latDeg = find('北緯度', '緯度度', '北緯_度', 'lat_d', 'latd', '北緯（度', '北緯(度');
  const latMin = find('北緯分', '緯度分', '北緯_分', 'lat_m', 'latm', '北緯（分', '北緯(分');
  const latSec = find('北緯秒', '緯度秒', '北緯_秒', 'lat_s', 'lats', '北緯（秒', '北緯(秒');

  // Longitude parts
  const lonDeg = find('東経度', '経度度', '東経_度', 'lon_d', 'lond', '東経（度', '東経(度');
  const lonMin = find('東経分', '経度分', '東経_分', 'lon_m', 'lonm', '東経（分', '東経(分');
  const lonSec = find('東経秒', '経度秒', '東経_秒', 'lon_s', 'lons', '東経（秒', '東経(秒');

  // Combined lat/lon
  const lat = find('北緯', '緯度', 'latitude', 'lat');
  const lon = find('東経', '経度', 'longitude', 'lon');

  // Measurement
  const measurement = find('測定値', '空間線量率', '線量率', '線量', 'μsv', 'msv', 'dose', '測定');

  const hasParts = lat => {
    return lat.deg && lat.min && lat.sec;
  };

  const latParts = { deg: latDeg, min: latMin, sec: latSec };
  const lonParts = { deg: lonDeg, min: lonMin, sec: lonSec };

  let latMode = null;
  let lonMode = null;

  if (hasParts(latParts)) latMode = 'parts';
  else if (lat) latMode = 'combined';

  if (hasParts(lonParts)) lonMode = 'parts';
  else if (lon) lonMode = 'combined';

  if (!pointId || !latMode || !lonMode) return null;

  return {
    pointId,
    latMode,
    lat: latMode === 'combined' ? lat : null,
    latDeg: latDeg ?? null,
    latMin: latMin ?? null,
    latSec: latSec ?? null,
    lonMode,
    lon: lonMode === 'combined' ? lon : null,
    lonDeg: lonDeg ?? null,
    lonMin: lonMin ?? null,
    lonSec: lonSec ?? null,
    measurement: measurement ?? null,
  };
}

/**
 * Parse Excel rows using a column map.
 * Returns array of { pointId, lat (DMS), lon (DMS), measurement, rawRow }
 */
export function parseRows(rows, colMap) {
  return rows
    .filter(row => row[colMap.pointId] !== '')
    .map(row => {
      const pointId = String(row[colMap.pointId]).trim().replace(/^0+/, '') || String(row[colMap.pointId]).trim();
      // Keep leading zeros if user used them — normalise for matching later
      const pointIdRaw = String(row[colMap.pointId]).trim();

      let lat = null;
      let lon = null;

      if (colMap.latMode === 'parts') {
        lat = buildDMSFromParts(row[colMap.latDeg], row[colMap.latMin], row[colMap.latSec]);
      } else {
        lat = parseGPSFromValue(row[colMap.lat]);
      }

      if (colMap.lonMode === 'parts') {
        lon = buildDMSFromParts(row[colMap.lonDeg], row[colMap.lonMin], row[colMap.lonSec]);
      } else {
        lon = parseGPSFromValue(row[colMap.lon]);
      }

      const measurement = colMap.measurement ? row[colMap.measurement] : null;

      return { pointId: pointIdRaw, lat, lon, measurement: measurement != null ? String(measurement) : '-', rawRow: row };
    });
}

// ── Excel export ────────────────────────────────────────────────────────────

const CELL_STYLES = {
  OK:   { fill: { fgColor: { rgb: 'DCFCE7' } }, font: { color: { rgb: '166534' } } },
  NG:   { fill: { fgColor: { rgb: 'FEE2E2' } }, font: { color: { rgb: '991B1B' }, bold: true } },
  '要確認': { fill: { fgColor: { rgb: 'FEF9C3' } }, font: { color: { rgb: '854D0E' } } },
  '-':  {},
};

function sc(value, result) {
  return { v: value, t: 's', s: CELL_STYLES[result] ?? {} };
}

/**
 * Export check results as a styled Excel file.
 * Appends check result columns to the original Excel data.
 */
export function exportCheckResultsExcel(originalRows, originalHeaders, checkResultsMap) {
  const addedHeaders = [
    '写真ファイルチェック',
    '写真GPS照合結果',
    '昨年GPS比較結果',
    '北緯差分秒',
    '東経差分秒',
    '写真確認結果',
    'メモ',
    '総合判定',
  ];

  const allHeaders = [...originalHeaders, ...addedHeaders];
  const wsData = [allHeaders.map(h => ({ v: h, t: 's', s: { font: { bold: true }, fill: { fgColor: { rgb: 'DBEAFE' } } } }))];

  for (const row of originalRows) {
    // Find matching check result by pointId
    const pointId = String(row[originalHeaders[0]] ?? '').trim();
    const cr = checkResultsMap.get(pointId);

    const origCells = originalHeaders.map(h => ({ v: row[h] ?? '', t: 's' }));

    if (!cr) {
      const addedCells = addedHeaders.map(() => ({ v: '-', t: 's' }));
      wsData.push([...origCells, ...addedCells]);
      continue;
    }

    const overall = cr.overallResult ?? '-';
    const addedCells = [
      sc(cr.photoFileCheck ?? '-', cr.photoFileCheck),
      sc(cr.gpsPhotoExcelResult ?? '-', cr.gpsPhotoExcelResult),
      sc(cr.gpsDiffResult ?? '-', cr.gpsDiffResult),
      { v: cr.latDiffSec != null ? cr.latDiffSec : '-', t: cr.latDiffSec != null ? 'n' : 's' },
      { v: cr.lonDiffSec != null ? cr.lonDiffSec : '-', t: cr.lonDiffSec != null ? 'n' : 's' },
      sc(cr.photoCheckResult ?? '-', cr.photoCheckResult),
      { v: cr.memo ?? '', t: 's' },
      sc(overall, overall),
    ];

    wsData.push([...origCells, ...addedCells]);
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Auto column widths (rough estimate)
  ws['!cols'] = allHeaders.map(h => ({ wch: Math.max(h.length * 2, 10) }));

  XLSX.utils.book_append_sheet(wb, ws, 'チェック結果');

  XLSX.writeFile(wb, 'GPS照合チェック結果.xlsx');
}

/**
 * Generate a plain text memo for NG/要確認 points.
 */
export function generateMemo(checkResultsMap, allPointIds) {
  const lines = ['【放射線移動モニタリング 確認結果】', ''];

  const issues = allPointIds
    .filter(id => {
      const cr = checkResultsMap.get(id);
      return cr && (cr.overallResult === 'NG' || cr.overallResult === '要確認');
    })
    .map(id => checkResultsMap.get(id));

  if (issues.length === 0) {
    lines.push('NG・要確認の地点はありませんでした。');
    return lines.join('\n');
  }

  lines.push('要確認・NG地点：');
  issues.forEach((cr, i) => {
    lines.push('');
    lines.push(`${i + 1}. 地点番号：${cr.pointId}`);

    const details = [];
    if (cr.photoFileCheck === 'NG' || cr.photoFileCheck === '要確認') {
      details.push(`写真ファイル：${cr.photoFileCheck}`);
    }
    if (cr.gpsPhotoExcelResult === 'NG' || cr.gpsPhotoExcelResult === '要確認') {
      details.push(`写真GPS照合：${cr.gpsPhotoExcelResult}`);
    }
    if (cr.gpsDiffResult === 'NG' || cr.gpsDiffResult === '要確認') {
      const latStr = cr.latDiffSec != null ? `北緯${cr.latDiffSec > 0 ? '+' : ''}${cr.latDiffSec}秒` : '';
      const lonStr = cr.lonDiffSec != null ? `東経${cr.lonDiffSec > 0 ? '+' : ''}${cr.lonDiffSec}秒` : '';
      details.push(`昨年GPS比較：${cr.gpsDiffResult}（${[latStr, lonStr].filter(Boolean).join('、')}）`);
    }
    if (details.length > 0) {
      details.forEach(d => lines.push(`   - ${d}`));
    }

    lines.push(`   写真確認結果：${cr.photoCheckResult ?? '-'}`);
    if (cr.memo) lines.push(`   メモ：${cr.memo}`);
  });

  lines.push('');
  lines.push('以上、確認をお願いします。');
  return lines.join('\n');
}
