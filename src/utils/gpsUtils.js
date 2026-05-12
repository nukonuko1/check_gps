/**
 * GPS utilities for DMS (degrees/minutes/seconds) conversion and comparison.
 *
 * Key rules from spec:
 * - Excel GPS = photo GPS seconds rounded to 2 decimal places
 * - Year-to-year comparison uses total seconds: deg×3600 + min×60 + sec
 * - ±5 sec → OK, >5 sec → caution/NG (avoid 59→01 rollover bugs)
 */

/** Convert decimal degrees to DMS object. */
export function decimalToDMS(decimal) {
  if (decimal == null || isNaN(decimal)) return null;
  const abs = Math.abs(decimal);
  const degrees = Math.floor(abs);
  const minFloat = (abs - degrees) * 60;
  const minutes = Math.floor(minFloat);
  const seconds = (minFloat - minutes) * 60;
  return { degrees, minutes, seconds };
}

/** Round seconds to given decimal places (default 2, matching Excel format). */
export function roundDMSSeconds(dms, precision = 2) {
  if (!dms) return null;
  const factor = Math.pow(10, precision);
  return { ...dms, seconds: Math.round(dms.seconds * factor) / factor };
}

/** Convert DMS to total seconds for robust cross-minute/hour comparison. */
export function toTotalSeconds(dms) {
  if (!dms) return null;
  return dms.degrees * 3600 + dms.minutes * 60 + dms.seconds;
}

/** Format DMS as display string. */
export function formatDMS(dms, precision = 2) {
  if (!dms) return '-';
  return `${dms.degrees}°${dms.minutes}'${dms.seconds.toFixed(precision)}"`;
}

/**
 * Parse a GPS value from an Excel cell.
 * Handles:
 *   - Already a DMS object
 *   - Number (treated as seconds-per-degree decimal, e.g. 37.75 → 37°45'00")
 *   - String: "37°45'30.25"" / "37度45分30.25秒" / "37-45-30.25" / "37 45 30.25"
 */
export function parseGPSFromValue(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'object' && 'degrees' in value) return value;

  if (typeof value === 'number') {
    // Assume decimal degrees (e.g. 37.7584)
    return decimalToDMS(value);
  }

  const s = String(value).trim();

  // Pattern: DD°MM'SS.ss" or DD度MM分SS.ss秒 or DD-MM-SS.ss or DD MM SS.ss
  const m = s.match(
    /^(\d{1,3})[°度\s\-]+(\d{1,2})['分\s\-]+([\d.]+)["\s秒]?$/
  );
  if (m) {
    return {
      degrees: parseInt(m[1], 10),
      minutes: parseInt(m[2], 10),
      seconds: parseFloat(m[3]),
    };
  }

  // Fallback: decimal degrees
  const dec = parseFloat(s);
  if (!isNaN(dec)) return decimalToDMS(dec);

  return null;
}

/**
 * Build a DMS object from three separate cell values (degrees, minutes, seconds).
 * Each value can be a number or numeric string.
 */
export function buildDMSFromParts(degVal, minVal, secVal) {
  const d = parseFloat(degVal);
  const m = parseFloat(minVal);
  const s = parseFloat(secVal);
  if (isNaN(d) || isNaN(m) || isNaN(s)) return null;
  return { degrees: d, minutes: m, seconds: s };
}

/**
 * Compare two DMS values and return signed difference in seconds.
 * Uses total seconds to avoid cross-minute rollover bugs.
 * Returns null if either input is null.
 */
export function diffSeconds(dms1, dms2) {
  const t1 = toTotalSeconds(dms1);
  const t2 = toTotalSeconds(dms2);
  if (t1 == null || t2 == null) return null;
  return parseFloat((t1 - t2).toFixed(2));
}

/**
 * Determine GPS check result for year-to-year diff.
 * ≤5 sec → OK, ≤10 sec → 要確認, >10 sec → NG
 */
export function gpsDiffResult(latDiff, lonDiff) {
  if (latDiff == null || lonDiff == null) return '要確認';
  const max = Math.max(Math.abs(latDiff), Math.abs(lonDiff));
  if (max <= 5) return 'OK';
  if (max <= 10) return '要確認';
  return 'NG';
}

/**
 * Compare photo GPS (EXIF decimal degrees) with Excel GPS (DMS).
 * Photo GPS seconds are rounded to 2 d.p. before comparison.
 * Tolerance: 0.01 sec (pure rounding error).
 * Returns { result, latDiff, lonDiff, photoLatDMS, photoLonDMS }
 */
export function comparePhotoWithExcel(exifLat, exifLon, excelLat, excelLon) {
  if (exifLat == null || exifLon == null) {
    return { result: '要確認', message: '写真にGPS情報がありません' };
  }
  if (!excelLat || !excelLon) {
    return { result: '要確認', message: 'ExcelにGPS情報がありません' };
  }

  const photoLatDMS = roundDMSSeconds(decimalToDMS(exifLat));
  const photoLonDMS = roundDMSSeconds(decimalToDMS(exifLon));

  const latDiff = diffSeconds(photoLatDMS, excelLat);
  const lonDiff = diffSeconds(photoLonDMS, excelLon);

  const maxDiff = Math.max(Math.abs(latDiff ?? 0), Math.abs(lonDiff ?? 0));

  let result;
  if (maxDiff <= 0.05) result = 'OK';      // pure rounding tolerance
  else if (maxDiff <= 1) result = '要確認';
  else result = 'NG';

  return { result, latDiff, lonDiff, photoLatDMS, photoLonDMS };
}
