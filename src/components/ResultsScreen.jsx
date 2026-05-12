import React, { useState, useMemo } from 'react';
import { formatDMS } from '../utils/gpsUtils';
import { exportCheckResultsExcel, generateMemo } from '../utils/excelUtils';

function Badge({ result }) {
  if (!result || result === '-') return <span className="badge-none">-</span>;
  if (result === 'OK') return <span className="badge-ok">OK</span>;
  if (result === 'NG') return <span className="badge-ng">NG</span>;
  return <span className="badge-caution">要確認</span>;
}

function BoolCell({ value }) {
  return value
    ? <span className="text-green-600 font-bold">✓</span>
    : <span className="text-red-600 font-bold">✗</span>;
}

const RESULT_ORDER = { 'NG': 0, '要確認': 1, 'OK': 2, '-': 3 };

export default function ResultsScreen({
  checkResults, allPointIds, currentExcelData, lastYearExcelData,
  onUpdateResult, onOpenViewer,
}) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('pointId');
  const [sortAsc, setSortAsc] = useState(true);

  const filtered = useMemo(() => {
    let ids = allPointIds;
    if (search.trim()) {
      ids = ids.filter(id => id.includes(search.trim()));
    }
    if (filter !== 'all') {
      ids = ids.filter(id => {
        const cr = checkResults.get(id);
        return cr?.overallResult === filter;
      });
    }
    // Sort
    ids = [...ids].sort((a, b) => {
      const ca = checkResults.get(a);
      const cb = checkResults.get(b);
      let va, vb;
      if (sortKey === 'pointId') {
        va = parseInt(a, 10); vb = parseInt(b, 10);
        if (!isNaN(va) && !isNaN(vb)) return sortAsc ? va - vb : vb - va;
        return sortAsc ? a.localeCompare(b) : b.localeCompare(a);
      }
      if (sortKey === 'overallResult') {
        va = RESULT_ORDER[ca?.overallResult ?? '-'] ?? 3;
        vb = RESULT_ORDER[cb?.overallResult ?? '-'] ?? 3;
        return sortAsc ? va - vb : vb - va;
      }
      return 0;
    });
    return ids;
  }, [allPointIds, checkResults, filter, search, sortKey, sortAsc]);

  const handleSort = (key) => {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(true); }
  };

  const ngCount = allPointIds.filter(id => checkResults.get(id)?.overallResult === 'NG').length;
  const cautionCount = allPointIds.filter(id => checkResults.get(id)?.overallResult === '要確認').length;
  const okCount = allPointIds.filter(id => checkResults.get(id)?.overallResult === 'OK').length;

  const handleExportExcel = () => {
    if (!currentExcelData) { alert('今回Excelが読み込まれていません'); return; }
    exportCheckResultsExcel(currentExcelData.rows, currentExcelData.headers, checkResults);
  };

  const handleExportMemo = () => {
    const text = generateMemo(checkResults, allPointIds);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'GPS照合確認メモ.txt';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const SortTh = ({ label, colKey, className = '' }) => (
    <th
      className={`px-3 py-2 text-left text-xs font-semibold bg-gray-100 border-b border-gray-200 cursor-pointer hover:bg-gray-200 select-none ${className}`}
      onClick={() => handleSort(colKey)}
    >
      {label} {sortKey === colKey ? (sortAsc ? '▲' : '▼') : ''}
    </th>
  );

  const Th = ({ label, className = '' }) => (
    <th className={`px-3 py-2 text-left text-xs font-semibold bg-gray-100 border-b border-gray-200 whitespace-nowrap ${className}`}>{label}</th>
  );

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="bg-white rounded-lg shadow px-5 py-3 flex items-center gap-4 flex-wrap">
        {/* Summary badges */}
        <div className="flex gap-2">
          <span className="badge-ng">{ngCount} NG</span>
          <span className="badge-caution">{cautionCount} 要確認</span>
          <span className="badge-ok">{okCount} OK</span>
          <span className="badge-none">{allPointIds.length} 件</span>
        </div>

        <div className="w-px h-6 bg-gray-200" />

        {/* Filters */}
        <div className="flex gap-1">
          {[['all', '全て'], ['NG', 'NG'], ['要確認', '要確認'], ['OK', 'OK']].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setFilter(val)}
              className={`px-3 py-1 rounded text-sm font-medium transition
                ${filter === val
                  ? val === 'NG' ? 'bg-red-100 text-red-800 border border-red-300'
                  : val === '要確認' ? 'bg-yellow-100 text-yellow-800 border border-yellow-300'
                  : val === 'OK' ? 'bg-green-100 text-green-800 border border-green-300'
                  : 'bg-blue-100 text-blue-800 border border-blue-300'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="地点番号で検索..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border rounded px-3 py-1 text-sm w-40"
        />

        <div className="ml-auto flex gap-2">
          <button
            onClick={handleExportExcel}
            className="px-4 py-1.5 bg-green-700 text-white text-sm rounded font-medium hover:bg-green-800 shadow"
          >
            Excel出力
          </button>
          <button
            onClick={handleExportMemo}
            className="px-4 py-1.5 bg-gray-700 text-white text-sm rounded font-medium hover:bg-gray-800 shadow"
          >
            メモ出力
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow table-scroll" style={{ maxHeight: 'calc(100vh - 200px)' }}>
        <table className="text-sm border-collapse min-w-max w-full">
          <thead className="sticky top-0 z-10">
            <tr>
              <SortTh label="地点番号" colKey="pointId" className="min-w-20 sticky left-0 z-20 bg-gray-100" />
              <Th label="今回a" />
              <Th label="今回b" />
              <Th label="昨年a" />
              <Th label="昨年b" />
              <Th label="写真ファイル" />
              <Th label="写真GPS 北緯" />
              <Th label="写真GPS 東経" />
              <Th label="今回Excel 北緯" />
              <Th label="今回Excel 東経" />
              <Th label="昨年Excel 北緯" />
              <Th label="昨年Excel 東経" />
              <Th label="写真↔Excel GPS" />
              <Th label="北緯差分(秒)" />
              <Th label="東経差分(秒)" />
              <SortTh label="GPS判定" colKey="overallResult" />
              <Th label="測定値" />
              <Th label="写真確認" />
              <Th label="メモ" className="min-w-40" />
              <SortTh label="総合判定" colKey="overallResult" />
              <Th label="写真を開く" />
            </tr>
          </thead>
          <tbody>
            {filtered.map(pointId => {
              const cr = checkResults.get(pointId);
              if (!cr) return null;

              const rowClass = cr.overallResult === 'NG' ? 'result-ng'
                : cr.overallResult === '要確認' ? 'result-caution'
                : cr.overallResult === 'OK' ? '' : '';

              return (
                <tr key={pointId} className={`border-b border-gray-100 hover:brightness-95 ${rowClass}`}>
                  <td className="px-3 py-2 font-mono font-bold sticky left-0 bg-white z-10 border-r border-gray-200">{pointId}</td>
                  <td className="px-3 py-2 text-center"><BoolCell value={cr.hasCurrentA} /></td>
                  <td className="px-3 py-2 text-center"><BoolCell value={cr.hasCurrentB} /></td>
                  <td className="px-3 py-2 text-center"><BoolCell value={cr.hasLastYearA} /></td>
                  <td className="px-3 py-2 text-center"><BoolCell value={cr.hasLastYearB} /></td>
                  <td className="px-3 py-2 text-center"><Badge result={cr.photoFileCheck} /></td>
                  <td className="px-3 py-2 font-mono text-xs">{formatDMS(cr.photoLatDMS)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{formatDMS(cr.photoLonDMS)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{formatDMS(cr.curExcelLat)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{formatDMS(cr.curExcelLon)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{formatDMS(cr.lyExcelLat)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{formatDMS(cr.lyExcelLon)}</td>
                  <td className="px-3 py-2 text-center"><Badge result={cr.gpsPhotoExcelResult} /></td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    {cr.latDiffSec != null
                      ? <span className={Math.abs(cr.latDiffSec) > 5 ? 'text-red-700 font-bold' : ''}>{cr.latDiffSec > 0 ? '+' : ''}{cr.latDiffSec}</span>
                      : '-'}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    {cr.lonDiffSec != null
                      ? <span className={Math.abs(cr.lonDiffSec) > 5 ? 'text-red-700 font-bold' : ''}>{cr.lonDiffSec > 0 ? '+' : ''}{cr.lonDiffSec}</span>
                      : '-'}
                  </td>
                  <td className="px-3 py-2 text-center"><Badge result={cr.gpsDiffResult} /></td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{cr.measurement ?? '-'}</td>
                  <td className="px-3 py-2">
                    <ResultSelector
                      value={cr.photoCheckResult}
                      onChange={v => onUpdateResult(pointId, { photoCheckResult: v })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={cr.memo ?? ''}
                      onChange={e => onUpdateResult(pointId, { memo: e.target.value })}
                      className="border rounded px-2 py-0.5 text-xs w-full"
                      placeholder="メモ..."
                    />
                  </td>
                  <td className="px-3 py-2 text-center"><Badge result={cr.overallResult} /></td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => onOpenViewer(pointId)}
                      className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                    >
                      写真
                    </button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={21} className="text-center py-8 text-gray-400">該当する地点がありません</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ResultSelector({ value, onChange }) {
  const options = ['-', 'OK', 'NG', '要確認'];
  return (
    <select
      value={value ?? '-'}
      onChange={e => onChange(e.target.value)}
      className={`border rounded px-1 py-0.5 text-xs font-medium
        ${value === 'OK' ? 'bg-green-50 text-green-800'
        : value === 'NG' ? 'bg-red-50 text-red-800'
        : value === '要確認' ? 'bg-yellow-50 text-yellow-800'
        : 'text-gray-500'}`}
    >
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}
