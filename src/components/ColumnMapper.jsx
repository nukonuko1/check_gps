import React, { useState } from 'react';

const FIELDS = [
  { key: 'pointId', label: '地点番号', required: true },
  { key: 'latMode', label: '北緯の形式', type: 'radio', options: ['parts', 'combined'], required: true },
  { key: 'latDeg', label: '北緯 度', requiredIf: m => m.latMode === 'parts' },
  { key: 'latMin', label: '北緯 分', requiredIf: m => m.latMode === 'parts' },
  { key: 'latSec', label: '北緯 秒', requiredIf: m => m.latMode === 'parts' },
  { key: 'lat', label: '北緯（組み合わせ列）', requiredIf: m => m.latMode === 'combined' },
  { key: 'lonMode', label: '東経の形式', type: 'radio', options: ['parts', 'combined'], required: true },
  { key: 'lonDeg', label: '東経 度', requiredIf: m => m.lonMode === 'parts' },
  { key: 'lonMin', label: '東経 分', requiredIf: m => m.lonMode === 'parts' },
  { key: 'lonSec', label: '東経 秒', requiredIf: m => m.lonMode === 'parts' },
  { key: 'lon', label: '東経（組み合わせ列）', requiredIf: m => m.lonMode === 'combined' },
  { key: 'measurement', label: '測定値', required: false },
];

export default function ColumnMapper({ headers, onSubmit }) {
  const [mapping, setMapping] = useState({ latMode: 'parts', lonMode: 'parts' });

  const set = (key, value) => setMapping(prev => ({ ...prev, [key]: value }));

  const handleSubmit = () => {
    // Validation
    const required = FIELDS.filter(f => {
      if (f.required) return true;
      if (f.requiredIf && f.requiredIf(mapping)) return true;
      return false;
    });
    for (const f of required) {
      if (f.type === 'radio') continue; // always set
      if (!mapping[f.key]) {
        alert(`「${f.label}」の列を選択してください`);
        return;
      }
    }
    onSubmit(mapping);
  };

  const headerOptions = ['', ...headers];

  return (
    <div className="grid grid-cols-3 gap-3">
      {FIELDS.map(f => {
        // Show/hide based on mode
        const hidden = f.requiredIf && !f.requiredIf(mapping);
        if (hidden) return null;

        if (f.type === 'radio') {
          return (
            <div key={f.key} className="col-span-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
              <div className="flex gap-4">
                {f.options.map(opt => (
                  <label key={opt} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name={f.key}
                      value={opt}
                      checked={mapping[f.key] === opt}
                      onChange={() => set(f.key, opt)}
                    />
                    <span className="text-sm">{opt === 'parts' ? '度・分・秒を別々の列で指定' : '1列にまとめた形式'}</span>
                  </label>
                ))}
              </div>
            </div>
          );
        }

        return (
          <div key={f.key}>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              {f.label}
              {(f.required || (f.requiredIf && f.requiredIf(mapping))) && <span className="text-red-500 ml-1">*</span>}
            </label>
            <select
              className="w-full border rounded px-2 py-1 text-sm"
              value={mapping[f.key] ?? ''}
              onChange={e => set(f.key, e.target.value || null)}
            >
              {headerOptions.map(h => <option key={h} value={h}>{h || '-- 選択 --'}</option>)}
            </select>
          </div>
        );
      })}

      <div className="col-span-3">
        <button
          onClick={handleSubmit}
          className="px-4 py-2 bg-blue-700 text-white rounded font-medium hover:bg-blue-800"
        >
          この設定で読み込む
        </button>
      </div>
    </div>
  );
}
