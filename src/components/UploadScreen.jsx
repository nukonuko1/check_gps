import React, { useRef, useState, useCallback } from 'react';
import ColumnMapper from './ColumnMapper';

function DropZone({ label, accept, multiple, onFiles, status, hint, allowFolder }) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);
  const folderRef = useRef(null);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const files = [...e.dataTransfer.files];
    if (files.length > 0) onFiles(files);
  }, [onFiles]);

  const handleChange = (e) => {
    const files = [...e.target.files];
    if (files.length > 0) onFiles(files);
    e.target.value = '';
  };

  const statusColor = status === 'ok' ? 'text-green-700 bg-green-50 border-green-300'
    : status === 'error' ? 'text-red-700 bg-red-50 border-red-300'
    : 'text-gray-500';

  return (
    <div
      className={`drop-zone p-4 cursor-pointer select-none transition ${dragOver ? 'drag-over' : 'hover:border-blue-400 hover:bg-blue-50'}`}
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input ref={inputRef} type="file" className="hidden" accept={accept} multiple={multiple} onChange={handleChange} />
      {allowFolder && (
        <input
          ref={folderRef}
          type="file"
          className="hidden"
          webkitdirectory=""
          multiple
          onChange={handleChange}
        />
      )}

      <div className="flex flex-col items-center gap-2 py-2">
        <div className="text-3xl">{status === 'ok' ? '✅' : status === 'error' ? '❌' : '📂'}</div>
        <p className="font-semibold text-gray-700">{label}</p>
        {hint && <p className="text-xs text-gray-400">{hint}</p>}
        <div className="flex gap-2 mt-1">
          <button
            className="text-xs px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
            onClick={e => { e.stopPropagation(); inputRef.current?.click(); }}
          >
            ファイルを選択
          </button>
          {allowFolder && (
            <button
              className="text-xs px-3 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
              onClick={e => { e.stopPropagation(); folderRef.current?.click(); }}
            >
              フォルダを選択
            </button>
          )}
        </div>
        <p className="text-xs text-gray-400">またはここにドラッグ＆ドロップ</p>
      </div>
    </div>
  );
}

function SummaryRow({ label, value, valueClass = '' }) {
  return (
    <div className="flex justify-between items-center py-1 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-600">{label}</span>
      <span className={`text-sm font-medium ${valueClass}`}>{value}</span>
    </div>
  );
}

export default function UploadScreen({
  onCurrentPhotos, onLastYearPhotos, onCurrentExcel, onLastYearExcel,
  onRunChecks, summary,
  currentPhotos, lastYearPhotos, currentExcelData, lastYearExcelData,
  needsColMap, pendingHeaders, onApplyColumnMap,
}) {
  const handleFiles = useCallback((which, files) => {
    if (which === 'curPhotos') {
      // Could be a ZIP or a list of image files
      if (files.length === 1 && /\.zip$/i.test(files[0].name)) {
        onCurrentPhotos(files[0]);
      } else {
        onCurrentPhotos(files);
      }
    } else if (which === 'lyPhotos') {
      if (files.length === 1 && /\.zip$/i.test(files[0].name)) {
        onLastYearPhotos(files[0]);
      } else {
        onLastYearPhotos(files);
      }
    } else if (which === 'curExcel') {
      onCurrentExcel(files[0]);
    } else if (which === 'lyExcel') {
      onLastYearExcel(files[0]);
    }
  }, [onCurrentPhotos, onLastYearPhotos, onCurrentExcel, onLastYearExcel]);

  // Analyse missing photos per point
  const analysePhotos = () => {
    const allIds = new Set();
    for (const k of currentPhotos.keys()) { const m = k.match(/^(\d+)[ab]$/); if (m) allIds.add(m[1]); }
    for (const k of lastYearPhotos.keys()) { const m = k.match(/^(\d+)[ab]$/); if (m) allIds.add(m[1]); }

    const missingCurA = [], missingCurB = [], missingLyA = [], missingLyB = [];
    for (const id of allIds) {
      if (!currentPhotos.has(`${id}a`)) missingCurA.push(id);
      if (!currentPhotos.has(`${id}b`)) missingCurB.push(id);
      if (!lastYearPhotos.has(`${id}a`)) missingLyA.push(id);
      if (!lastYearPhotos.has(`${id}b`)) missingLyB.push(id);
    }
    return { allIds, missingCurA, missingCurB, missingLyA, missingLyB };
  };

  const { allIds, missingCurA, missingCurB, missingLyA, missingLyB } = analysePhotos();

  // Points in Excel but not in photos, and vice versa
  const excelIds = new Set(currentExcelData?.parsed?.map(r => r.pointId) ?? []);
  const inExcelNotPhoto = [...excelIds].filter(id => !allIds.has(id));
  const inPhotoNotExcel = [...allIds].filter(id => excelIds.size > 0 && !excelIds.has(id));

  const canRun = (currentPhotos.size > 0 || currentExcelData) && !needsColMap.current && !needsColMap.lastYear;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow p-5">
        <h2 className="text-lg font-bold text-gray-800 mb-4">ファイル読み込み</h2>

        {/* Upload zones grid */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <DropZone
            label="今回写真フォルダ / ZIP"
            hint="001a.jpg, 001b.jpg ... のファイルが入ったフォルダかZIPをドロップ"
            accept=".zip,image/*"
            multiple
            allowFolder
            onFiles={files => handleFiles('curPhotos', files)}
            status={currentPhotos.size > 0 ? 'ok' : ''}
          />
          <DropZone
            label="昨年写真フォルダ / ZIP"
            hint="今回と同じ命名規則のフォルダかZIPをドロップ"
            accept=".zip,image/*"
            multiple
            allowFolder
            onFiles={files => handleFiles('lyPhotos', files)}
            status={lastYearPhotos.size > 0 ? 'ok' : ''}
          />
          <DropZone
            label="今回 測定記録 Excel"
            hint=".xlsx / .xls ファイル"
            accept=".xlsx,.xls"
            multiple={false}
            allowFolder={false}
            onFiles={files => handleFiles('curExcel', files)}
            status={currentExcelData ? 'ok' : needsColMap.current ? 'error' : ''}
          />
          <DropZone
            label="昨年 測定記録 Excel"
            hint=".xlsx / .xls ファイル"
            accept=".xlsx,.xls"
            multiple={false}
            allowFolder={false}
            onFiles={files => handleFiles('lyExcel', files)}
            status={lastYearExcelData ? 'ok' : needsColMap.lastYear ? 'error' : ''}
          />
        </div>

        {/* Column mapping dialogs */}
        {needsColMap.current && pendingHeaders.current && (
          <div className="mb-4 border-2 border-orange-300 rounded-lg p-4 bg-orange-50">
            <p className="font-semibold text-orange-800 mb-3">今回Excelの列マッピングを手動で設定してください</p>
            <ColumnMapper
              headers={pendingHeaders.current.headers}
              onSubmit={colMap => onApplyColumnMap('current', colMap)}
            />
          </div>
        )}
        {needsColMap.lastYear && pendingHeaders.lastYear && (
          <div className="mb-4 border-2 border-orange-300 rounded-lg p-4 bg-orange-50">
            <p className="font-semibold text-orange-800 mb-3">昨年Excelの列マッピングを手動で設定してください</p>
            <ColumnMapper
              headers={pendingHeaders.lastYear.headers}
              onSubmit={colMap => onApplyColumnMap('lastYear', colMap)}
            />
          </div>
        )}

        {/* Run button */}
        <div className="flex justify-center">
          <button
            onClick={onRunChecks}
            disabled={!canRun}
            className="px-8 py-3 bg-blue-700 text-white font-bold rounded-lg text-lg shadow hover:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            チェック開始 →
          </button>
        </div>
        {!canRun && <p className="text-center text-sm text-gray-400 mt-2">今回写真または今回Excelを読み込んでください</p>}
      </div>

      {/* Summary panel */}
      {(currentPhotos.size > 0 || lastYearPhotos.size > 0 || currentExcelData || lastYearExcelData) && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-lg shadow p-5">
            <h3 className="font-bold text-gray-700 mb-3">読み込み状況</h3>
            <SummaryRow label="今回写真" value={`${currentPhotos.size} 枚（${Math.ceil(currentPhotos.size / 2)} 地点）`} valueClass="text-blue-700" />
            <SummaryRow label="昨年写真" value={`${lastYearPhotos.size} 枚（${Math.ceil(lastYearPhotos.size / 2)} 地点）`} valueClass="text-blue-700" />
            <SummaryRow
              label="今回Excel"
              value={currentExcelData ? `読み込み済み（${currentExcelData.parsed.length} 地点）` : '未読み込み'}
              valueClass={currentExcelData ? 'text-green-700' : 'text-gray-400'}
            />
            <SummaryRow
              label="昨年Excel"
              value={lastYearExcelData ? `読み込み済み（${lastYearExcelData.parsed.length} 地点）` : '未読み込み'}
              valueClass={lastYearExcelData ? 'text-green-700' : 'text-gray-400'}
            />
            <SummaryRow label="検出された地点数" value={allIds.size} valueClass="font-bold text-gray-800" />
          </div>

          <div className="bg-white rounded-lg shadow p-5">
            <h3 className="font-bold text-gray-700 mb-3">要注意事項</h3>
            {missingCurA.length === 0 && missingCurB.length === 0 && missingLyA.length === 0 && missingLyB.length === 0
              && inExcelNotPhoto.length === 0 && inPhotoNotExcel.length === 0
              ? <p className="text-green-700 text-sm">問題は見つかりませんでした</p>
              : <>
                {missingCurA.length > 0 && <IssueRow label="今回a写真不足" ids={missingCurA} color="red" />}
                {missingCurB.length > 0 && <IssueRow label="今回b写真不足" ids={missingCurB} color="red" />}
                {missingLyA.length > 0 && <IssueRow label="昨年a写真なし" ids={missingLyA} color="yellow" />}
                {missingLyB.length > 0 && <IssueRow label="昨年b写真なし" ids={missingLyB} color="yellow" />}
                {inExcelNotPhoto.length > 0 && <IssueRow label="Excelにあり写真なし" ids={inExcelNotPhoto} color="yellow" />}
                {inPhotoNotExcel.length > 0 && <IssueRow label="写真にありExcelなし" ids={inPhotoNotExcel} color="yellow" />}
              </>
            }
          </div>
        </div>
      )}
    </div>
  );
}

function IssueRow({ label, ids, color }) {
  const colorClass = color === 'red' ? 'text-red-700' : 'text-yellow-700';
  return (
    <div className="py-1 border-b border-gray-100 last:border-0">
      <p className={`text-sm font-medium ${colorClass}`}>{label}（{ids.length}件）</p>
      <p className="text-xs text-gray-500 truncate">{ids.join('、')}</p>
    </div>
  );
}
