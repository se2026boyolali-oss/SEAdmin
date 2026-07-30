import React, { useState, useEffect, useMemo } from 'react';
import { 
  RefreshCw, Search, User, ShieldAlert, Users, 
  Building2, ChevronRight, ArrowLeft, MapPin, Briefcase,
  X, Upload, CheckCircle2, AlertTriangle, ArrowUpDown, ArrowUp, ArrowDown,
  AlertOctagon, Layers, FileText, Clock, HardDrive, Database
} from 'lucide-react';
import { 
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, 
  Tooltip as ChartTooltip, ResponsiveContainer, Label, 
  ReferenceLine, Cell, PieChart, Pie 
} from 'recharts';
import * as XLSX from 'xlsx';
import { supabase } from '../supabaseClient';

// ==========================================
// INDEXEDDB HELPER ENGINE (NATIVE NO-LIB)
// ==========================================
const DB_NAME = 'BPS_Dashboard_Cache';
const DB_VERSION = 1;
const STORE_NAME = 'app_data_cache';

const initDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
};

const getCache = async (key) => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('IndexedDB Read Error:', err);
    return null;
  }
};

const setCache = async (key, val) => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(val, key);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('IndexedDB Write Error:', err);
  }
};

// ==========================================
// DATA CONFIG & ENGINE UTILS
// ==========================================
const KELUARGA_COLORS = {
  '0. Tidak Ditemukan': '#f43f5e', 
  '1. Ditemukan': '#10b981', 
  '2. Baru': '#3b82f6',
  '3. Meninggal': '#64748b', 
  '4. Tidak Eligible': '#94a3b8', 
  '5. Tidak Dapat Ditemui': '#f59e0b'
};

const USAHA_COLORS = {
  '0. Tidak Ditemukan': '#e11d48', 
  '1. Ditemukan': '#059669', 
  '2. Baru': '#6366f1',
  '3. Tutup': '#d97706', 
  '4. Ganda': '#ea580c'
};

const DB_FIELDS_KELUARGA = [
  { key: 'nmsls', label: 'Nama SLS / Sub Satuan Lingkungan Setempat' },
  { key: 'jml_prelist', label: 'Prelist Awal / Jml Prelist' },
  { key: 'status_tidak_ditemukan_stop', label: '0. Tidak Ditemukan' },
  { key: 'status_ditemukan_keluarga', label: '1. Ditemukan' },
  { key: 'status_baru_keluarga', label: '2. Keluarga Baru' },
  { key: 'status_meninggal', label: '3. Meninggal' },
  { key: 'status_tidak_eligible', label: '4. Tidak Eligible (NE)' },
  { key: 'status_tidak_dapat_ditemui', label: '5. Tidak Dapat Ditemui' },
  { key: 'jml_keluarga', label: 'Total Hasil Pendataan / Jml Keluarga' },
];

const DB_FIELDS_USAHA = [
  { key: 'nmsls', label: 'Sub Satuan Lingkungan Setempat (Sub-SLS)' },
  { key: 'jml_prelist', label: 'Jumlah Prelist Usaha' },
  { key: 'bgn_ditemukan', label: '1. Ditemukan' },
  { key: 'bgn_tutup', label: '3. Tutup' },
  { key: 'bgn_ganda', label: '4. Ganda' },
  { key: 'bgn_tidak_ditemukan', label: '0. Tidak Ditemukan' },
  { key: 'bgn_baru', label: '2. Baru' },
  { key: 'jml_bangunan', label: 'Jumlah Usaha BKU / Jml Bangunan' },
];

const processComparisonData = (progresData, muatanData, progressBoyolaliData, listPetugas, filterKec = "ALL", filterPml = "ALL") => {
  const petugasLookup = {};
  listPetugas.forEach(p => {
    if (p.email) {
      petugasLookup[p.email.toLowerCase().trim()] = {
        nama: p.nama_petugas,
        atasanEmail: p.id_pml_atasan ? p.id_pml_atasan.toLowerCase().trim() : null
      };
    }
  });

  const progresMap = {};
  progresData.forEach(p => {
    if (p.level_6_full_code) progresMap[p.level_6_full_code.trim()] = p;
  });

  const boyolaliMap = {};
  progressBoyolaliData.forEach(b => {
    if (b.idsubsls) boyolaliMap[b.idsubsls.trim()] = b;
  });

  const comparisonList = [];

  muatanData.forEach(m => {
    const idSls = m.idsubsls ? m.idsubsls.trim() : null;
    if (!idSls) return;

    if (filterKec !== "ALL" && m.nmkec !== filterKec) return;

    const emailPcl = m.petugas_id ? m.petugas_id.toLowerCase().trim() : "no-pcl";
    const namaPcl = petugasLookup[emailPcl]?.nama || "Belum Ada PCL";
    const emailPml = petugasLookup[emailPcl]?.atasanEmail;
    const namaPml = petugasLookup[emailPml]?.nama || (emailPml ? emailPml : "Tanpa Atasan");

    if (filterPml !== "ALL" && namaPml !== filterPml) return;

    const boyolaliRow = boyolaliMap[idSls];
    
    const rawOpen = Number(boyolaliRow?.open) || 0;
    const rawDraft = Number(boyolaliRow?.draft) || 0;
    const totalOpen = boyolaliRow ? (rawOpen + rawDraft) : Infinity;

    if (totalOpen <= 10) {
      const progresRow = progresMap[idSls] || {};

      const kkAwal = Number(m.jumlah_kk) || 0;
      const kkHasil = Number(progresRow.jml_keluarga) || 0;
      const kkSelisih = kkHasil - kkAwal;
      const kkRasio = kkAwal > 0 ? parseFloat(((kkHasil / kkAwal) * 100).toFixed(1)) : 0;

      const usahaAwal = Number(m.jumlah_usaha) || 0;
      const usahaHasil = Number(progresRow.jml_bangunan) || 0;
      const usahaSelisih = usahaHasil - usahaAwal;
      const usahaRasio = usahaAwal > 0 ? parseFloat(((usahaHasil / usahaAwal) * 100).toFixed(1)) : 0;

      const isAnomaliKk = Math.abs(kkSelisih) >= 10;
      const isAnomaliUsaha = Math.abs(usahaSelisih) >= 10;

      if (isAnomaliKk || isAnomaliUsaha) {
        comparisonList.push({
          idsubsls: idSls,
          nmsls: progresRow.nmsls || m.nmsls || 'Nama SLS Tidak Ditemukan',
          nmkec: m.nmkec || '-',
          nmdesa: m.nmdesa || '-',
          namaPcl,
          namaPml,
          open: rawOpen,
          draft: rawDraft,
          totalOpen,
          kkAwal,
          kkHasil,
          kkSelisih,
          kkRasio,
          usahaAwal,
          usahaHasil,
          usahaSelisih,
          usahaRasio
        });
      }
    }
  });

  return comparisonList;
};

const processRawData = (progresData, muatanData, listPetugas) => {
  const petugasLookup = {};
  listPetugas.forEach(p => {
    if (p.email) {
      petugasLookup[p.email.toLowerCase().trim()] = {
        nama: p.nama_petugas,
        atasanEmail: p.id_pml_atasan ? p.id_pml_atasan.toLowerCase().trim() : null
      };
    }
  });

  const muatanLookup = {};
  muatanData.forEach(m => { if (m.idsubsls) muatanLookup[m.idsubsls.trim()] = m; });

  const pclAgregat = {};

  progresData.forEach(row => {
    const kodeSls = row.level_6_full_code ? row.level_6_full_code.trim() : "";
    const muatan = muatanLookup[kodeSls] || {};
    const emailPcl = muatan.petugas_id ? muatan.petugas_id.toLowerCase().trim() : "no-pcl";
    const namaPcl = petugasLookup[emailPcl]?.nama || "Belum Ada PCL";
    const emailPml = petugasLookup[emailPcl]?.atasanEmail;
    const namaPml = petugasLookup[emailPml]?.nama || (emailPml ? emailPml : "Tanpa Atasan");

    if (!pclAgregat[emailPcl]) {
      pclAgregat[emailPcl] = {
        email: emailPcl, namaPcl, namaPml, kdkec: muatan.kdkec, nmkec: muatan.nmkec || "TIDAK TERPLOT",
        totalTidakDitemukan: 0, totalBgnTutup: 0, totalUsahaBermasalah: 0, totalSlsDikerjakan: 0, semuaSls: []
      };
    }

    const tTidakDitemukan = row.status_tidak_ditemukan_stop || 0;
    const tBgnTutup = row.bgn_tutup || 0;
    const tBgnTidakDitemukan = row.bgn_tidak_ditemukan || 0;

    pclAgregat[emailPcl].totalTidakDitemukan += tTidakDitemukan;
    pclAgregat[emailPcl].totalBgnTutup += tBgnTutup;
    pclAgregat[emailPcl].totalUsahaBermasalah += (tBgnTidakDitemukan + tBgnTutup);
    pclAgregat[emailPcl].totalSlsDikerjakan++;

    pclAgregat[emailPcl].semuaSls.push({
      kode: kodeSls, 
      nama: row.nmsls, 
      desa: muatan.nmdesa || "TIDAK TERPLOT",
      
      keluarga_wilkerstat: muatan.jumlah_kk || 0,
      keluarga_prelist: row.jml_prelist || 0,
      usaha_wilkerstat: muatan.jumlah_usaha || 0,
      usaha_prelist: row.usaha_prelist || 0,

      status_tidak_ditemukan_stop: tTidakDitemukan, 
      status_ditemukan_keluarga: row.status_ditemukan_keluarga || 0,
      status_baru_keluarga: row.status_baru_keluarga || 0, 
      status_meninggal: row.status_meninggal || 0,
      status_tidak_eligible: row.status_tidak_eligible || 0, 
      status_tidak_dapat_ditemui: row.status_tidak_dapat_ditemui || 0,
      jml_keluarga: row.jml_keluarga || 0,

      bgn_tidak_ditemukan: row.bgn_tidak_ditemukan || 0, 
      bgn_ditemukan: row.bgn_ditemukan || 0,
      bgn_baru: row.bgn_baru || 0, 
      bgn_tutup: tBgnTutup, 
      bgn_ganda: row.bgn_ganda || 0,
      jml_bangunan: row.jml_bangunan || 0
    });
  });

  return Object.values(pclAgregat);
};

const formatDateID = (dateString) => {
  if (!dateString) return null;
  return new Date(dateString).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }) + ' WIB';
};

// ==========================================
// PRESENTATIONAL COMPONENTS
// ==========================================
const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white border border-slate-100 p-4 rounded-2xl shadow-xl text-xs max-w-xs text-slate-700">
        <div className="font-bold text-slate-900 text-sm mb-0.5">{data.namaPcl}</div>
        <div className="text-slate-400 font-medium mb-3">Kec: {data.nmkec} | Pengawas: {data.namaPml}</div>
        <div className="space-y-1.5 font-mono text-[11px] border-t border-slate-50 pt-2.5">
          <div className="flex justify-between gap-4 text-rose-600">
            <span>❌ Keluarga Tidak Ditemukan:</span>
            <span className="font-bold">{data.totalTidakDitemukan}</span>
          </div>
          <div className="flex justify-between gap-4 text-amber-600">
            <span>🏠 Usaha Tdk Ditemukan + Tutup:</span>
            <span className="font-bold">{data.totalUsahaBermasalah}</span>
          </div>
          <div className="flex justify-between gap-4 text-slate-500">
            <span>📦 Total SLS Jalan:</span>
            <span className="font-bold">{data.totalSlsDikerjakan}</span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

const PieTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const { name, value, percentage } = payload[0].payload;
    return (
      <div className="bg-slate-900 text-white p-2.5 rounded-xl text-xs font-mono shadow-lg border border-slate-800">
        <div className="font-sans font-bold text-slate-300 mb-1">{name}</div>
        <div className="flex justify-between gap-4">
          <span>Jumlah: <strong className="text-white">{value}</strong></span>
          <span>Porsi: <strong className="text-emerald-400">{percentage}%</strong></span>
        </div>
      </div>
    );
  }
  return null;
};

const RenderCustomLegend = ({ payload, colors }) => (
  <ul className="flex flex-col gap-1.5 text-xs font-medium text-slate-600 w-full mt-1">
    {payload.map((entry, index) => {
      const { name, value, percentage } = entry.payload;
      return (
        <li key={index} className="flex items-center justify-between gap-2 border-b border-slate-50 pb-0.5 last:border-0">
          <div className="flex items-center gap-2 truncate">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colors[name] }} />
            <span className="text-slate-700 text-[11px] truncate">{name}</span>
          </div>
          <div className="font-mono text-[11px] text-slate-500 flex items-center gap-1 shrink-0">
            <span className="text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded-md font-semibold">{value}</span> 
            <span className="text-indigo-600 font-bold">({percentage}%)</span>
          </div>
        </li>
      );
    })}
  </ul>
);

function ImportExcelModal({ isOpen, onClose, onRefresh }) {
  const [dataType, setDataType] = useState('KELUARGA'); 
  const [excelHeaders, setExcelHeaders] = useState([]);
  const [excelRows, setExcelRows] = useState([]);
  const [mapping, setMapping] = useState({}); 
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);

  if (!isOpen) return null;

  const currentDbFields = dataType === 'KELUARGA' ? DB_FIELDS_KELUARGA : DB_FIELDS_USAHA;

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = evt.target.result;
      const workbook = XLSX.read(data, { type: 'binary' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rawJson = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      
      if (rawJson.length > 0) {
        let headerRowIndex = 0;
        for (let i = 0; i < Math.min(rawJson.length, 5); i++) {
          if (rawJson[i].includes('Kode') || rawJson[i].some(cell => String(cell).includes('Sub-SLS'))) {
            headerRowIndex = i;
            break;
          }
        }

        const headers = rawJson[headerRowIndex].map(h => String(h).trim());
        const rowsData = XLSX.utils.sheet_to_json(sheet, { range: headerRowIndex });

        setExcelHeaders(headers);
        setExcelRows(rowsData);
        
        const initialMapping = { level_6_full_code: headers.find(h => h.toLowerCase() === 'kode') || '' };
        currentDbFields.forEach(field => {
          const match = headers.find(h => h.toLowerCase().includes(field.label.toLowerCase().split('.')[0].trim()));
          if (match) initialMapping[field.key] = match;
        });
        setMapping(initialMapping);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleMappingChange = (dbKey, excelHeader) => {
    setMapping(prev => ({ ...prev, [dbKey]: excelHeader }));
  };

  const handleProcessUpdate = async () => {
    if (!mapping.level_6_full_code) {
      alert("Kolom unik 'Kode (level_6_full_code)' wajib dipetakan!");
      return;
    }

    setLoading(true);
    setStatusMessage({ type: 'info', text: 'Mengecek data nama SLS yang ada di database...' });

    try {
      const { data: existingDbData, error: fetchError } = await supabase
        .from('progres_lapangan_sls')
        .select('level_6_full_code, nmsls');

      if (fetchError) throw fetchError;

      const dbLookup = {};
      existingDbData.forEach(item => {
        dbLookup[item.level_6_full_code.trim()] = item.nmsls;
      });

      const bulkData = [];
      setStatusMessage({ type: 'info', text: 'Sedang menyiapkan data untuk bulk update...' });

      excelRows.forEach((row) => {
        const rawKode = String(row[mapping.level_6_full_code] || '').trim();
        
        if (rawKode.length !== 16) return;

        const updateRow = {
          level_6_full_code: rawKode,
          updated_at: new Date().toISOString()
        };

        currentDbFields.forEach(field => {
          const excelHeaderName = mapping[field.key];
          if (excelHeaderName !== undefined && excelHeaderName !== '') {
            const cellValue = row[excelHeaderName];

            if (field.key === 'nmsls') {
              const currentDbNmsls = dbLookup[rawKode];
              const isDbNmslsEmpty = !currentDbNmsls || String(currentDbNmsls).trim() === '';

              if (isDbNmslsEmpty && cellValue !== undefined && cellValue !== null) {
                updateRow[field.key] = String(cellValue).trim();
              } else {
                updateRow[field.key] = currentDbNmsls;
              }
              return;
            }

            if (typeof cellValue === 'number') {
              updateRow[field.key] = cellValue;
            } else if (cellValue !== undefined && cellValue !== null && cellValue !== '') {
              let valStr = String(cellValue).replace(/\./g, '').replace(/,/g, '.');
              let valNum = parseFloat(valStr);
              updateRow[field.key] = isNaN(valNum) ? 0 : valNum;
            } else {
              updateRow[field.key] = 0;
            }
          }
        });

        bulkData.push(updateRow);
      });

      if (bulkData.length === 0) {
        throw new Error("Tidak ada data valid dengan kode SLS 16-digit yang ditemukan.");
      }

      setStatusMessage({ type: 'info', text: `Mengirim ${bulkData.length} data sekaligus ke Supabase...` });

      const { error: upsertError } = await supabase
        .from('progres_lapangan_sls')
        .upsert(bulkData, { onConflict: 'level_6_full_code' });

      if (upsertError) throw upsertError;

      const tableNameKey = dataType === 'KELUARGA' ? 'progres_lapangan_keluarga' : 'progres_lapangan_usaha';
      
      const { error: syncError } = await supabase
        .from('sync_status')
        .upsert({
          nama_tabel: tableNameKey,
          last_update: new Date().toISOString()
        }, { onConflict: 'nama_tabel' });

      if (syncError) console.error("Gagal mencatat timestamp di sync_status:", syncError);

      setStatusMessage({ 
        type: 'success', 
        text: `Berhasil memperbarui ${bulkData.length} wilayah SLS data ${dataType.toLowerCase()} & mencatat timestamp!` 
      });

      if (onRefresh) onRefresh(true); // Force bypass cache saat habis import
    } catch (err) {
      console.error(err);
      setStatusMessage({ type: 'error', text: `Gagal memperbarui database: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div>
            <h3 className="text-sm font-black uppercase text-slate-800 tracking-wider">🔄 Import & Update Data via Excel</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">Sesuaikan kolom Excel dengan field database target.</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-lg text-slate-400 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 flex-1 overflow-y-auto space-y-4">
          <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
            <button 
              onClick={() => { setDataType('KELUARGA'); setExcelHeaders([]); setExcelRows([]); setStatusMessage(null); }}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${dataType === 'KELUARGA' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-800'}`}
            >
              👨‍👩‍👧‍👦 Data Hasil Keluarga
            </button>
            <button 
              onClick={() => { setDataType('USAHA'); setExcelHeaders([]); setExcelRows([]); setStatusMessage(null); }}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${dataType === 'USAHA' ? 'bg-white text-amber-600 shadow-xs' : 'text-slate-600 hover:text-slate-800'}`}
            >
              🏢 Data Hasil Usaha
            </button>
          </div>

          <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center hover:bg-slate-50/50 transition relative">
            <input type="file" accept=".xlsx, .xls" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
            <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <span className="text-xs font-bold text-slate-700 block">Pilih File Excel {dataType === 'KELUARGA' ? 'Keluarga' : 'Usaha'}</span>
            <span className="text-[10px] text-slate-400 block mt-0.5">Format file .xlsx atau .xls standar</span>
          </div>

          {excelHeaders.length > 0 && (
            <div className="space-y-3">
              <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-3 text-[11px] text-indigo-800 font-medium">
                💡 <strong>Sistem Mendeteksi:</strong> {excelRows.length} baris di dalam file. Silakan tentukan pemetaan kolom unik & isian data di bawah ini:
              </div>

              <div className="border border-slate-100 rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-100">
                    <tr>
                      <th className="py-2.5 px-3">Field Database Target</th>
                      <th className="py-2.5 px-3">Nama Kolom di Excel Anda</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 font-medium text-slate-700">
                    <tr className="bg-rose-50/30">
                      <td className="py-2 px-3 font-bold text-rose-700">Kode SLS (16-Digit) <span className="text-red-500">*wajib</span></td>
                      <td className="py-2 px-3">
                        <select 
                          value={mapping['level_6_full_code'] || ''} 
                          onChange={(e) => handleMappingChange('level_6_full_code', e.target.value)}
                          className="w-full bg-white border border-rose-200 rounded-lg p-1 text-xs focus:outline-none"
                        >
                          <option value="">-- Pilih Kolom Kode --</option>
                          {excelHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </td>
                    </tr>
                    {currentDbFields.map(field => (
                      <tr key={field.key}>
                        <td className="py-2 px-3 text-slate-600">{field.label}</td>
                        <td className="py-2 px-3">
                          <select 
                            value={mapping[field.key] || ''} 
                            onChange={(e) => handleMappingChange(field.key, e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1 text-xs focus:outline-none"
                          >
                            <option value="">-- Abaikan (Jangan Update) --</option>
                            {excelHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {statusMessage && (
            <div className={`p-3 rounded-xl text-xs flex items-start gap-2 border ${
              statusMessage.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' :
              statusMessage.type === 'error' ? 'bg-red-50 border-red-100 text-red-800' : 'bg-blue-50 border-blue-100 text-blue-800'
            }`}>
              {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />}
              <div>{statusMessage.text}</div>
            </div>
          )}
        </div>

        <div className="p-3 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} disabled={loading} className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-600 transition">
            Batal
          </button>
          <button 
            onClick={handleProcessUpdate} 
            disabled={loading || excelRows.length === 0} 
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition disabled:opacity-40"
          >
            {loading ? 'Memproses...' : 'Mulai Jalankan Update'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// MAIN APP PANEL COMPONENT
// ==========================================
export default function StatusPage() {
  const [rawDbData, setRawDbData] = useState({ progres: [], muatan: [], petugas: [], boyolali: [] });
  const [allPclData, setAllPclData] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // STATE SYNC TIMESTAMP & CACHE SOURCE INDICATOR
  const [lastSyncKeluarga, setLastSyncKeluarga] = useState(null);
  const [lastSyncUsaha, setLastSyncUsaha] = useState(null);
  const [lastSyncBoyolali, setLastSyncBoyolali] = useState(null);
  const [dataCacheSource, setDataCacheSource] = useState('FETCHING'); // 'INDEXEDDB' | 'SUPABASE' | 'FETCHING'

  // FILTER UTAMA DASHBOARD
  const [selectedKecamatan, setSelectedKecamatan] = useState("ALL");
  const [selectedPml, setSelectedPml] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAuditPcl, setSelectedAuditPcl] = useState(null);

  // Drill-Down Level Struktur Tabel Wilayah
  const [drillLevel, setDrillLevel] = useState("KECAMATAN"); 
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  // TAB STATE
  const [activeTab, setActiveTab] = useState('ANOMALI');

  // SORTING TABEL REKAP WILAYAH
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  // SORTING TABEL PERBANDINGAN
  const [compSortConfig, setCompSortConfig] = useState({ key: 'kkSelisih', direction: 'asc' });

  // PAGINASI TABEL PERBANDINGAN
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  const handleCompSort = (key) => {
    let direction = 'asc';
    if (compSortConfig.key === key && compSortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setCompSortConfig({ key, direction });
    setCurrentPage(1);
  };

  const renderCompSortIcon = (key) => {
    if (compSortConfig.key !== key) {
      return <ArrowUpDown className="w-2.5 h-2.5 text-slate-300 inline ml-1 group-hover:text-slate-500" />;
    }
    return compSortConfig.direction === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-indigo-600 font-bold inline ml-1" />
    ) : (
      <ArrowDown className="w-3 h-3 text-indigo-600 font-bold inline ml-1" />
    );
  };

  // ⚡ ENGINES EGRESS SAVER LOGIC WITH INDEXEDDB
  const loadData = async (forceFetch = false) => {
    setLoading(true);
    try {
      // 1. Cek timestamp sync_status terbaru dari Supabase (Hanya memakan egress sangat kecil ~1KB)
      const { data: syncData, error: syncErr } = await supabase
        .from('sync_status')
        .select('nama_tabel, last_update');

      if (syncErr) throw syncErr;

      let currentKeluargaTs = null;
      let currentUsahaTs = null;
      let currentBoyolaliTs = null;

      if (syncData) {
        const rowKeluarga = syncData.find(item => item.nama_tabel === 'progres_lapangan_keluarga');
        const rowUsaha = syncData.find(item => item.nama_tabel === 'progres_lapangan_usaha');
        const rowBoyolali = syncData.find(item => item.nama_tabel === 'progress_boyolali');

        if (rowKeluarga) currentKeluargaTs = rowKeluarga.last_update;
        if (rowUsaha) currentUsahaTs = rowUsaha.last_update;
        if (rowBoyolali) currentBoyolaliTs = rowBoyolali.last_update;
      }

      setLastSyncKeluarga(currentKeluargaTs);
      setLastSyncUsaha(currentUsahaTs);
      setLastSyncBoyolali(currentBoyolaliTs);

      // 2. Buka data Cache dari IndexedDB
      const cachedBoyolaliTs = await getCache('cached_boyolali_ts');
      const cachedRawData = await getCache('cached_raw_db_data');

      // 3. LOGIKA EVALUASI: Pakai IndexedDB atau Tarik Supabase?
      const isCacheValid = 
        !forceFetch && 
        cachedBoyolaliTs && 
        cachedRawData && 
        currentBoyolaliTs && 
        String(cachedBoyolaliTs).trim() === String(currentBoyolaliTs).trim();

      let finalRawData;

      if (isCacheValid) {
        // 🚀 SKENARIO A: HEMAT EGRESS (Ambil dari IndexedDB)
        console.log('⚡ [EGRESS SAVED] Menggunakan data dari IndexedDB lokal.');
        finalRawData = cachedRawData;
        setDataCacheSource('INDEXEDDB');
      } else {
        // 🌐 SKENARIO B: TARIK DARI SUPABASE & UPDATE INDEXEDDB
        console.log('🌐 [SUPABASE FETCH] Fetching data baru dari server...');
        const [progres, muatan, petugas, boyolali] = await Promise.all([
          supabase.from('progres_lapangan_sls').select('*'),
          supabase.from('muatan_sls').select('idsubsls, nmkec, nmdesa, nmsls, jumlah_kk, jumlah_usaha, petugas_id'),
          supabase.from('petugas').select('email, nama_petugas, id_pml_atasan'),
          supabase.from('progress_boyolali').select('idsubsls, open, draft')
        ]);

        if (progres.error || muatan.error || petugas.error || boyolali.error) {
          throw new Error("Gagal mengambil data dari Supabase.");
        }

        finalRawData = {
          progres: progres.data,
          muatan: muatan.data,
          petugas: petugas.data,
          boyolali: boyolali.data
        };

        // Simpan ke IndexedDB
        await setCache('cached_raw_db_data', finalRawData);
        if (currentBoyolaliTs) {
          await setCache('cached_boyolali_ts', currentBoyolaliTs);
        }
        setDataCacheSource('SUPABASE');
      }

      setRawDbData(finalRawData);

      const processed = processRawData(finalRawData.progres, finalRawData.muatan, finalRawData.petugas);
      setAllPclData(processed);

      const palingAnomali = [...processed].sort((a, b) => (b.totalTidakDitemukan + b.totalBgnTutup) - (a.totalTidakDitemukan + a.totalBgnTutup))[0];
      if (palingAnomali) setSelectedAuditPcl(palingAnomali);

    } catch (err) {
      console.error('Data Loading Error:', err.message);
    } fontally: {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const comparisonData = useMemo(() => {
    if (!rawDbData.progres.length) return [];
    return processComparisonData(
      rawDbData.progres, 
      rawDbData.muatan, 
      rawDbData.boyolali, 
      rawDbData.petugas, 
      selectedKecamatan, 
      selectedPml
    );
  }, [rawDbData, selectedKecamatan, selectedPml]);

  const sortedComparisonData = useMemo(() => {
    if (!compSortConfig.key) return comparisonData;

    return [...comparisonData].sort((a, b) => {
      let aVal = a[compSortConfig.key];
      let bVal = b[compSortConfig.key];

      if (compSortConfig.direction === 'asc') {
        return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      } else {
        return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
      }
    });
  }, [comparisonData, compSortConfig]);

  const totalPages = Math.ceil(sortedComparisonData.length / ITEMS_PER_PAGE) || 1;
  const paginatedComparisonData = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return sortedComparisonData.slice(start, start + ITEMS_PER_PAGE);
  }, [sortedComparisonData, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [comparisonData.length]);

  const filteredPclData = useMemo(() => {
    let result = allPclData;

    if (selectedKecamatan !== "ALL") {
      result = result.filter(p => p.nmkec === selectedKecamatan);
    }
    if (selectedPml !== "ALL") {
      result = result.filter(p => p.namaPml === selectedPml);
    }
    if (searchQuery) {
      result = result.filter(p => 
        p.namaPcl.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.namaPml.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    return result;
  }, [allPclData, selectedKecamatan, selectedPml, searchQuery]);

  useEffect(() => {
    if (filteredPclData.length > 0) {
      const masihAda = filteredPclData.some(p => p.email === selectedAuditPcl?.email);
      if (!masihAda) {
        setSelectedAuditPcl(filteredPclData[0]);
      }
    } else {
      setSelectedAuditPcl(null);
    }
  }, [filteredPclData, selectedAuditPcl]);

  const pieChartsData = useMemo(() => {
    let fam = Array(6).fill(0), bgn = Array(5).fill(0);
    filteredPclData.forEach(pcl => {
      pcl.semuaSls.forEach(sls => {
        fam[0] += sls.status_tidak_ditemukan_stop; fam[1] += sls.status_ditemukan_keluarga;
        fam[2] += sls.status_baru_keluarga;        fam[3] += sls.status_meninggal;
        fam[4] += sls.status_tidak_eligible;      fam[5] += sls.status_tidak_dapat_ditemui;
        
        bgn[0] += sls.bgn_tidak_ditemukan; bgn[1] += sls.bgn_ditemukan;
        bgn[2] += sls.bgn_baru;            bgn[3] += sls.bgn_tutup; bgn[4] += sls.bgn_ganda;
      });
    });

    const totalFam = fam.reduce((a, b) => a + b, 0);
    const totalBgn = bgn.reduce((a, b) => a + b, 0);
    const fNames = ['0. Tidak Ditemukan', '1. Ditemukan', '2. Baru', '3. Meninggal', '4. Tidak Eligible', '5. Tidak Dapat Ditemui'];
    const bNames = ['0. Tidak Ditemukan', '1. Ditemukan', '2. Baru', '3. Tutup', '4. Ganda'];

    return {
      keluargaPie: fNames.map((n, i) => ({ name: n, value: fam[i], percentage: totalFam > 0 ? ((fam[i]/totalFam)*100).toFixed(1) : 0 })).filter(x => x.value > 0),
      usahaPie: bNames.map((n, i) => ({ name: n, value: bgn[i], percentage: totalBgn > 0 ? ((bgn[i]/totalBgn)*100).toFixed(1) : 0 })).filter(x => x.value > 0),
      totalFamStatus: totalFam, totalBgnStatus: totalBgn
    };
  }, [filteredPclData]);

  const kpiSummary = useMemo(() => {
    let totalSlsCount = 0;
    let k0Total = 0;
    let uBermasalahTotal = 0;

    filteredPclData.forEach(pcl => {
      totalSlsCount += pcl.totalSlsDikerjakan;
      k0Total += pcl.totalTidakDitemukan;
      uBermasalahTotal += pcl.totalUsahaBermasalah;
    });

    return {
      totalPetugas: filteredPclData.length,
      totalSls: totalSlsCount,
      k0Total,
      uBermasalahTotal,
      anomaliSlsCount: comparisonData.length
    };
  }, [filteredPclData, comparisonData]);

  const { tableRows, topThresholds } = useMemo(() => {
    const initZero = () => ({ fam0:0, fam1:0, fam2:0, fam3:0, fam4:0, fam5:0, bgn0:0, bgn1:0, bgn2:0, bgn3:0, bgn4:0, totalSls:0 });
    const addSlsToAcc = (acc, sls) => {
      acc.fam0 += sls.status_tidak_ditemukan_stop; acc.fam1 += sls.status_ditemukan_keluarga;
      acc.fam2 += sls.status_baru_keluarga; acc.fam3 += sls.status_meninggal;
      acc.fam4 += sls.status_tidak_eligible; acc.fam5 += sls.status_tidak_dapat_ditemui;
      acc.bgn0 += sls.bgn_tidak_ditemukan; acc.bgn1 += sls.bgn_ditemukan;
      acc.bgn2 += sls.bgn_baru; acc.bgn3 += sls.bgn_tutup; acc.bgn4 += sls.bgn_ganda;
      acc.totalSls++;
    };

    let rowsRaw = [];
    
    if (drillLevel === "KECAMATAN") {
      const mapKec = {};
      allPclData.forEach(pcl => {
        if (!mapKec[pcl.nmkec]) mapKec[pcl.nmkec] = { id: pcl.nmkec, label: pcl.nmkec, kdkec: pcl.kdkec || "999", type: 'Kecamatan', ...initZero() };
        pcl.semuaSls.forEach(s => addSlsToAcc(mapKec[pcl.nmkec], s));
      });
      rowsRaw = Object.values(mapKec).sort((a, b) => a.kdkec.localeCompare(b.kdkec));
    } 
    else if (drillLevel === "PML") {
      const mapPml = {};
      allPclData.filter(p => p.nmkec === selectedKecamatan).forEach(pcl => {
        if (!mapPml[pcl.namaPml]) mapPml[pcl.namaPml] = { id: pcl.namaPml, label: pcl.namaPml, type: 'PML Pengawas', ...initZero() };
        pcl.semuaSls.forEach(s => addSlsToAcc(mapPml[pcl.namaPml], s));
      });
      rowsRaw = Object.values(mapPml).sort((a, b) => a.label.localeCompare(b.label));
    }
    else if (drillLevel === "PCL") {
      rowsRaw = allPclData
        .filter(p => p.nmkec === selectedKecamatan && p.namaPml === selectedPml)
        .map(pcl => {
          const res = { id: pcl.email, label: pcl.namaPcl, type: 'PCL Pencacah', rawPayload: pcl, ...initZero() };
          pcl.semuaSls.forEach(s => addSlsToAcc(res, s));
          return res;
        }).sort((a, b) => a.label.localeCompare(b.label));
    }

    const getTop5Threshold = (key) => {
      if (!rowsRaw.length) return Infinity;
      const sortedValues = [...rowsRaw].map(r => r[key]).sort((a, b) => b - a);
      return sortedValues.length >= 5 ? sortedValues[4] : (sortedValues[sortedValues.length - 1] || 1);
    };

    return { 
      tableRows: rowsRaw, 
      topThresholds: {
        fam0: getTop5Threshold('fam0'), fam2: getTop5Threshold('fam2'), fam3: getTop5Threshold('fam3'),
        fam4: getTop5Threshold('fam4'), fam5: getTop5Threshold('fam5'), bgn0: getTop5Threshold('bgn0'),
        bgn3: getTop5Threshold('bgn3'), bgn4: getTop5Threshold('bgn4')
      } 
    };
  }, [drillLevel, selectedKecamatan, selectedPml, allPclData]);

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    } else if (sortConfig.key === key && sortConfig.direction === 'desc') {
      setSortConfig({ key: null, direction: 'asc' });
      return;
    }
    setSortConfig({ key, direction });
  };

  const sortedTableRows = useMemo(() => {
    if (!sortConfig.key) return tableRows;

    return [...tableRows].sort((a, b) => {
      let aValue = a[sortConfig.key];
      let bValue = b[sortConfig.key];

      if (typeof aValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      }

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [tableRows, sortConfig]);

  const renderSortIcon = (key) => {
    if (sortConfig.key !== key) {
      return <ArrowUpDown className="w-2.5 h-2.5 text-slate-300 group-hover:text-slate-500 inline ml-1" />;
    }
    return sortConfig.direction === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-indigo-600 font-bold inline ml-1" />
    ) : (
      <ArrowDown className="w-3 h-3 text-indigo-600 font-bold inline ml-1" />
    );
  };

  const getHeaderSortClass = (key) => {
    return sortConfig.key === key
      ? 'bg-indigo-50/80 text-indigo-900 font-black cursor-pointer select-none transition group'
      : 'hover:bg-slate-100 cursor-pointer select-none transition group';
  };

  const daftarKecamatan = ["ALL", ...new Set(allPclData.map(item => item.nmkec))];

  const grandTotals = useMemo(() => {
    if (!selectedAuditPcl?.semuaSls.length) return null;
    return selectedAuditPcl.semuaSls.reduce((acc, curr) => {
      acc.keluarga_wilkerstat += curr.keluarga_wilkerstat;
      acc.keluarga_prelist += curr.keluarga_prelist;
      acc.status_tidak_ditemukan_stop += curr.status_tidak_ditemukan_stop; 
      acc.status_ditemukan_keluarga += curr.status_ditemukan_keluarga;
      acc.status_baru_keluarga += curr.status_baru_keluarga; 
      acc.status_meninggal += curr.status_meninggal;
      acc.status_tidak_eligible += curr.status_tidak_eligible; 
      acc.status_tidak_dapat_ditemui += curr.status_tidak_dapat_ditemui;
      acc.jml_keluarga += curr.jml_keluarga;

      acc.usaha_wilkerstat += curr.usaha_wilkerstat;
      acc.usaha_prelist += curr.usaha_prelist;
      acc.bgn_tidak_ditemukan += curr.bgn_tidak_ditemukan; 
      acc.bgn_ditemukan += curr.bgn_ditemukan;
      acc.bgn_baru += curr.bgn_baru; 
      acc.bgn_tutup += curr.bgn_tutup; 
      acc.bgn_ganda += curr.bgn_ganda;
      acc.jml_bangunan += curr.jml_bangunan;
      return acc;
    }, {
      keluarga_wilkerstat: 0, keluarga_prelist: 0, status_tidak_ditemukan_stop: 0, status_ditemukan_keluarga: 0,
      status_baru_keluarga: 0, status_meninggal: 0, status_tidak_eligible: 0, status_tidak_dapat_ditemui: 0,
      jml_keluarga: 0, usaha_wilkerstat: 0, usaha_prelist: 0, bgn_tidak_ditemukan: 0, bgn_ditemukan: 0, 
      bgn_baru: 0, bgn_tutup: 0, bgn_ganda: 0, jml_bangunan: 0
    });
  }, [selectedAuditPcl]);

  const handleBackTable = () => {
    if (drillLevel === "PCL") {
      setDrillLevel("PML");
      setSelectedPml("ALL");
    } else if (drillLevel === "PML") {
      setDrillLevel("KECAMATAN");
      setSelectedKecamatan("ALL");
    }
  };

  const handleResetFilters = () => {
    setSelectedKecamatan("ALL");
    setSelectedPml("ALL");
    setDrillLevel("KECAMATAN");
    setSearchQuery("");
  };

  const handleSelectAuditTarget = (pclPayload) => {
    setSelectedAuditPcl(pclPayload);
    setActiveTab('WORKSPACE');
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 p-4 lg:p-6 flex flex-col font-sans antialiased space-y-4">
      
      {/* 1. HEADER BANNER */}
      <div className="bg-white border border-slate-100 p-4 lg:p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-rose-50 rounded-xl text-rose-600 shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-black tracking-wider text-slate-900 uppercase flex items-center gap-2">
              Status Hasil Pendataan Lapangan
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Monitoring anomali muatan wilayah, realisasi keluarga, dan keberadaan usaha.
            </p>
            
            {/* INFORMASI TIMESTAMP & BADGE EGRESS CACHE */}
            <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-400 font-mono mt-1 font-medium">
  
                {lastSyncBoyolali && (
                <span className="flex items-center gap-1 text-indigo-700 bg-indigo-50/80 px-2 py-0.5 rounded-md border border-indigo-100">
                  <Clock className="w-3 h-3 shrink-0" />
                  Last Sync : <strong>{formatDateID(lastSyncKeluarga)}</strong>
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <button 
            onClick={() => setIsImportModalOpen(true)} 
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-xl text-xs font-bold text-white transition flex items-center shadow-xs gap-1.5"
          >
            <Upload className="w-3.5 h-3.5" /> Import Excel
          </button>
          {(selectedKecamatan !== "ALL" || selectedPml !== "ALL" || searchQuery !== "") && (
            <button onClick={handleResetFilters} className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition">
              Reset Filter
            </button>
          )}
          <button 
            onClick={() => loadData(true)} 
            title="Paksa ambil data terbaru dari Supabase" 
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 rounded-xl text-xs font-bold text-white transition flex items-center justify-center gap-2 shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Force Refresh
          </button>
        </div>
      </div>

      {/* 2. FILTER MANAGEMENT BAR */}
      <div className="bg-white p-3 rounded-2xl border border-slate-100 flex flex-col sm:flex-row gap-3 items-center shadow-xs">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Cari berdasarkan nama PCL atau Pengawas (PML)..." 
            value={searchQuery} 
            onChange={(e) => setSearchQuery(e.target.value)} 
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs text-slate-800 focus:outline-none focus:bg-white transition font-medium" 
          />
        </div>
        <div className="w-full sm:w-64">
          <select value={selectedKecamatan} onChange={(e) => {
            const val = e.target.value;
            setSelectedKecamatan(val);
            setSelectedPml("ALL");
            setDrillLevel(val === "ALL" ? "KECAMATAN" : "PML");
          }} className="w-full bg-slate-50 border border-slate-100 rounded-xl text-xs py-2 px-3 text-slate-700 font-bold focus:outline-none">
            {daftarKecamatan.map(kec => <option key={kec} value={kec}>{kec === "ALL" ? "Semua Kecamatan" : kec}</option>)}
          </select>
        </div>
      </div>

      {/* 3. KPI METRIC CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-100 p-3.5 rounded-2xl shadow-xs flex items-center gap-3">
          <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl shrink-0"><Users className="w-4 h-4"/></div>
          <div>
            <div className="text-[10px] font-bold uppercase text-slate-400">Total Petugas / SLS</div>
            <div className="text-sm font-black text-slate-800 font-mono">{kpiSummary.totalPetugas} PCL <span className="text-slate-400 font-normal">({kpiSummary.totalSls} SLS)</span></div>
          </div>
        </div>
        <div className="bg-white border border-slate-100 p-3.5 rounded-2xl shadow-xs flex items-center gap-3">
          <div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl shrink-0"><AlertTriangle className="w-4 h-4"/></div>
          <div>
            <div className="text-[10px] font-bold uppercase text-slate-400">Keluarga Tdk Ditemukan (K.0)</div>
            <div className="text-sm font-black text-rose-600 font-mono">{kpiSummary.k0Total} <span className="text-slate-400 text-xs font-normal">KK</span></div>
          </div>
        </div>
        <div className="bg-white border border-slate-100 p-3.5 rounded-2xl shadow-xs flex items-center gap-3">
          <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl shrink-0"><Building2 className="w-4 h-4"/></div>
          <div>
            <div className="text-[10px] font-bold uppercase text-slate-400">Usaha Tdk Dtm + Tutup</div>
            <div className="text-sm font-black text-amber-600 font-mono">{kpiSummary.uBermasalahTotal} <span className="text-slate-400 text-xs font-normal">Bangunan</span></div>
          </div>
        </div>
        <div className="bg-white border border-slate-100 p-3.5 rounded-2xl shadow-xs flex items-center gap-3">
          <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl shrink-0"><AlertOctagon className="w-4 h-4"/></div>
          <div>
            <div className="text-[10px] font-bold uppercase text-slate-400">SLS Deviasi Signifikan</div>
            <div className="text-sm font-black text-indigo-700 font-mono">{kpiSummary.anomaliSlsCount} <span className="text-slate-400 text-xs font-normal">SLS</span></div>
          </div>
        </div>
      </div>

      {/* 4. VISUALIZATION SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        
        {/* DUAL PIE CHARTS */}
        <div className="lg:col-span-4 space-y-4">
          {[
            { 
              icon: <Users className="w-3.5 text-indigo-600"/>, 
              title: `Status Keluarga (${selectedKecamatan === "ALL" ? "Kabupaten" : `Kec. ${selectedKecamatan}`})`, 
              total: pieChartsData.totalFamStatus, 
              data: pieChartsData.keluargaPie, 
              colors: KELUARGA_COLORS,
              lastSync: lastSyncKeluarga
            },
            { 
              icon: <Building2 className="w-3.5 text-amber-600"/>, 
              title: `Status Usaha (${selectedKecamatan === "ALL" ? "Kabupaten" : `Kec. ${selectedKecamatan}`})`, 
              total: pieChartsData.totalBgnStatus, 
              data: pieChartsData.usahaPie, 
              colors: USAHA_COLORS,
              lastSync: lastSyncUsaha
            }
          ].map((chart, idx) => (
            <div key={idx} className="bg-white border border-slate-100 p-3.5 rounded-2xl shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between border-b border-slate-50 pb-2 mb-2">
                <div className="flex items-center gap-1.5 truncate">
                  {chart.icon}
                  <h4 className="text-[11px] font-bold text-slate-700 uppercase truncate">{chart.title}</h4>
                </div>
                {chart.lastSync && (
                  <span className="text-[9px] font-mono text-slate-400 shrink-0 font-medium">
                    {formatDateID(chart.lastSync)}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="w-[110px] h-[110px] relative shrink-0">
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-[8px] font-black text-slate-400 uppercase">Total</span>
                    <span className="text-xs font-mono font-black text-slate-800">{chart.total}</span>
                  </div>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={chart.data} cx="50%" cy="50%" innerRadius={30} outerRadius={48} paddingAngle={2} dataKey="value">
                        {chart.data.map((e, i) => <Cell key={i} fill={chart.colors[e.name]} />)}
                      </Pie>
                      <ChartTooltip content={<PieTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 min-w-0">
                  <RenderCustomLegend payload={chart.data.map(x => ({ name: x.name, color: chart.colors[x.name], payload: x }))} colors={chart.colors} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* SCATTER PLOT */}
        <div className="lg:col-span-8 bg-white border border-slate-100 rounded-2xl p-4 flex flex-col shadow-xs min-h-[360px]">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              📊 Peta Sebaran Anomali Petugas ({selectedKecamatan === "ALL" ? "Semua Wilayah" : `Kec. ${selectedKecamatan}`})
            </h3>
            <div className="text-[10px] font-bold bg-slate-50 border border-slate-100 text-slate-500 px-2 py-0.5 rounded-md font-mono">
              Terplot: {filteredPclData.length} PCL
            </div>
          </div>
          <div className="flex-1 min-h-[280px]">
            {loading ? (
              <div className="h-full flex items-center justify-center text-xs font-mono text-slate-400 font-bold">Menghitung koordinat sebaran...</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 15, right: 20, bottom: 20, left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f8fafc" />
                  <XAxis type="number" dataKey="totalTidakDitemukan" name="Tidak Ditemukan" stroke="#cbd5e1" tick={{ fontSize: 9, fontFamily: 'monospace', fontSpread: 'bold' }}>
                    <Label value="❌ KELUARGA 'TIDAK DITEMUKAN'" offset={-8} position="insideBottom" fill="#ef4444" style={{ fontSize: '9px', fontWeight: '800', letterSpacing: '0.5px' }} />
                  </XAxis>
                  <YAxis type="number" dataKey="totalUsahaBermasalah" name="Usaha Tidak Ditemukan/Tutup" stroke="#cbd5e1" tick={{ fontSize: 9, fontFamily: 'monospace', fontSpread: 'bold' }}>
                    <Label value="🏠 USAHA BERMASALAH" angle={-90} position="insideLeft" offset={20} fill="#f59e0b" style={{ fontSize: '9px', fontWeight: '800', letterSpacing: '0.5px' }} />
                  </YAxis>
                  <ChartTooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3', stroke: '#e2e8f0' }} />
                  <ReferenceLine x={40} stroke="#f43f5e" strokeDasharray="5 5" />
                  <ReferenceLine y={40} stroke="#fbbf24" strokeDasharray="5 5" />
                  <Scatter name="Petugas" data={filteredPclData} onClick={(node) => handleSelectAuditTarget(node.payload)} className="cursor-pointer">
                    {filteredPclData.map((entry, index) => {
                      const isKritis = entry.totalTidakDitemukan > 40 || entry.totalUsahaBermasalah > 40;
                      return <Cell key={`cell-${index}`} fill={isKritis ? '#f43f5e' : '#4f46e5'} fillOpacity={isKritis ? 0.95 : 0.8} stroke={isKritis ? '#e11d48' : '#3730a3'} strokeWidth={1} r={isKritis ? 7 : 5} />;
                    })}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            )}
          </div>
          <p className="text-[10px] text-slate-400 font-medium text-right mt-1">💡 Klik salah satu titik untuk membuka investigasi detail PCL tersebut.</p>
        </div>

      </div>

      {/* 5. TABBED TABLE NAVIGATION SECTION */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-xs overflow-hidden flex flex-col">
        
        {/* TAB SWITCHER HEADER */}
        <div className="flex border-b border-slate-100 bg-slate-50/50 p-1.5 gap-1.5 overflow-x-auto">
          <button 
            onClick={() => setActiveTab('ANOMALI')} 
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${activeTab === 'ANOMALI' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <AlertOctagon className="w-4 h-4 text-indigo-600" />
            <span>⚠️ Perbandingan dengan Wilkerstat ({selectedKecamatan === "ALL" ? "Semua Kec." : `Kec. ${selectedKecamatan}`})</span>
            <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-rose-50 text-rose-600 font-bold border border-rose-100">
              {comparisonData.length}
            </span>
          </button>

          <button 
            onClick={() => setActiveTab('REKAP')} 
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${activeTab === 'REKAP' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <Layers className="w-4 h-4 text-emerald-600" />
            <span>📊 Rekap per Wilayah</span>
            <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-100 text-slate-600 font-bold">
              {drillLevel}
            </span>
          </button>

          <button 
            onClick={() => setActiveTab('WORKSPACE')} 
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${activeTab === 'WORKSPACE' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <FileText className="w-4 h-4 text-amber-600" />
            <span>🔍 Detail per PPL</span>
            {selectedAuditPcl && (
              <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] bg-amber-50 text-amber-700 font-bold border border-amber-100 truncate max-w-[120px]">
                {selectedAuditPcl.namaPcl}
              </span>
            )}
          </button>
        </div>

        {/* TAB CONTENTS CONTAINER */}
        <div className="p-4">
          
          {/* TAB 1: TABEL PERBANDINGAN MUATAN VS REALISASI */}
          {activeTab === 'ANOMALI' && (
            <div className="flex flex-col">
              <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-3 mb-3 gap-2">
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                    Perbandingan Muatan Wilkerstat vs Realisasi (Sisa OPEN ≤ 10 & Selisih Muatan ±10)
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Menampilkan data SLS terkini sesuai filter: <strong className="text-slate-700">{selectedKecamatan === "ALL" ? "Semua Kecamatan" : `Kec. ${selectedKecamatan}`}</strong>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full border border-indigo-100">
                    Urutan: {compSortConfig.key} ({compSortConfig.direction.toUpperCase()})
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-100">
                <table className="w-full text-left border-collapse text-xs min-w-[1200px]">
                  <thead className="bg-slate-50 text-[9px] text-slate-500 font-bold uppercase tracking-wider border-b border-slate-100 text-center select-none">
                    <tr>
                      <th rowSpan={2} className="py-3 px-4 text-left font-black min-w-[260px] bg-slate-50 sticky left-0 z-10 border-r border-slate-100">
                        Identitas SLS & Petugas
                      </th>
                      <th rowSpan={2} className="py-3 px-2 text-center bg-slate-100 text-slate-700 font-black border-r border-slate-100">
                        Sisa (Open + Draft)
                      </th>
                      <th colSpan={4} className="py-1.5 px-2 bg-indigo-50/50 text-indigo-800 font-black border-r border-slate-100">
                        👨‍👩‍👧‍👦 Muatan Keluarga (KK)
                      </th>
                      <th colSpan={4} className="py-1.5 px-2 bg-amber-50/50 text-amber-800 font-black">
                        🏢 Bangunan Khusus Usaha
                      </th>
                    </tr>
                    <tr className="bg-slate-50/50 divide-x divide-slate-100 text-[9px]">
                      <th className="py-2 px-1 text-slate-500">Wilkerstat</th>
                      <th className="py-2 px-1 text-indigo-600 font-bold">Ditemukan</th>
                      
                      <th 
                        onClick={() => handleCompSort('kkSelisih')}
                        className={`py-2 px-1 text-slate-700 cursor-pointer transition group hover:bg-indigo-100/50 ${compSortConfig.key === 'kkSelisih' ? 'bg-indigo-100 font-black text-indigo-900' : ''}`}
                      >
                        Selisih {renderCompSortIcon('kkSelisih')}
                      </th>

                      <th 
                        onClick={() => handleCompSort('kkRasio')}
                        className={`py-2 px-1 text-indigo-700 border-r border-slate-100 cursor-pointer transition group hover:bg-indigo-100/50 ${compSortConfig.key === 'kkRasio' ? 'bg-indigo-100 font-black text-indigo-900' : ''}`}
                      >
                        Capaian (%) {renderCompSortIcon('kkRasio')}
                      </th>

                      <th className="py-2 px-1 text-slate-500">Wilkerstat</th>
                      <th className="py-2 px-1 text-amber-600 font-bold">Ditemukan</th>
                      
                      <th 
                        onClick={() => handleCompSort('usahaSelisih')}
                        className={`py-2 px-1 text-slate-700 cursor-pointer transition group hover:bg-amber-100/50 ${compSortConfig.key === 'usahaSelisih' ? 'bg-amber-100 font-black text-amber-900' : ''}`}
                      >
                        Selisih {renderCompSortIcon('usahaSelisih')}
                      </th>

                      <th 
                        onClick={() => handleCompSort('usahaRasio')}
                        className={`py-2 px-1 text-amber-700 cursor-pointer transition group hover:bg-amber-100/50 ${compSortConfig.key === 'usahaRasio' ? 'bg-amber-100 font-black text-amber-900' : ''}`}
                      >
                        Capaian (%) {renderCompSortIcon('usahaRasio')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 font-mono text-[11px] font-semibold text-slate-600">
                    {paginatedComparisonData.length > 0 ? (
                      paginatedComparisonData.map((item) => (
                        <tr key={item.idsubsls} className="hover:bg-slate-50/80 transition divide-x divide-slate-100/60">
                          <td className="py-2.5 px-4 font-sans font-bold text-slate-800 bg-white sticky left-0 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.01)] border-r border-slate-100">
                            <div className="text-xs">{item.nmsls}</div>
                            <div className="text-[9px] text-slate-400 font-normal mt-0.5">
                              Kec. {item.nmkec} — Desa {item.nmdesa} ({item.idsubsls})
                            </div>
                            <div className="mt-1 pt-1 border-t border-slate-100 text-[10px] font-normal flex flex-col gap-0.5">
                              <span className="text-slate-600 flex items-center gap-1 truncate">
                                <Briefcase className="w-2.5 h-2.5 text-emerald-500 shrink-0" />
                                <span>PPL:</span> <strong className="text-slate-800 font-semibold">{item.namaPcl}</strong>
                                <User className="w-2.5 h-2.5 text-indigo-500 shrink-0" />
                                <span>PML:</span> <span className="text-slate-700 font-medium">{item.namaPml}</span>
                              </span>
                            </div>
                          </td>

                          <td className="text-center bg-slate-50 text-slate-700 font-bold border-r border-slate-100">
                            <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-800 text-[10px]">
                              {item.totalOpen}
                            </span>
                            <div className="text-[9px] text-slate-400 font-normal mt-0.5">
                              {item.open} open / {item.draft} draft
                            </div>
                          </td>

                          {/* Data Keluarga */}
                          <td className="text-center text-slate-500">{item.kkAwal}</td>
                          <td className="text-center font-bold text-indigo-600">{item.kkHasil}</td>
                          <td className={`text-center font-black ${Math.abs(item.kkSelisih) >= 10 ? 'bg-rose-50 text-rose-600' : 'text-slate-600'}`}>
                            {item.kkSelisih > 0 ? `+${item.kkSelisih}` : item.kkSelisih}
                          </td>
                          <td className="text-center font-black text-indigo-900 bg-indigo-50/20 border-r border-slate-100">
                            {item.kkRasio}%
                          </td>

                          {/* Data Usaha */}
                          <td className="text-center text-slate-500">{item.usahaAwal}</td>
                          <td className="text-center font-bold text-amber-600">{item.usahaHasil}</td>
                          <td className={`text-center font-black ${Math.abs(item.usahaSelisih) >= 10 ? 'bg-amber-50 text-amber-700' : 'text-slate-600'}`}>
                            {item.usahaSelisih > 0 ? `+${item.usahaSelisih}` : item.usahaSelisih}
                          </td>
                          <td className="text-center font-black text-amber-900 bg-amber-50/20">
                            {item.usahaRasio}%
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={10} className="py-8 text-center text-slate-400 font-sans font-medium text-xs">
                          Tidak ada data SLS yang memenuhi syarat pada filter kecamatan ini (Sisa ≤ 10 & Selisih ±10).
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* CONTROL PAGINASI */}
              {comparisonData.length > 0 && (
                <div className="flex items-center justify-between border-t border-slate-100 pt-3 mt-3 text-xs font-sans text-slate-500">
                  <div className="text-[11px] font-medium">
                    Menampilkan <strong className="text-slate-800">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</strong> - <strong className="text-slate-800">{Math.min(currentPage * ITEMS_PER_PAGE, comparisonData.length)}</strong> dari <strong className="text-slate-800">{comparisonData.length}</strong> SLS
                  </div>

                  <div className="flex items-center gap-1.5 font-mono text-[11px]">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:hover:bg-slate-100 text-slate-700 font-bold rounded-lg transition"
                    >
                      ← Prev
                    </button>

                    <span className="px-3 py-1.5 font-bold text-slate-700 bg-slate-50 rounded-lg border border-slate-100">
                      {currentPage} / {totalPages}
                    </span>

                    <button
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                      disabled={currentPage === totalPages}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:hover:bg-slate-100 text-slate-700 font-bold rounded-lg transition"
                    >
                      Next →
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: TABEL DRILL-DOWN REKAP WILAYAH */}
          {activeTab === 'REKAP' && (
            <div className="flex flex-col">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 mb-3">
                <div className="flex items-center gap-2">
                  {drillLevel !== "KECAMATAN" && (
                    <button onClick={handleBackTable} className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-600 transition border border-slate-200">
                      <ArrowLeft className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                      📋 Rekap Distribusi Berdasarkan Status Lapangan
                    </h3>
                    <div className="flex items-center gap-1 text-[10px] text-slate-400 font-mono mt-0.5">
                      <span className="text-indigo-600 font-bold">Kabupaten</span>
                      {selectedKecamatan !== "ALL" && <> <ChevronRight className="w-3 h-3" /> <span className={drillLevel === "PML" ? "text-indigo-600 font-bold" : ""}>Kec. {selectedKecamatan}</span> </>}
                      {selectedPml !== "ALL" && <> <ChevronRight className="w-3 h-3" /> <span className={drillLevel === "PCL" ? "text-indigo-600 font-bold" : ""}>PML {selectedPml}</span> </>}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  {sortConfig.key && (
                    <button 
                      onClick={() => setSortConfig({ key: null, direction: 'asc' })}
                      className="text-[10px] font-mono text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-full font-bold transition"
                    >
                      Reset Sortir ({sortConfig.key})
                    </button>
                  )}
                  <span className="text-[10px] font-mono font-bold bg-amber-50 px-2.5 py-1 text-amber-700 rounded-full flex items-center gap-1.5 border border-amber-100">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" /> Live Top 5 Heatmap Active
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-100">
                <table className="w-full text-left border-collapse text-xs min-w-[1400px]">
                  <thead className="bg-slate-50 text-[9px] text-slate-500 font-bold uppercase tracking-wider border-b border-slate-100">
                    <tr className="bg-slate-50 text-slate-600">
                      <th 
                        rowSpan={2} 
                        onClick={() => handleSort('label')}
                        className={`py-3 px-4 text-left font-black text-[10px] min-w-[220px] sticky left-0 z-20 border-r border-slate-100 shadow-[2px_0_5px_rgba(0,0,0,0.01)] ${getHeaderSortClass('label')}`}
                      >
                        Nama Kecamatan / Petugas {renderSortIcon('label')}
                      </th>
                      <th colSpan={6} className="py-1 px-2 text-center bg-red-50/40 text-red-700 font-black border-r border-slate-100">
                        Isian Status Keluarga
                      </th>
                      <th colSpan={5} className="py-1 px-2 text-center bg-amber-50/40 text-amber-700 font-black border-r border-slate-100">
                        Isian Status Usaha
                      </th>
                      <th 
                        rowSpan={2} 
                        onClick={() => handleSort('totalSls')}
                        className={`py-3 px-2 text-center text-slate-700 font-black ${getHeaderSortClass('totalSls')}`}
                      >
                        Beban SLS {renderSortIcon('totalSls')}
                      </th>
                    </tr>

                    <tr className="bg-slate-50/50 divide-x divide-slate-100 text-[9px]">
                      <th onClick={() => handleSort('fam0')} className={`py-2 px-1 text-center text-red-500 ${getHeaderSortClass('fam0')}`}>
                        K.0 (Tdk) {renderSortIcon('fam0')}
                      </th>
                      <th onClick={() => handleSort('fam1')} className={`py-2 px-1 text-center text-emerald-600 ${getHeaderSortClass('fam1')}`}>
                        K.1 (Dtm) {renderSortIcon('fam1')}
                      </th>
                      <th onClick={() => handleSort('fam2')} className={`py-2 px-1 text-center text-blue-600 ${getHeaderSortClass('fam2')}`}>
                        K.2 (Baru) {renderSortIcon('fam2')}
                      </th>
                      <th onClick={() => handleSort('fam3')} className={`py-2 px-1 text-center text-slate-500 ${getHeaderSortClass('fam3')}`}>
                        K.3 (Mng) {renderSortIcon('fam3')}
                      </th>
                      <th onClick={() => handleSort('fam4')} className={`py-2 px-1 text-center text-slate-400 ${getHeaderSortClass('fam4')}`}>
                        K.4 (NE) {renderSortIcon('fam4')}
                      </th>
                      <th onClick={() => handleSort('fam5')} className={`py-2 px-1 text-center text-amber-600 border-r border-slate-100 ${getHeaderSortClass('fam5')}`}>
                        K.5 (TMet) {renderSortIcon('fam5')}
                      </th>

                      <th onClick={() => handleSort('bgn0')} className={`py-2 px-1 text-center text-red-500 ${getHeaderSortClass('bgn0')}`}>
                        U.0 (Tdk) {renderSortIcon('bgn0')}
                      </th>
                      <th onClick={() => handleSort('bgn1')} className={`py-2 px-1 text-center text-emerald-600 ${getHeaderSortClass('bgn1')}`}>
                        U.1 (Dtm) {renderSortIcon('bgn1')}
                      </th>
                      <th onClick={() => handleSort('bgn2')} className={`py-2 px-1 text-center text-blue-600 ${getHeaderSortClass('bgn2')}`}>
                        U.2 (Baru) {renderSortIcon('bgn2')}
                      </th>
                      <th onClick={() => handleSort('bgn3')} className={`py-2 px-1 text-center text-amber-600 ${getHeaderSortClass('bgn3')}`}>
                        U.3 (Ttp) {renderSortIcon('bgn3')}
                      </th>
                      <th onClick={() => handleSort('bgn4')} className={`py-2 px-1 text-center text-orange-600 border-r border-slate-100 ${getHeaderSortClass('bgn4')}`}>
                        U.4 (Gda) {renderSortIcon('bgn4')}
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-50 font-mono text-[11px] font-semibold text-slate-600">
                    {sortedTableRows.map((row) => {
                      const checkTop = (key, style) => row[key] >= topThresholds[key] && row[key] > 0 ? style : '';
                      return (
                        <tr key={row.id} onClick={() => {
                          if (drillLevel === "KECAMATAN") { 
                            setSelectedKecamatan(row.id); 
                            setDrillLevel("PML"); 
                          } else if (drillLevel === "PML") { 
                            setSelectedPml(row.id); 
                            setDrillLevel("PCL"); 
                          } else if (drillLevel === "PCL" && row.rawPayload) {
                            handleSelectAuditTarget(row.rawPayload);
                          }
                        }} className="hover:bg-slate-50/80 cursor-pointer transition divide-x divide-slate-100/60">
                          <td className="py-2.5 px-4 font-sans font-bold text-slate-800 flex items-center justify-between min-w-[220px] sticky left-0 bg-white z-10 shadow-[2px_0_5px_rgba(0,0,0,0.01)] border-r border-slate-100">
                            <div className="flex items-center gap-2">
                              {row.type === 'Kecamatan' && <MapPin className="w-3.5 h-3.5 text-slate-400" />}
                              {row.type === 'PML Pengawas' && <User className="w-3.5 h-3.5 text-indigo-500" />}
                              {row.type === 'PCL Pencacah' && <Briefcase className="w-3.5 h-3.5 text-emerald-500" />}
                              <div>
                                <div className="text-xs">{row.label}</div>
                                <span className="text-[9px] text-slate-400 font-normal">{row.type}</span>
                              </div>
                            </div>
                            <ChevronRight className="w-3 h-3 text-slate-300" />
                          </td>

                          <td className={`text-center font-bold text-red-600 ${checkTop('fam0', 'bg-red-50 text-red-700 font-black')}`}>{row.fam0}</td>
                          <td className="text-center text-emerald-600">{row.fam1}</td>
                          <td className={`text-center text-blue-600 ${checkTop('fam2', 'bg-blue-50 text-blue-700 font-black')}`}>{row.fam2}</td>
                          <td className={`text-center text-slate-500 ${checkTop('fam3', 'bg-slate-100 text-slate-800 font-black')}`}>{row.fam3}</td>
                          <td className={`text-center text-slate-400 ${checkTop('fam4', 'bg-slate-100 text-slate-700 font-black')}`}>{row.fam4}</td>
                          <td className={`text-center text-amber-600 border-r border-slate-100 ${checkTop('fam5', 'bg-amber-50 text-amber-700 font-black')}`}>{row.fam5}</td>

                          <td className={`text-center text-red-500 ${checkTop('bgn0', 'bg-red-50 text-red-700 font-black')}`}>{row.bgn0}</td>
                          <td className="text-center text-emerald-600">{row.bgn1}</td>
                          <td className="text-center text-blue-600">{row.bgn2}</td>
                          <td className={`text-center font-bold text-amber-600 ${checkTop('bgn3', 'bg-amber-50 text-amber-700 font-black')}`}>{row.bgn3}</td>
                          <td className={`text-center text-orange-600 border-r border-slate-100 ${checkTop('bgn4', 'bg-orange-50 text-orange-700 font-black')}`}>{row.bgn4}</td>

                          <td className="text-center text-slate-800 font-bold bg-slate-50/50">{row.totalSls} SLS</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: WORKSPACE AUDIT PCL TERPILIH */}
          {activeTab === 'WORKSPACE' && (
            <div className="flex flex-col">
              {selectedAuditPcl ? (
                <div className="flex flex-col flex-1">
                  <div className="p-3.5 bg-slate-50 border border-slate-150 rounded-xl mb-3 flex flex-wrap items-center justify-between gap-4 text-xs font-mono">
                    <div className="flex items-center gap-2 text-slate-600 flex-wrap">
                      <User className="w-4 h-4 text-indigo-600" />
                      <span>Nama PPL:</span>
                      <strong className="text-slate-900 font-sans font-black text-sm">{selectedAuditPcl.namaPcl}</strong>
                      <span className="text-slate-300">|</span>
                      <span>Kec:</span>
                      <span className="text-slate-800 font-bold">{selectedAuditPcl.nmkec}</span>
                      <span className="text-slate-300">|</span>
                      <span>Pengawas (PML):</span>
                      <strong className="text-indigo-600 font-sans font-black">{selectedAuditPcl.namaPml}</strong>
                    </div>
                    <div className="flex gap-4 text-[11px] text-slate-500 font-bold">
                      <span className="text-rose-600">Keluarga Tdk Ditemukan: {selectedAuditPcl.totalTidakDitemukan}</span>
                      <span className="text-amber-600">Usaha Tdk Ditemukan + Tutup: {selectedAuditPcl.totalUsahaBermasalah}</span>
                      <span>SLS Jalan: {selectedAuditPcl.totalSlsDikerjakan}</span>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-slate-100">
                    <table className="w-full text-left border-collapse font-sans text-xs min-w-[1900px]">
                      <thead className="bg-slate-50 font-bold uppercase tracking-wider text-[9px] text-slate-500 sticky top-0 z-10 border-b border-slate-200 text-center select-none">
                        <tr className="border-b border-slate-100 bg-slate-50">
                          <th rowSpan={2} className="py-3 px-4 text-left text-[11px] font-black text-slate-800 min-w-[280px] bg-slate-50 sticky left-0 z-20 shadow-[2px_0_5px_rgba(0,0,0,0.02)] border-r border-slate-200">Nama SLS / ID Wilayah</th>
                          <th colSpan={9} className="py-1.5 px-2 border-r border-slate-150 bg-red-50/40 text-red-700 font-black">👨‍👩‍👧‍👦 Detail Hasil Lapangan (Keluarga)</th>
                          <th colSpan={8} className="py-1.5 px-2 bg-amber-50/40 text-amber-700 font-black">🏠 Detail Hasil Lapangan (Usaha)</th>
                        </tr>
                        <tr className="bg-slate-50/30 divide-x divide-slate-100 border-b border-slate-150 text-[9px]">
                          {/* Keluarga */}
                          <th className="py-2.5 px-2 text-center text-slate-600 bg-slate-100/60 font-bold">Wilkerstat</th>
                          <th className="py-2.5 px-2 text-center text-slate-700 bg-slate-100/80 font-bold">Prelist</th>
                          <th className="py-2.5 px-2 text-center text-red-600 bg-red-50/20 font-bold">0. Tdk Ditemukan</th>
                          <th className="py-2.5 px-2 text-center text-emerald-600 font-bold">1. Ditemukan</th>
                          <th className="py-2.5 px-2 text-center text-indigo-600 font-bold">2. Baru</th>
                          <th className="py-2.5 px-2 text-center text-slate-500 font-bold">3. Meninggal</th>
                          <th className="py-2.5 px-2 text-center text-slate-400 font-bold">4. Not Eligible</th>
                          <th className="py-2.5 px-2 text-center text-slate-400 font-bold">5. Tdk Ditemui</th>
                          <th className="py-2.5 px-2 text-center font-black text-slate-800 border-r border-slate-200">Jml Keluarga</th>
                          
                          {/* Usaha */}
                          <th className="py-2.5 px-2 text-center text-slate-600 bg-slate-100/60 font-bold">Wilkerstat</th>
                          <th className="py-2.5 px-2 text-center text-slate-700 bg-slate-100/80 font-bold">Prelist</th>
                          <th className="py-2.5 px-2 text-center text-red-500 font-bold bg-amber-50/10">0. Tdk Ditemukan</th>
                          <th className="py-2.5 px-2 text-center text-emerald-600 font-bold bg-amber-50/10">1. Ditemukan</th>
                          <th className="py-2.5 px-2 text-center text-indigo-500 bg-amber-50/10">2. Baru</th>
                          <th className="py-2.5 px-2 text-center text-amber-600 font-black bg-amber-50/30">3. Tutup</th>
                          <th className="py-2.5 px-2 text-center text-orange-600 bg-amber-50/10 font-bold">4. Ganda</th>
                          <th className="py-2.5 px-2 text-center font-black text-slate-800">Jml Bangunan</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium font-mono text-[11px] text-slate-600">
                        {selectedAuditPcl.semuaSls.map((sls) => {
                          const isHighAnomali = sls.status_tidak_ditemukan_stop > 15 || sls.bgn_tutup > 15;
                          return (
                            <tr key={sls.kode} className={`hover:bg-slate-50/60 transition-colors divide-x divide-slate-100/60 ${isHighAnomali ? 'bg-red-50/10' : ''}`}>
                              <td className="py-2.5 px-4 font-sans text-left bg-white sticky left-0 z-20 shadow-[2px_0_5px_rgba(0,0,0,0.01)] border-r border-slate-200">
                                <div className="font-bold text-slate-800 text-xs">{sls.nama}</div>
                                <div className="text-[10px] text-slate-400 font-bold mt-0.5">
                                  Desa {sls.desa} — <span className="font-mono text-[9px] text-slate-500">{sls.kode}</span>
                                </div>
                              </td>
                              
                              {/* Data Hasil Keluarga */}
                              <td className="py-2.5 px-2 text-center text-slate-500 font-bold bg-slate-50/30">{sls.keluarga_wilkerstat}</td>
                              <td className="py-2.5 px-2 text-center text-slate-700 font-bold bg-slate-50/60">{sls.keluarga_prelist}</td>
                              <td className={`py-2.5 px-2 text-center font-black bg-rose-50/20 text-[#f43f5e] ${sls.status_tidak_ditemukan_stop > 15 ? 'underline text-xs bg-rose-50/50' : ''}`}>
                                {sls.status_tidak_ditemukan_stop}
                              </td>
                              <td className="py-2.5 px-2 text-center text-[#10b981] bg-emerald-50/10 font-bold">{sls.status_ditemukan_keluarga}</td>
                              <td className="py-2.5 px-2 text-center text-[#3b82f6] bg-blue-50/10">{sls.status_baru_keluarga}</td>
                              <td className="py-2.5 px-2 text-center text-[#64748b] bg-slate-50">{sls.status_meninggal}</td>
                              <td className="py-2.5 px-2 text-center text-[#94a3b8] bg-slate-50/50">{sls.status_tidak_eligible}</td>
                              <td className="py-2.5 px-2 text-center text-[#f59e0b] bg-amber-50/10">{sls.status_tidak_dapat_ditemui}</td>
                              <td className="py-2.5 px-2 text-center font-black text-slate-800 bg-slate-100/40 border-r border-slate-200">{sls.jml_keluarga}</td>
                              
                              {/* Data Hasil Usaha */}
                              <td className="py-2.5 px-2 text-center text-slate-500 font-bold bg-slate-50/30">{sls.usaha_wilkerstat}</td>
                              <td className="py-2.5 px-2 text-center text-slate-700 font-bold bg-slate-50/60">{sls.usaha_prelist}</td>
                              <td className="py-2.5 px-2 text-center text-[#e11d48] bg-rose-50/10">{sls.bgn_tidak_ditemukan}</td>
                              <td className="py-2.5 px-2 text-center text-[#059669] bg-emerald-50/10 font-bold">{sls.bgn_ditemukan}</td>
                              <td className="py-2.5 px-2 text-center text-[#6366f1] bg-indigo-50/10">{sls.bgn_baru}</td>
                              <td className={`py-2.5 px-2 text-center font-black bg-amber-50/20 text-[#d97706] ${sls.bgn_tutup > 15 ? 'underline text-xs bg-amber-50/50' : ''}`}>
                                {sls.bgn_tutup}
                              </td>
                              <td className="py-2.5 px-2 text-center text-[#ea580c] bg-orange-50/10">{sls.bgn_ganda}</td>
                              <td className="py-2.5 px-2 text-center font-black text-slate-800 bg-slate-100/40">{sls.jml_bangunan}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      {grandTotals && (
                        <tfoot className="border-t-2 border-slate-300 font-mono text-[11px] font-black bg-slate-100 text-slate-900 divide-y divide-slate-200">
                          <tr className="divide-x divide-slate-200">
                            <td className="py-3 px-4 font-sans text-left bg-slate-100 sticky left-0 z-20 shadow-[2px_0_5px_rgba(0,0,0,0.04)] border-r border-slate-300">
                              <div className="text-xs uppercase font-black text-indigo-950">GRAND TOTAL SUM</div>
                              <div className="text-[10px] font-bold text-slate-400 font-sans mt-0.5">akumulasi data {selectedAuditPcl.semuaSls.length} wilayah SLS</div>
                            </td>
                            {/* Total Keluarga */}
                            <td className="py-3 px-2 text-center text-slate-600">{grandTotals.keluarga_wilkerstat}</td>
                            <td className="py-3 px-2 text-center bg-slate-200/40">{grandTotals.keluarga_prelist}</td>
                            <td className="py-3 px-2 text-center text-red-600">{grandTotals.status_tidak_ditemukan_stop}</td>
                            <td className="py-3 px-2 text-center text-emerald-600">{grandTotals.status_ditemukan_keluarga}</td>
                            <td className="py-3 px-2 text-center text-indigo-600">{grandTotals.status_baru_keluarga}</td>
                            <td className="py-3 px-2 text-center text-slate-500">{grandTotals.status_meninggal}</td>
                            <td className="py-3 px-2 text-center text-slate-500">{grandTotals.status_tidak_eligible}</td>
                            <td className="py-3 px-2 text-center text-slate-500">{grandTotals.status_tidak_dapat_ditemui}</td>
                            <td className="py-3 px-2 text-center bg-slate-200/40 border-r border-slate-300">{grandTotals.jml_keluarga}</td>
                            
                            {/* Total Usaha */}
                            <td className="py-3 px-2 text-center text-slate-600">{grandTotals.usaha_wilkerstat}</td>
                            <td className="py-3 px-2 text-center bg-slate-200/40">{grandTotals.usaha_prelist}</td>
                            <td className="py-3 px-2 text-center text-slate-500">{grandTotals.bgn_tidak_ditemukan}</td>
                            <td className="py-3 px-2 text-center text-slate-500">{grandTotals.bgn_ditemukan}</td>
                            <td className="py-3 px-2 text-center text-indigo-600">{grandTotals.bgn_baru}</td>
                            <td className="py-3 px-2 text-center bg-amber-100/50 text-amber-800">{grandTotals.bgn_tutup}</td>
                            <td className="py-3 px-2 text-center text-orange-600">{grandTotals.bgn_ganda}</td>
                            <td className="py-3 px-2 text-center bg-slate-200/40">{grandTotals.jml_bangunan}</td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-slate-400 font-sans font-bold text-xs p-10 text-center">
                  Belum ada target investigasi terpilih. Silakan klik salah satu baris PCL pada tabel rekap wilayah atau titik pada grafik scatter plot.
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* MODAL IMPORT INTEGRATION */}
      <ImportExcelModal 
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onRefresh={loadData}
      />
    </div>
  );
}