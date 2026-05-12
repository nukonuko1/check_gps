import React, { useState, useCallback, useEffect } from 'react';
import { formatDMS } from '../utils/gpsUtils';

function PhotoCell({ label, url, gpsLabel, onClick }) {
  return (
    <div className="photo-cell">
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-800">
        <span className="text-white text-xs font-semibold">{label}</span>
        {gpsLabel && <span className="text-green-400 text-xs font-mono">{gpsLabel}</span>}
      </div>
      {url ? (
        <img
          src={url}
          alt={label}
          className="flex-1 w-full object-contain cursor-zoom-in"
          onClick={() => onClick && onClick(url, label)}
          loading="lazy"
        />
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
          写真なし
        </div>
      )}
    </div>
  );
}

function ResultButton({ label, active, color, onClick }) {
  const base = 'px-4 py-2 rounded font-bold text-sm transition border-2';
  const colorMap = {
    green: active ? 'bg-green-600 text-white border-green-600' : 'bg-white text-green-700 border-green-400 hover:bg-green-50',
    red:   active ? 'bg-red-600 text-white border-red-600'     : 'bg-white text-red-700 border-red-400 hover:bg-red-50',
    yellow:active ? 'bg-yellow-500 text-white border-yellow-500': 'bg-white text-yellow-700 border-yellow-400 hover:bg-yellow-50',
    gray:  active ? 'bg-gray-500 text-white border-gray-500'   : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-50',
  };
  return <button className={`${base} ${colorMap[color]}`} onClick={onClick}>{label}</button>;
}

export default function PhotoViewerScreen({
  allPointIds, pointIndex, setPointIndex,
  checkResults, photoUrls, currentPhotos, lastYearPhotos,
  onUpdateResult, onBack,
}) {
  const [modalImg, setModalImg] = useState(null); // { url, label }

  const pointId = allPointIds[pointIndex] ?? null;
  const cr = checkResults.get(pointId);

  const getUrl = (prefix, id, side) => {
    const key = `${prefix}_${id}${side}`;
    return photoUrls[key] ?? null;
  };

  const curAUrl = pointId ? getUrl('cur', pointId, 'a') : null;
  const curBUrl = pointId ? getUrl('cur', pointId, 'b') : null;
  const lyAUrl  = pointId ? getUrl('ly', pointId, 'a') : null;
  const lyBUrl  = pointId ? getUrl('ly', pointId, 'b') : null;

  const goNext = useCallback(() => setPointIndex(i => Math.min(i + 1, allPointIds.length - 1)), [allPointIds.length, setPointIndex]);
  const goPrev = useCallback(() => setPointIndex(i => Math.max(i - 1, 0)), [setPointIndex]);

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') goNext();
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') goPrev();
      if (e.key === 'Escape') setModalImg(null);
      if (e.key === '1') onUpdateResult(pointId, { photoCheckResult: 'OK' });
      if (e.key === '2') onUpdateResult(pointId, { photoCheckResult: 'NG' });
      if (e.key === '3') onUpdateResult(pointId, { photoCheckResult: '要確認' });
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [goNext, goPrev, pointId, onUpdateResult]);

  if (!pointId) {
    return <div className="flex items-center justify-center h-64 text-gray-400">地点データがありません</div>;
  }

  const openModal = (url, label) => setModalImg({ url, label });

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 100px)' }}>
      {/* Top bar */}
      <div className="bg-white rounded-lg shadow px-4 py-2 mb-2 flex items-center gap-4">
        {/* Navigation */}
        <button
          onClick={goPrev}
          disabled={pointIndex === 0}
          className="px-3 py-1.5 bg-gray-100 rounded font-bold text-gray-700 hover:bg-gray-200 disabled:opacity-40 text-sm"
          title="← 前の地点 (←キー)"
        >
          ← 前
        </button>

        <div className="text-center">
          <span className="text-2xl font-bold text-gray-900 font-mono">{pointId}</span>
          <span className="text-gray-400 text-sm ml-3">{pointIndex + 1} / {allPointIds.length}</span>
        </div>

        <button
          onClick={goNext}
          disabled={pointIndex === allPointIds.length - 1}
          className="px-3 py-1.5 bg-gray-100 rounded font-bold text-gray-700 hover:bg-gray-200 disabled:opacity-40 text-sm"
          title="次の地点 → (→キー)"
        >
          次 →
        </button>

        <div className="w-px h-6 bg-gray-200 mx-1" />

        {/* GPS info summary */}
        <div className="text-xs text-gray-500 flex gap-4">
          <span>写真GPS: <span className="font-mono text-gray-700">{formatDMS(cr?.photoLatDMS)} / {formatDMS(cr?.photoLonDMS)}</span></span>
          <span className={cr?.gpsDiffResult === 'NG' ? 'text-red-700 font-bold' : cr?.gpsDiffResult === '要確認' ? 'text-yellow-700' : ''}>
            昨年比: 北緯{cr?.latDiffSec != null ? `${cr.latDiffSec > 0 ? '+' : ''}${cr.latDiffSec}秒` : '-'} 東経{cr?.lonDiffSec != null ? `${cr.lonDiffSec > 0 ? '+' : ''}${cr.lonDiffSec}秒` : '-'}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Photo check result buttons */}
          <span className="text-xs text-gray-500 mr-1">写真確認：</span>
          <ResultButton label="OK (1)" active={cr?.photoCheckResult === 'OK'} color="green" onClick={() => onUpdateResult(pointId, { photoCheckResult: 'OK' })} />
          <ResultButton label="NG (2)" active={cr?.photoCheckResult === 'NG'} color="red" onClick={() => onUpdateResult(pointId, { photoCheckResult: 'NG' })} />
          <ResultButton label="要確認 (3)" active={cr?.photoCheckResult === '要確認'} color="yellow" onClick={() => onUpdateResult(pointId, { photoCheckResult: '要確認' })} />
          <ResultButton label="-" active={!cr?.photoCheckResult || cr?.photoCheckResult === '-'} color="gray" onClick={() => onUpdateResult(pointId, { photoCheckResult: '-' })} />

          <div className="w-px h-6 bg-gray-200 mx-1" />

          <input
            type="text"
            placeholder="メモ..."
            value={cr?.memo ?? ''}
            onChange={e => onUpdateResult(pointId, { memo: e.target.value })}
            className="border rounded px-2 py-1 text-sm w-56"
          />

          <button
            onClick={onBack}
            className="ml-2 px-3 py-1.5 bg-gray-700 text-white text-sm rounded hover:bg-gray-800"
          >
            一覧に戻る
          </button>
        </div>
      </div>

      {/* Photo grid 2×2 */}
      <div className="photo-grid flex-1">
        <PhotoCell
          label={`今回 ${pointId}a（看板）`}
          url={curAUrl}
          gpsLabel={cr?.photoLatDMS ? `${formatDMS(cr.photoLatDMS, 2)} N` : null}
          onClick={openModal}
        />
        <PhotoCell
          label={`昨年 ${pointId}a（看板）`}
          url={lyAUrl}
          onClick={openModal}
        />
        <PhotoCell
          label={`今回 ${pointId}b（全景）`}
          url={curBUrl}
          onClick={openModal}
        />
        <PhotoCell
          label={`昨年 ${pointId}b（全景）`}
          url={lyBUrl}
          onClick={openModal}
        />
      </div>

      {/* Keyboard hint */}
      <p className="text-center text-xs text-gray-400 mt-1">
        ← → キーで地点移動　| 1: OK　2: NG　3: 要確認　| 写真クリックで拡大
      </p>

      {/* Modal lightbox */}
      {modalImg && (
        <div className="modal-overlay" onClick={() => setModalImg(null)}>
          <div className="flex flex-col items-center gap-2" onClick={e => e.stopPropagation()}>
            <p className="text-white text-sm font-semibold">{modalImg.label}</p>
            <img
              src={modalImg.url}
              alt={modalImg.label}
              onClick={() => setModalImg(null)}
            />
            <button
              onClick={() => setModalImg(null)}
              className="mt-2 px-4 py-1.5 bg-white bg-opacity-20 text-white rounded hover:bg-opacity-30 text-sm"
            >
              閉じる (Esc)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
