import React, { useState, useEffect, useMemo } from 'react';
import { 
  RefreshCw, Search, User, ShieldAlert, Users, 
  Building2, ChevronRight, ArrowLeft, MapPin, Briefcase,
  X, Upload, CheckCircle2, AlertTriangle
} from 'lucide-react';
import { 
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, 
  Tooltip as ChartTooltip, ResponsiveContainer, Label, 
  ReferenceLine, Cell, PieChart, Pie 
} from 'recharts';
import * as XLSX from 'xlsx';
import { supabase } from '../supabaseClient';

// ==========================================
// 1. DATA CONFIG & ENGINE UTILS (ISOLATED)
// ==========================================
const KELUARGA_COLORS = {
  '0. Tidak Ditemukan': '#f43f5e', '1. Ditemukan': '#10b981', '2. Baru': '#3b82f6',
  '3. Meninggal': '#64748b', '4. Tidak Eligible': '#94a3b8', '5. Tidak Dapat Ditemui': '#f59e0b', '6. Keluarga Khusus': '#a855f7'
};

const USAHA_COLORS = {
  '0. Tidak Ditemukan': '#e11d48', '1. Ditemukan': '#059669', '2. Baru': '#6366f1',
  '3. Tutup': '#d97706', '4. Ganda': '#ea580c'
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
  { key: 'status_keluarga_khusus', label: '6. Keluarga Khusus' },
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
        totalTidakDitemukan: 0, totalBgnTutup: 0,totalUsahaBermasalah: 0, totalSlsDikerjakan: 0, semuaSls: []
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
      kode: kodeSls, nama: row.nmsls, desa: muatan.nmdesa || "TIDAK TERPLOT",
      keluarga_wilkerstat: row.keluarga_wilkerstat || 0, jml_prelist: row.jml_prelist || 0,
      status_tidak_ditemukan_stop: tTidakDitemukan, status_ditemukan_keluarga: row.status_ditemukan_keluarga || 0,
      status_baru_keluarga: row.status_baru_keluarga || 0, status_meninggal: row.status_meninggal || 0,
      status_tidak_eligible: row.status_tidak_eligible || 0, status_tidak_dapat_ditemui: row.status_tidak_dapat_ditemui || 0,
      status_keluarga_khusus: row.status_keluarga_khusus || 0, jml_keluarga: row.jml_keluarga || 0,
      bgn_tidak_ditemukan: row.bgn_tidak_ditemukan || 0, bgn_ditemukan: row.bgn_ditemukan || 0,
      bgn_baru: row.bgn_baru || 0, bgn_tutup: tBgnTutup, bgn_ganda: row.bgn_ganda || 0,
      jml_bangunan: row.jml_bangunan || 0, perbandingan_keluarga_wilkerstat: row.perbandingan_keluarga_wilkerstat || 0,
      perbandingan_keluarga_prelist: row.perbandingan_keluarga_prelist || 0
    });
  });

  return Object.values(pclAgregat);
};

// ==========================================
// 2. PRESENTATIONAL COMPONENTS (TOOLTIPS & MODAL)
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
  <ul className="flex flex-col gap-2 text-xs font-medium text-slate-600 w-full mt-1">
    {payload.map((entry, index) => {
      const { name, value, percentage } = entry.payload;
      return (
        <li key={index} className="flex items-center justify-between gap-2 border-b border-slate-50 pb-1 last:border-0">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colors[name] }} />
            <span className="text-slate-700 text-[12px]">{name}</span>
          </div>
          <div className="font-mono text-xs text-slate-500 flex items-center gap-1">
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
      // 1. Ambil data nmsls yang sudah ada di DB saat ini untuk validasi "jika kosong"
      const { data: existingDbData, error: fetchError } = await supabase
        .from('progres_lapangan_sls')
        .select('level_6_full_code, nmsls');

      if (fetchError) throw fetchError;

      // Buat lookup map untuk mempermudah pengecekan data existing di database
      const dbLookup = {};
      existingDbData.forEach(item => {
        dbLookup[item.level_6_full_code.trim()] = item.nmsls;
      });

      const bulkData = [];
      setStatusMessage({ type: 'info', text: 'Sedang menyiapkan data untuk bulk update...' });

      excelRows.forEach((row) => {
        const rawKode = String(row[mapping.level_6_full_code] || '').trim();
        
        // Filter: Hanya proses jika kode memiliki panjang 16 digit (Level SLS)
        if (rawKode.length !== 16) return;

        const updateRow = {
          level_6_full_code: rawKode, // Key penanda untuk onConflict
          updated_at: new Date().toISOString()
        };

        currentDbFields.forEach(field => {
          const excelHeaderName = mapping[field.key];
          if (excelHeaderName !== undefined && excelHeaderName !== '') {
            const cellValue = row[excelHeaderName];

            // 📑 PENANGANAN KHUSUS UNTUK NAMA SLS (TEKS STRING)
            if (field.key === 'nmsls') {
              const currentDbNmsls = dbLookup[rawKode];
              
              // Cek apakah nmsls di DB saat ini KOSONG (null, undefined, atau string kosong '')
              const isDbNmslsEmpty = !currentDbNmsls || String(currentDbNmsls).trim() === '';

              if (isDbNmslsEmpty && cellValue !== undefined && cellValue !== null) {
                // HANYA UPDATE jika di DB kosong dan di Excel ada isinya
                updateRow[field.key] = String(cellValue).trim();
              } else {
                // Jika di DB sudah ada isinya, pertahankan data DB (jangan kirim field nmsls agar tidak tertimpa)
                updateRow[field.key] = currentDbNmsls;
              }
              return; // Selesai untuk field nmsls, lanjut ke field angka berikutnya
            }

            // 🔢 PENANGANAN UNTUK FIELD ANGKA (NUMERIK)
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

      // 2. Eksekusi menggunakan UPSERT secara massal (Solusi 1)
      const { error } = await supabase
        .from('progres_lapangan_sls')
        .upsert(bulkData, { onConflict: 'level_6_full_code' });

      if (error) throw error;

      setStatusMessage({ 
        type: 'success', 
        text: `Berhasil memperbarui ${bulkData.length} wilayah SLS data ${dataType.toLowerCase()} secara massal!` 
      });
      if (onRefresh) onRefresh();
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
// 3. MAIN APP PANEL COMPONENT
// ==========================================
export default function StatusPage() {
  const [allPclData, setAllPclData] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // FILTER UTAMA YANG AKAN MEMPENGARUHI SELURUH DASHBOARD
  const [selectedKecamatan, setSelectedKecamatan] = useState("ALL");
  const [selectedPml, setSelectedPml] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAuditPcl, setSelectedAuditPcl] = useState(null);

  // Drill-Down Level khusus untuk tampilan Struktur Tabel Wilayah
  const [drillLevel, setDrillLevel] = useState("KECAMATAN"); 
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [progres, muatan, petugas] = await Promise.all([
        supabase.from('progres_lapangan_sls').select('*'),
        supabase.from('muatan_sls').select('idsubsls, nmkec, nmdesa, petugas_id'),
        supabase.from('petugas').select('email, nama_petugas, id_pml_atasan')
      ]);

      if (progres.error || muatan.error || petugas.error) throw new Error("Gagal mengambil data");

      const processed = processRawData(progres.data, muatan.data, petugas.data);
      setAllPclData(processed);
      
      const palingAnomali = [...processed].sort((a, b) => (b.totalTidakDitemukan + b.totalBgnTutup) - (a.totalTidakDitemukan + a.totalBgnTutup))[0];
      if (palingAnomali) setSelectedAuditPcl(palingAnomali);
    } catch (err) {
      console.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  // ⚡ SYNC FILTER ENGINE: Menyaring data master menjadi data terfilter untuk Pie, Scatter, dan Tabel
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

  // Jika data terfilter berubah, pastikan target investigasi terbawah disesuaikan otomatis ke orang pertama yang relevan
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

  // Macro Metrics Memo (Otomatis ter-filter!)
  const pieChartsData = useMemo(() => {
    let fam = Array(7).fill(0), bgn = Array(5).fill(0);
    filteredPclData.forEach(pcl => {
      pcl.semuaSls.forEach(sls => {
        fam[0] += sls.status_tidak_ditemukan_stop; fam[1] += sls.status_ditemukan_keluarga;
        fam[2] += sls.status_baru_keluarga;       fam[3] += sls.status_meninggal;
        fam[4] += sls.status_tidak_eligible;      fam[5] += sls.status_tidak_dapat_ditemui;
        fam[6] += sls.status_keluarga_khusus;
        
        bgn[0] += sls.bgn_tidak_ditemukan; bgn[1] += sls.bgn_ditemukan;
        bgn[2] += sls.bgn_baru;            bgn[3] += sls.bgn_tutup; bgn[4] += sls.bgn_ganda;
      });
    });

    const totalFam = fam.reduce((a, b) => a + b, 0);
    const totalBgn = bgn.reduce((a, b) => a + b, 0);
    const fNames = ['0. Tidak Ditemukan', '1. Ditemukan', '2. Baru', '3. Meninggal', '4. Tidak Eligible', '5. Tidak Dapat Ditemui', '6. Keluarga Khusus'];
    const bNames = ['0. Tidak Ditemukan', '1. Ditemukan', '2. Baru', '3. Tutup', '4. Ganda'];

    return {
      keluargaPie: fNames.map((n, i) => ({ name: n, value: fam[i], percentage: totalFam > 0 ? ((fam[i]/totalFam)*100).toFixed(1) : 0 })).filter(x => x.value > 0),
      usahaPie: bNames.map((n, i) => ({ name: n, value: bgn[i], percentage: totalBgn > 0 ? ((bgn[i]/totalBgn)*100).toFixed(1) : 0 })).filter(x => x.value > 0),
      totalFamStatus: totalFam, totalBgnStatus: totalBgn
    };
  }, [filteredPclData]);

  // Core Matrix Hierarchical Engine
  const { tableRows, topThresholds } = useMemo(() => {
    const initZero = () => ({ fam0:0, fam1:0, fam2:0, fam3:0, fam4:0, fam5:0, fam6:0, bgn0:0, bgn1:0, bgn2:0, bgn3:0, bgn4:0, totalSls:0 });
    const addSlsToAcc = (acc, sls) => {
      acc.fam0 += sls.status_tidak_ditemukan_stop; acc.fam1 += sls.status_ditemukan_keluarga;
      acc.fam2 += sls.status_baru_keluarga; acc.fam3 += sls.status_meninggal;
      acc.fam4 += sls.status_tidak_eligible; acc.fam5 += sls.status_tidak_dapat_ditemui;
      acc.fam6 += sls.status_keluarga_khusus;
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

  const daftarKecamatan = ["ALL", ...new Set(allPclData.map(item => item.nmkec))];

  const grandTotals = useMemo(() => {
    if (!selectedAuditPcl?.semuaSls.length) return null;
    return selectedAuditPcl.semuaSls.reduce((acc, curr) => {
      acc.keluarga_wilkerstat += curr.keluarga_wilkerstat; acc.jml_prelist += curr.jml_prelist;
      acc.status_tidak_ditemukan_stop += curr.status_tidak_ditemukan_stop; acc.status_ditemukan_keluarga += curr.status_ditemukan_keluarga;
      acc.status_baru_keluarga += curr.status_baru_keluarga; acc.status_meninggal += curr.status_meninggal;
      acc.status_tidak_eligible += curr.status_tidak_eligible; acc.status_tidak_dapat_ditemui += curr.status_tidak_dapat_ditemui;
      acc.status_keluarga_khusus += curr.status_keluarga_khusus; acc.jml_keluarga += curr.jml_keluarga;
      acc.bgn_tidak_ditemukan += curr.bgn_tidak_ditemukan; acc.bgn_ditemukan += curr.bgn_ditemukan;
      acc.bgn_baru += curr.bgn_baru; acc.bgn_tutup += curr.bgn_tutup; acc.bgn_ganda += curr.bgn_ganda;
      acc.jml_bangunan += curr.jml_bangunan;
      return acc;
    }, {
      keluarga_wilkerstat: 0, jml_prelist: 0, status_tidak_ditemukan_stop: 0, status_ditemukan_keluarga: 0,
      status_baru_keluarga: 0, status_meninggal: 0, status_tidak_eligible: 0, status_tidak_dapat_ditemui: 0,
      status_keluarga_khusus: 0, jml_keluarga: 0, bgn_tidak_ditemukan: 0, bgn_ditemukan: 0, bgn_baru: 0, bgn_tutup: 0, bgn_ganda: 0, jml_bangunan: 0
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

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 p-4 lg:p-6 flex flex-col font-sans antialiased">
      
      {/* 1. HEADER BANNER */}
      <div className="bg-white border border-slate-100 p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs mb-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-rose-50 rounded-xl text-rose-600">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-black tracking-wider text-slate-900 uppercase flex items-center gap-2">
              Status Hasil Pendataan
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">Hasil pendataan menurut wilayah dan status keberadaan keluarga dan usaha.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsImportModalOpen(true)} 
            className="px-4 py-2.5 bg-indigo-650 hover:bg-indigo-700 bg-indigo-600 rounded-xl text-xs font-bold text-white transition flex items-center shadow-xs gap-1.5"
          >
            <Upload className="w-3.5 h-3.5" /> Import Data Excel
          </button>
          {(selectedKecamatan !== "ALL" || selectedPml !== "ALL") && (
            <button onClick={handleResetFilters} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition">
              Reset Filter Global
            </button>
          )}
          <button onClick={loadData} className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 rounded-xl text-xs font-bold text-white transition flex items-center justify-center gap-2 shadow-xs">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh Data
          </button>
        </div>
      </div>

      {/* 2. FILTER MANAGEMENT */}
      <div className="bg-white p-3 rounded-2xl border border-slate-100 mb-4 flex flex-col sm:flex-row gap-3 items-center shadow-xs">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input type="text" placeholder="Cari berdasarkan nama PCL atau Pengawas (PML)..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs text-slate-800 focus:outline-none focus:bg-white transition font-medium" />
        </div>
        <div className="w-full sm:w-auto">
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

      {/* 3. DUAL PIE CHART PANEL */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {[
          { icon: <Users className="w-3.5 text-indigo-600"/>, title: `Status Keluarga Hasil Pendataan (${selectedKecamatan === "ALL" ? "Kabupaten" : `Kec. ${selectedKecamatan}`}${selectedPml !== "ALL" ? ` | PML: ${selectedPml}` : ''})`, total: pieChartsData.totalFamStatus, data: pieChartsData.keluargaPie, colors: KELUARGA_COLORS },
          { icon: <Building2 className="w-3.5 text-amber-600"/>, title: `Status Usaha Hasil Pendataan (${selectedKecamatan === "ALL" ? "Kabupaten" : `Kec. ${selectedKecamatan}`}${selectedPml !== "ALL" ? ` | PML: ${selectedPml}` : ''})`, total: pieChartsData.totalBgnStatus, data: pieChartsData.usahaPie, colors: USAHA_COLORS }
        ].map((chart, idx) => (
          <div key={idx} className="bg-white border border-slate-100 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between shadow-xs gap-4">
            <div className="w-full sm:w-[40%] h-[150px] relative">
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[9px] font-black text-slate-400 uppercase">Total</span>
                <span className="text-base font-mono font-black text-slate-800">{chart.total}</span>
              </div>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={chart.data} cx="50%" cy="50%" innerRadius={42} outerRadius={62} paddingAngle={2} dataKey="value">
                    {chart.data.map((e, i) => <Cell key={i} fill={chart.colors[e.name]} />)}
                  </Pie>
                  <ChartTooltip content={<PieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-full sm:w-[60%]">
              <div className="flex items-center gap-1.5 border-b border-slate-50 pb-1 mb-1.5">
                {chart.icon}
                <h4 className="text-[11px] font-bold text-slate-700 uppercase truncate">{chart.title}</h4>
              </div>
              <RenderCustomLegend payload={chart.data.map(x => ({ name: x.name, color: chart.colors[x.name], payload: x }))} colors={chart.colors} />
            </div>
          </div>
        ))}
      </div>

      {/* 4. DRILL-DOWN REGION MATRIX TABLE WITH LIVE TOP 5 HEATMAPS */}
      <div className="bg-white border border-slate-100 rounded-2xl p-4 mb-4 shadow-xs flex flex-col">
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
          <span className="text-[10px] font-mono font-bold bg-amber-50 px-2.5 py-1 text-amber-700 rounded-full flex items-center gap-1.5 border border-amber-100">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" /> Live Top 5 Heatmap Active
          </span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full text-left border-collapse text-xs min-w-[1500px]">
            <thead className="bg-slate-50 text-[9px] text-slate-500 font-bold uppercase tracking-wider border-b border-slate-100">
              <tr className="bg-slate-50 text-slate-600">
                <th rowSpan={2} className="py-3 px-4 text-left font-black text-[10px] min-w-[220px] sticky left-0 bg-slate-50 z-10 border-r border-slate-100 shadow-[2px_0_5px_rgba(0,0,0,0.01)]">Nama Kecamatan / Petugas</th>
                <th colSpan={7} className="py-1 px-2 text-center bg-red-50/40 text-red-700 font-black border-r border-slate-100">Isian Status Keluarga</th>
                <th colSpan={5} className="py-1 px-2 text-center bg-amber-50/40 text-amber-700 font-black border-r border-slate-100">Isian Status Usaha</th>
                <th rowSpan={2} className="py-3 px-2 text-center text-slate-700 font-black">Beban SLS</th>
              </tr>
              <tr className="bg-slate-50/50 divide-x divide-slate-100 text-[9px]">
                <th className="py-2 px-1 text-center text-red-500">K.0 (Tdk)</th>
                <th className="py-2 px-1 text-center text-emerald-600">K.1 (Dtm)</th>
                <th className="py-2 px-1 text-center text-blue-600">K.2 (Baru)</th>
                <th className="py-2 px-1 text-center text-slate-500">K.3 (Mng)</th>
                <th className="py-2 px-1 text-center text-slate-400">K.4 (NE)</th>
                <th className="py-2 px-1 text-center text-amber-600">K.5 (TMet)</th>
                <th className="py-2 px-1 text-center text-purple-600 border-r border-slate-100">K.6 (Khs)</th>
                <th className="py-2 px-1 text-center text-red-500">U.0 (Tdk)</th>
                <th className="py-2 px-1 text-center text-emerald-600">U.1 (Dtm)</th>
                <th className="py-2 px-1 text-center text-blue-600">U.2 (Baru)</th>
                <th className="py-2 px-1 text-center text-amber-600">U.3 (Ttp)</th>
                <th className="py-2 px-1 text-center text-orange-600 border-r border-slate-100">U.4 (Gda)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 font-mono text-[11px] font-semibold text-slate-600">
              {tableRows.map((row) => {
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
                      setSelectedAuditPcl(row.rawPayload);
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
                    <td className={`text-center text-amber-600 ${checkTop('fam5', 'bg-amber-50 text-amber-700 font-black')}`}>{row.fam5}</td>
                    <td className="text-center text-purple-600 border-r border-slate-100">{row.fam6}</td>
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

      {/* 5. WORKSPACE CORE GRID (SCATTER PLOT) */}
      <div className="h-[500px] bg-white border border-slate-100 rounded-2xl p-4 flex flex-col mb-4 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            📊 Peta Sebaran Keluarga dan Usaha Tidak Ditemukan Per Petugas ({selectedKecamatan === "ALL" ? "Semua Wilayah" : `Kec. ${selectedKecamatan}`}{selectedPml !== "ALL" ? ` | PML: ${selectedPml}` : ''})
          </h3>
          <div className="text-[10px] font-bold bg-slate-50 border border-slate-100 text-slate-500 px-2 py-0.5 rounded-md font-mono">
            Terplot: {filteredPclData.length} Petugas
          </div>
        </div>
        <div className="flex-1 min-h-0">
          {loading ? (
            <div className="h-full flex items-center justify-center text-xs font-mono text-slate-400 font-bold">Menghitung koordinat sebaran...</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 15, right: 30, bottom: 20, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f8fafc" />
                <XAxis type="number" dataKey="totalTidakDitemukan" name="Tidak Ditemukan" stroke="#cbd5e1" tick={{ fontSize: 9, fontFamily: 'monospace', fontSpread: 'bold' }}>
                  <Label value="❌ KELUARGA 'TIDAK DITEMUKAN'" offset={-8} position="insideBottom" fill="#ef4444" style={{ fontSize: '9px', fontWeight: '800', letterSpacing: '0.5px' }} />
                </XAxis>
                <YAxis type="number" dataKey="totalUsahaBermasalah" name="Usaha Tidak Ditemukan/Tutup" stroke="#cbd5e1" tick={{ fontSize: 9, fontFamily: 'monospace', fontSpread: 'bold' }}>
                  <Label value="🏠 USAHA 'TIDAK DITEMUKAN'/'TUTUP'" angle={-90} position="insideLeft" offset={20} fill="#f59e0b" style={{ fontSize: '9px', fontWeight: '800', letterSpacing: '0.5px' }} />
                </YAxis>
                <ChartTooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3', stroke: '#e2e8f0' }} />
                <ReferenceLine x={40} stroke="#f43f5e" strokeDasharray="5 5" />
                <ReferenceLine y={40} stroke="#fbbf24" strokeDasharray="5 5" />
                <Scatter name="Petugas" data={filteredPclData} onClick={(node) => setSelectedAuditPcl(node.payload)} className="cursor-pointer">
                  {filteredPclData.map((entry, index) => {
                    const isKritis = entry.totalTidakDitemukan > 40 || entry.totalUsahaBermasalah > 40;
                    return <Cell key={`cell-${index}`} fill={isKritis ? '#f43f5e' : '#4f46e5'} fillOpacity={isKritis ? 0.95 : 0.8} stroke={isKritis ? '#e11d48' : '#3730a3'} strokeWidth={1} r={isKritis ? 7 : 5} />;
                  })}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* 6. LOWER PANEL: 17-COLUMN COMPREHENSIVE WORKSPACE TABEL */}
      <div className="bg-white border border-slate-100 rounded-2xl flex flex-col overflow-hidden shadow-xs">
        {selectedAuditPcl ? (
          <div className="flex flex-col flex-1">
            <div className="p-4 bg-slate-50 border-b border-slate-150 flex flex-wrap items-center justify-between gap-4 text-xs font-mono">
              <div className="flex items-center gap-2 text-slate-600 flex-wrap">
                <User className="w-4 h-4 text-indigo-600" />
                <span>Nama PCL:</span>
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
                <span className="text-amber-600">Usaha Tidak Ditemukan + Tutup: {selectedAuditPcl.totalUsahaBermasalah}</span>
                <span>SLS Jalan: {selectedAuditPcl.totalSlsDikerjakan}</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse font-sans text-xs min-w-[2200px]">
                <thead className="bg-slate-50 font-bold uppercase tracking-wider text-[9px] text-slate-500 sticky top-0 z-10 border-b border-slate-200 text-center select-none">
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th rowSpan={2} className="py-3 px-4 text-left text-[11px] font-black text-slate-800 min-w-[280px] bg-slate-50 sticky left-0 z-20 shadow-[2px_0_5px_rgba(0,0,0,0.02)] border-r border-slate-200">Nama SLS / ID Wilayah</th>
                    <th colSpan={2} className="py-1.5 px-2 border-r border-slate-150 bg-slate-100/60 text-slate-700 font-black">🎯 Target Sistem</th>
                    <th colSpan={8} className="py-1.5 px-2 border-r border-slate-150 bg-red-50/40 text-red-700 font-black">👨‍👩‍👧‍👦 Detail Hasil Lapangan (Keluarga)</th>
                    <th colSpan={6} className="py-1.5 px-2 border-r border-slate-150 bg-amber-50/40 text-amber-700 font-black">🏠 Detail Hasil Lapangan (Usaha)</th>
                    <th colSpan={2} className="py-1.5 px-2 bg-indigo-50/60 text-indigo-800 font-black">📈 Rasio Pembanding (%)</th>
                  </tr>
                  <tr className="bg-slate-50/30 divide-x divide-slate-100 border-b border-slate-150 text-[9px]">
                    <th className="py-2.5 px-2 text-center">Wilkerstat</th>
                    <th className="py-2.5 px-2 text-center border-r border-slate-200">Prelist</th>
                    <th className="py-2.5 px-2 text-center text-red-600 bg-red-50/20 font-bold">0. Tdk Ditemukan</th>
                    <th className="py-2.5 px-2 text-center text-emerald-600 font-bold">1. Ditemukan</th>
                    <th className="py-2.5 px-2 text-center text-indigo-600 font-bold">2. Baru</th>
                    <th className="py-2.5 px-2 text-center text-slate-500 font-bold">3. Meninggal</th>
                    <th className="py-2.5 px-2 text-center text-slate-400 font-bold">4. Not Eligible</th>
                    <th className="py-2.5 px-2 text-center text-slate-400 font-bold">5. Tdk Ditemui</th>
                    <th className="py-2.5 px-2 text-center text-purple-600 font-bold">6. Khusus</th>
                    <th className="py-2.5 px-2 text-center font-black text-slate-800 border-r border-slate-200">Jml Keluarga</th>
                    <th className="py-2.5 px-2 text-center text-red-500 font-bold bg-amber-50/10">0. Tdk Ditemukan</th>
                    <th className="py-2.5 px-2 text-center text-emerald-600 font-bold bg-amber-50/10">1. Ditemukan</th>
                    <th className="py-2.5 px-2 text-center text-indigo-500 bg-amber-50/10">2. Baru</th>
                    <th className="py-2.5 px-2 text-center text-amber-600 font-black bg-amber-50/30">3. Tutup</th>
                    <th className="py-2.5 px-2 text-center text-orange-600 bg-amber-50/10 font-bold">4. Ganda</th>
                    <th className="py-2.5 px-2 text-center font-black text-slate-800 border-r border-slate-200">Jml Bangunan</th>
                    <th className="py-2.5 px-2 text-center text-slate-600 font-bold">Rasio Wilkerstat</th>
                    <th className="py-2.5 px-2 text-center text-indigo-700 font-black">Rasio Prelist</th>
                  </tr>
                </thead>
<tbody className="divide-y divide-slate-100 font-medium font-mono text-[11px] text-slate-600">
  {selectedAuditPcl.semuaSls.map((sls) => {
    const isHighAnomali = sls.status_tidak_ditemukan_stop > 15 || sls.bgn_tutup > 15;
    return (
      <tr key={sls.kode} className={`hover:bg-slate-50/60 transition-colors divide-x divide-slate-100/60 ${isHighAnomali ? 'bg-red-50/10' : ''}`}>
        
        {/* Nama SLS / ID Wilayah (Sticky) */}
        <td className="py-2.5 px-4 font-sans text-left bg-white sticky left-0 z-20 shadow-[2px_0_5px_rgba(0,0,0,0.01)] border-r border-slate-200">
          <div className="font-bold text-slate-800 text-xs">{sls.nama}</div>
          <div className="text-[10px] text-slate-400 font-bold mt-0.5">
            Desa {sls.desa} — <span className="font-mono text-[9px] text-slate-500">{sls.kode}</span>
          </div>
        </td>
        
        {/* 🎯 Target Sistem */}
        <td className="py-2.5 px-2 text-center text-slate-400 font-bold">{sls.keluarga_wilkerstat}</td>
        <td className="py-2.5 px-2 text-center text-slate-700 font-bold bg-slate-50/30">{sls.jml_prelist}</td>
        
        {/* 👨‍👩‍👧‍👦 Detail Hasil Lapangan (Keluarga) - Mengikuti KELUARGA_COLORS */}
        <td className={`py-2.5 px-2 text-center font-black bg-rose-50/20 text-[#f43f5e] ${sls.status_tidak_ditemukan_stop > 15 ? 'underline text-xs bg-rose-50/50' : ''}`}>
          {sls.status_tidak_ditemukan_stop}
        </td>
        <td className="py-2.5 px-2 text-center text-[#10b981] bg-emerald-50/10 font-bold">{sls.status_ditemukan_keluarga}</td>
        <td className="py-2.5 px-2 text-center text-[#3b82f6] bg-blue-50/10">{sls.status_baru_keluarga}</td>
        <td className="py-2.5 px-2 text-center text-[#64748b] bg-slate-50">{sls.status_meninggal}</td>
        <td className="py-2.5 px-2 text-center text-[#94a3b8] bg-slate-50/50">{sls.status_tidak_eligible}</td>
        <td className="py-2.5 px-2 text-center text-[#f59e0b] bg-amber-50/10">{sls.status_tidak_dapat_ditemui}</td>
        <td className="py-2.5 px-2 text-center text-[#a855f7] bg-purple-50/10">{sls.status_keluarga_khusus}</td>
        
        {/* Total Sektor Keluarga */}
        <td className="py-2.5 px-2 text-center font-black text-slate-800 bg-slate-100/40 border-r border-slate-200">{sls.jml_keluarga}</td>
        
        {/* 🏠 Detail Hasil Lapangan (Usaha) - Mengikuti USAHA_COLORS */}
        <td className="py-2.5 px-2 text-center text-[#e11d48] bg-rose-50/10">{sls.bgn_tidak_ditemukan}</td>
        <td className="py-2.5 px-2 text-center text-[#059669] bg-emerald-50/10 font-bold">{sls.bgn_ditemukan}</td>
        <td className="py-2.5 px-2 text-center text-[#6366f1] bg-indigo-50/10">{sls.bgn_baru}</td>
        <td className={`py-2.5 px-2 text-center font-black bg-amber-50/20 text-[#d97706] ${sls.bgn_tutup > 15 ? 'underline text-xs bg-amber-50/50' : ''}`}>
          {sls.bgn_tutup}
        </td>
        <td className="py-2.5 px-2 text-center text-[#ea580c] bg-orange-50/10">{sls.bgn_ganda}</td>
        
        {/* Total Sektor Usaha */}
        <td className="py-2.5 px-2 text-center font-black text-slate-800 bg-slate-100/40 border-r border-slate-200">{sls.jml_bangunan}</td>
        
        {/* 📈 Rasio Pembanding */}
        <td className="py-2.5 px-2 text-center text-slate-500 font-bold">{sls.perbandingan_keluarga_wilkerstat}%</td>
        <td className="py-2.5 px-2 text-center bg-slate-50/30">
          <span className={`px-1.5 py-0.5 rounded-md font-bold text-[10px] ${sls.perbandingan_keluarga_prelist < 70 ? 'bg-red-50 text-red-600 border border-red-100 animate-pulse' : 'bg-slate-100 text-slate-500'}`}>
            {sls.perbandingan_keluarga_prelist}%
          </span>
        </td>
        
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
                      <td className="py-3 px-2 text-center">{grandTotals.keluarga_wilkerstat}</td>
                      <td className="py-3 px-2 text-center bg-slate-200/40">{grandTotals.jml_prelist}</td>
                      <td className="py-3 px-2 text-center text-red-600">{grandTotals.status_tidak_ditemukan_stop}</td>
                      <td className="py-3 px-2 text-center text-emerald-600">{grandTotals.status_ditemukan_keluarga}</td>
                      <td className="py-3 px-2 text-center text-indigo-600">{grandTotals.status_baru_keluarga}</td>
                      <td className="py-3 px-2 text-center text-slate-500">{grandTotals.status_meninggal}</td>
                      <td className="py-3 px-2 text-center text-slate-500">{grandTotals.status_tidak_eligible}</td>
                      <td className="py-3 px-2 text-center text-slate-500">{grandTotals.status_tidak_dapat_ditemui}</td>
                      <td className="py-3 px-2 text-center text-purple-600">{grandTotals.status_keluarga_khusus}</td>
                      <td className="py-3 px-2 text-center bg-slate-200/40">{grandTotals.jml_keluarga}</td>
                      <td className="py-3 px-2 text-center text-slate-500">{grandTotals.bgn_tidak_ditemukan}</td>
                      <td className="py-3 px-2 text-center text-slate-500">{grandTotals.bgn_ditemukan}</td>
                      <td className="py-3 px-2 text-center text-indigo-600">{grandTotals.bgn_baru}</td>
                      <td className="py-3 px-2 text-center bg-amber-100/50 text-amber-800">{grandTotals.bgn_tutup}</td>
                      <td className="py-3 px-2 text-center text-orange-600">{grandTotals.bgn_ganda}</td>
                      <td className="py-3 px-2 text-center bg-slate-200/40">{grandTotals.jml_bangunan}</td>
                      <td className="py-3 px-2 text-center text-slate-600">{grandTotals.perbandingan_keluarga_wilkerstat}%</td>
                      <td className="py-3 px-2 text-center bg-indigo-50 text-indigo-900 font-black text-xs">{grandTotals.perbandingan_keluarga_prelist}%</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-400 font-sans font-bold text-xs p-10 text-center">Belum ada target investigasi terpilih. Silakan klik salah satu baris PCL pada tabel wilayah di atas atau koordinat grafik scatter plot.</div>
        )}
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