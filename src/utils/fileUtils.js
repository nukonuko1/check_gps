import JSZip from 'jszip';
import exifr from 'exifr';

const IMAGE_EXTS = /\.(jpe?g|png)$/i;
const HEIC_EXTS = /\.(heic|heif)$/i;

/** Parse a photo filename into { pointId, side } or null. */
export function parsePhotoFilename(filename) {
  // Strip directory prefix
  const base = filename.split('/').pop().split('\\').pop();
  // Match: <digits><a|b>.<ext>  (e.g. 001a.jpg, 10b.jpeg)
  const m = base.match(/^(\d+)(a|b)\.(jpe?g|png|heic|heif)$/i);
  if (!m) return null;
  return { pointId: m[1], side: m[2].toLowerCase(), ext: m[3].toLowerCase(), filename: base };
}

/**
 * Extract photo files from a JSZip instance.
 * Returns Map<`${pointId}${side}` → File>
 */
async function extractFromZip(zipFile) {
  const zip = await JSZip.loadAsync(zipFile);
  const photos = new Map();
  const heicNames = [];
  const unknownNames = [];

  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const parsed = parsePhotoFilename(path);
    if (!parsed) {
      const base = path.split('/').pop();
      if (base && !base.startsWith('.') && /\.(jpe?g|png|heic|heif)$/i.test(base)) {
        unknownNames.push(base);
      }
      continue;
    }
    if (HEIC_EXTS.test(parsed.filename)) {
      heicNames.push(parsed.filename);
      continue;
    }
    if (!IMAGE_EXTS.test(parsed.filename)) continue;

    const blob = await entry.async('blob');
    const file = new File([blob], parsed.filename, { type: 'image/jpeg' });
    photos.set(`${parsed.pointId}${parsed.side}`, { file, pointId: parsed.pointId, side: parsed.side });
  }

  return { photos, heicNames, unknownNames };
}

/**
 * Extract photo files from a FileList (folder upload via webkitdirectory).
 */
function extractFromFileList(fileList) {
  const photos = new Map();
  const heicNames = [];
  const unknownNames = [];

  for (const file of fileList) {
    const parsed = parsePhotoFilename(file.name);
    if (!parsed) {
      if (/\.(jpe?g|png|heic|heif)$/i.test(file.name)) unknownNames.push(file.name);
      continue;
    }
    if (HEIC_EXTS.test(parsed.filename)) {
      heicNames.push(parsed.filename);
      continue;
    }
    if (!IMAGE_EXTS.test(parsed.filename)) continue;
    photos.set(`${parsed.pointId}${parsed.side}`, { file, pointId: parsed.pointId, side: parsed.side });
  }

  return { photos, heicNames, unknownNames };
}

/**
 * Load photos from either a ZIP file or a FileList.
 * Returns { photos: Map, heicNames, unknownNames }
 */
export async function loadPhotos(source) {
  if (source instanceof File && /\.zip$/i.test(source.name)) {
    return extractFromZip(source);
  }
  // FileList or Array of Files
  return extractFromFileList(source);
}

/** Create an object URL for a File; caller is responsible for revoking. */
export function createObjectUrl(file) {
  return URL.createObjectURL(file);
}

/**
 * Read EXIF GPS from a photo File using exifr.
 * Returns { lat, lon } in decimal degrees, or { lat: null, lon: null }.
 */
export async function readExifGPS(file) {
  try {
    const gps = await exifr.gps(file);
    if (gps && gps.latitude != null && gps.longitude != null) {
      return { lat: gps.latitude, lon: gps.longitude };
    }
  } catch {
    // exifr throws if no EXIF data
  }
  return { lat: null, lon: null };
}

/** Collect all unique point IDs from two photo maps, sorted numerically. */
export function collectPointIds(...photoMaps) {
  const ids = new Set();
  for (const map of photoMaps) {
    for (const key of map.keys()) {
      // key is e.g. "001a" → extract "001"
      const m = key.match(/^(\d+)[ab]$/);
      if (m) ids.add(m[1]);
    }
  }
  return [...ids].sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
}
