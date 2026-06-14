import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { 
    AlertTriangle, ShieldAlert, BarChart3, Map as MapIcon, 
    Search, Filter, ChevronRight, RefreshCw, AlertCircle, 
    ArrowUpDown, Info, HelpCircle, TrendingUp, TrendingDown, Users, X
} from 'lucide-react';

export default function AnomaliMonitoringPage() {
    const { profile } = useAuth();
    
    // Core State Management
    const [loading, setLoading] = useState(true);
    const [rawMasterSls, setRawMasterSls] = useState([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedKecamatan, setSelectedKecamatan] = useState("SEMUA");
    const [selectedRiskLevel, setSelectedRiskLevel] = useState("ALL");
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
    const [selectedPetugas, setSelectedPetugas] = useState(null);
    const [activeKecamatanDetail, setActiveKecamatanDetail] = useState(null);

    // STATE CACHE ELEMEN MAKRO (Kunci utama performa instan)
    const [cachedAgregasiKecamatan, setCachedAgregasiKecamatan] = useState([]);
    const [cachedDaftarKecamatanUnik, setCachedDaftarKecamatanUnik] = useState([]);
    const [cachedRingkasanNasional, setCachedRingkasanNasional] = useState({ totalRed: 0, totalAmber: 0, totalSls: 0 });

    // =========================================================================
    // 1. DATA INGESTION ENGINE + COMPUTE ONCE (PRE-AGGREGATION & PRE-SORTING)
    // =========================================================================
    const fetchMasterMuatanData = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('view_rekonsiliasi_muatan')
                .select('*');
            
            if (error) throw error;

            const baseData = data || [];

            // A. Urutkan Master SLS berdasarkan Kode Wilayah (Kdkec -> Kddesa -> Kdsls) secara permanen
            baseData.sort((a, b) => {
                const urutKec = (a.kdkec || "000").localeCompare(b.kdkec || "000", undefined, { numeric: true });
                if (urutKec !== 0) return urutKec;

                const urutDesa = (a.kddesa || "000").localeCompare(b.kddesa || "000", undefined, { numeric: true });
                if (urutDesa !== 0) return urutDesa;

                return (a.kdsls || "0000").localeCompare(b.kdsls || "0000", undefined, { numeric: true });
            });

            // B. Hitung Agregasi Kecamatan Sekali Saja di Awal
            const kecMap = new Map();
            const unikKecMap = new Map();
            let totalRed = 0;
            let totalAmber = 0;

            baseData.forEach(sls => {
                if (sls.status_risiko === "RED") totalRed++;
                if (sls.status_risiko === "AMBER") totalAmber++;

                // Mapping Dropdown Filter
                if (sls.nmkec && !unikKecMap.has(sls.nmkec)) {
                    unikKecMap.set(sls.nmkec, sls.kdkec || "000");
                }

                // Mapping Peta Klaster Kecamatan
                const key = sls.nmkec || "TIDAK TERDEFINISI";
                if (!kecMap.has(key)) {
                    kecMap.set(key, { 
                        nmkec: key, 
                        kdkec: sls.kdkec || "000", 
                        totalSls: 0, 
                        totalSumberA: 0, 
                        totalSumberB: 0, 
                        redFlags: 0, 
                        amberFlags: 0 
                    });
                }
                const current = kecMap.get(key);
                current.totalSls += 1;
                current.totalSumberA += sls.sumber_a || 0;
                current.totalSumberB += sls.sumber_b || 0;
                if (sls.status_risiko === "RED") current.redFlags += 1;
                if (sls.status_risiko === "AMBER") current.amberFlags += 1;
            });

            // C. Simpan Semua Hasil ke State Cache
            setCachedRingkasanNasional({ totalRed, totalAmber, totalSls: baseData.length });

            setCachedAgregasiKecamatan(
                Array.from(kecMap.values()).sort((a, b) => a.kdkec.localeCompare(b.kdkec, undefined, { numeric: true }))
            );

            setCachedDaftarKecamatanUnik(
                Array.from(unikKecMap.entries())
                    .sort((a, b) => a[1].localeCompare(b[1], undefined, { numeric: true }))
                    .map(entry => entry[0])
            );

            setRawMasterSls(baseData);
        } catch (err) {
            console.error("Gagal menarik data rekonsiliasi view:", err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchMasterMuatanData();
    }, []);

    // Otomatis reset sub-filter petugas jika filter kecamatan utama berubah
    useEffect(() => {
        setSelectedPetugas(null);
    }, [selectedKecamatan]);

    // =========================================================================
    // 2. PETUGAS PERFORMANCE AGGREGATION (OPTIMIZED BY SELECTED KECAMATAN)
    // =========================================================================
    const agregasiPetugas = useMemo(() => {
        const petugasMap = new Map();

        rawMasterSls.forEach(sls => {
            // Saring petugas secara instan berdasarkan kecamatan yang dipilih saat ini
            if (selectedKecamatan !== "SEMUA" && sls.nmkec !== selectedKecamatan) return;

            const pId = sls.petugas_id ? sls.petugas_id.trim() : "BELUM DITUGASKAN";
            const pNama = sls.nama_petugas || "Belum Ditugaskan";
            
            if (!petugasMap.has(pId)) {
                petugasMap.set(pId, {
                    petugas_id: pId,
                    nama_petugas: pNama,
                    totalSls: 0,
                    totalA: 0,
                    totalB: 0,
                    totalSelisih: 0,
                    kasusEkstrem: 0
                });
            }

            const current = petugasMap.get(pId);
            current.totalSls += 1;
            current.totalA += sls.sumber_a || 0;
            current.totalB += sls.sumber_b || 0;
            current.totalSelisih += sls.selisih_absolut || 0;
            if (sls.status_risiko === "RED") current.kasusEkstrem += 1;
        });

        return Array.from(petugasMap.values()).sort((a, b) => b.totalSelisih - a.totalSelisih);
    }, [rawMasterSls, selectedKecamatan]);

    // =========================================================================
    // 3. FILTERING ENGINE (SANGAT RINGAN & INSTAN)
    // =========================================================================
    const filteredAndSortedSls = useMemo(() => {
        const cleanSearch = searchTerm.toLowerCase().trim();

        // Operasi filter murni linier (O(N)), tidak ada sorting berat di dalam sini
        let result = rawMasterSls.filter(sls => {
            const matchesSearch = !cleanSearch ||
                (sls.nmsls || "").toLowerCase().includes(cleanSearch) ||
                (sls.nmdesa || "").toLowerCase().includes(cleanSearch) ||
                (sls.nama_petugas || "").toLowerCase().includes(cleanSearch) ||
                (sls.idsubsls || "").toLowerCase().includes(cleanSearch);
            
            const matchesKec = selectedKecamatan === "SEMUA" || sls.nmkec === selectedKecamatan;
            const matchesRisk = selectedRiskLevel === "ALL" || sls.status_risiko === selectedRiskLevel;
            const matchesPetugas = !selectedPetugas || (sls.petugas_id && sls.petugas_id.trim() === selectedPetugas.id);
            
            return matchesSearch && matchesKec && matchesRisk && matchesPetugas;
        });

        // Hanya melakukan pengurutan manual jika user mengklik kepala tabel desktop
        if (sortConfig.key) {
            result.sort((a, b) => {
                let aVal = a[sortConfig.key];
                let bVal = b[sortConfig.key];
                return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
            });
        }

        return result;
    }, [rawMasterSls, searchTerm, selectedKecamatan, selectedRiskLevel, sortConfig, selectedPetugas]);

    const requestSort = (key) => {
        let direction = 'desc';
        if (sortConfig.key === key && sortConfig.direction === 'desc') {
            direction = 'asc';
        }
        setSortConfig({ key, direction });
    };

    if (loading) {
        return (
            <div className="h-[50vh] bg-slate-50 flex flex-col justify-center items-center text-center p-6 text-slate-600">
                <RefreshCw className="animate-spin text-emerald-600 mb-4" size={40} />
                <h3 className="font-black text-xs tracking-widest uppercase text-slate-400">Menyusun Data Sesuai Kode Wilayah...</h3>
            </div>
        );
    }

    return (
        <div className="w-full bg-slate-50 font-sans flex flex-col text-slate-800 space-y-6">
            
            {/* HEADER CONTROL */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
                <div>
                    <span className="text-[10px] bg-emerald-50 text-emerald-700 font-black px-2.5 py-1 rounded-md tracking-wider border border-emerald-200 uppercase">
                        📊 PERBANDINGAN MUATAN
                    </span>
                    <h1 className="text-xl font-black tracking-tight text-slate-800 uppercase mt-1.5">
                        Perbandingan Data Muatan Awal <span className="text-emerald-600">SE2026</span>
                    </h1>
                </div>
                <button 
                    onClick={fetchMasterMuatanData}
                    className="w-full sm:w-auto px-4 py-2 bg-slate-900 hover:bg-slate-800 active:scale-95 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm"
                >
                    <RefreshCw size={12} />
                    <span>Bandingkan Ulang</span>
                </button>
            </div>

            {/* Metrik Utama */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex items-center justify-between">
                    <div>
                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Total SLS Beban Tugas</p>
                        <h2 className="text-2xl font-black text-slate-800 mt-1">{cachedRingkasanNasional.totalSls}</h2>
                        <p className="text-[9px] text-slate-500 mt-1 font-medium">Jumlah SLS Terdaftar</p>
                    </div>
                    <div className="p-3 bg-slate-100 rounded-xl text-slate-600"><MapIcon size={20} /></div>
                </div>

                <div className="bg-white border border-red-100 rounded-2xl p-5 shadow-xs flex items-center justify-between relative overflow-hidden">
                    <div className="absolute right-0 top-0 w-24 h-24 bg-red-500/5 rounded-full blur-2xl"></div>
                    <div>
                        <p className="text-[10px] font-black uppercase text-red-600 tracking-wider flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping"></span>
                            SELISIH MUATAN BESAR (GAP EKSTREM)
                        </p>
                        <h2 className="text-2xl font-black text-red-600 mt-1">{cachedRingkasanNasional.totalRed} <span className="text-xs text-slate-400 font-bold">SLS</span></h2>
                        <p className="text-[9px] text-red-700 mt-1 font-bold bg-red-50 px-1.5 py-0.5 rounded w-max">Beda &gt; 2.5x / Sebelah 0</p>
                    </div>
                    <div className="p-3 bg-red-50 rounded-xl text-red-600"><ShieldAlert size={20} /></div>
                </div>

                <div className="bg-white border border-amber-200 rounded-2xl p-5 shadow-xs flex items-center justify-between">
                    <div>
                        <p className="text-[10px] font-black uppercase text-amber-600 tracking-wider">SELISIH MUATAN SEDANG (AMBER FLAGS)</p>
                        <h2 className="text-2xl font-black text-amber-600 mt-1">{cachedRingkasanNasional.totalAmber} <span className="text-xs text-slate-400 font-bold">SLS</span></h2>
                        <p className="text-[9px] text-amber-700 mt-1 font-medium">Selisih &gt; 30 Unit Usaha</p>
                    </div>
                    <div className="p-3 bg-amber-50 rounded-xl text-amber-600"><AlertTriangle size={20} /></div>
                </div>
            </div>

            {/* Glosarium */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 flex gap-3 items-start shadow-xs">
                <div className="bg-emerald-50 p-2 rounded-xl text-emerald-600 shrink-0"><HelpCircle size={16} /></div>
                <div className="text-xs leading-relaxed text-slate-600">
                    <strong className="font-black text-slate-800 uppercase tracking-wider block mb-1">💡 GLOSARIUM PERBANDINGAN DATA:</strong>
                    <p>
                        • <span className="text-emerald-600 font-bold">Sumber Data Muatan SLS Hasil Pemetaan (Sumber A)</span>: Baseline perkiraan muatan berdasarkan hasil kegiatan pemetaan digital.<br />
                        • <span className="text-amber-600 font-bold">Sumber Data Prelist per SLS (Sumber B)</span>: Alokasi muatan awal yang tercetak pada berkas dokumen prelist.<br />
                        Klik pada baris **Nama Petugas** di tabel kanan untuk memfilter daftar SLS spesifik milik petugas tersebut.
                    </p>
                </div>
            </div>

            {/* ROW AGREGASI MAKRO & INTERAKTIF PETUGAS */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* KLASTER WILAYAH KECAMATAN */}
                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-4 lg:col-span-1">
                    <div className="flex items-center gap-2">
                        <BarChart3 size={16} className="text-emerald-600" />
                        <div>
                            <h3 className="font-black text-xs uppercase tracking-wider text-slate-700">Peta Gap per Kecamatan</h3>
                            <p className="text-[10px] text-slate-400 mt-0.5">Terurut berdasarkan Kode BPS Wilayah</p>
                        </div>
                    </div>
                    
                    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                        {cachedAgregasiKecamatan.map((kec) => (
                            <div 
                                key={kec.nmkec}
                                onClick={() => setActiveKecamatanDetail(kec)}
                                className="bg-slate-50 p-3 rounded-xl border border-slate-200/70 hover:border-emerald-500 hover:bg-white transition-all cursor-pointer flex justify-between items-center group shadow-2xs"
                            >
                                <div className="min-w-0 flex-1">
                                    <h4 className="text-xs font-black uppercase text-slate-700 group-hover:text-emerald-600 transition-colors truncate">
                                        Kec. {kec.nmkec}
                                    </h4>
                                    <p className="text-[9px] font-mono text-slate-400 font-bold mt-0.5">KODE KEC: {kec.kdkec}</p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    {kec.redFlags > 0 && (
                                        <span className="text-[9px] font-black bg-red-50 border border-red-200 px-2 py-0.5 rounded text-red-600 font-mono">
                                            {kec.redFlags} RED
                                        </span>
                                    )}
                                    <ChevronRight size={14} className="text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* ANALISIS KESENJANGAN PER PETUGAS */}
                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-4 lg:col-span-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <Users size={16} className="text-emerald-600" />
                            <div>
                                <h3 className="font-black text-xs uppercase tracking-wider text-slate-700">Perbedaan Beban Muatan per Petugas</h3>
                                <p className="text-[10px] text-slate-400 mt-0.5">Klik baris petugas untuk menyaring tabel SLS di bawah</p>
                            </div>
                        </div>
                        {selectedPetugas && (
                            <span className="text-[10px] bg-indigo-50 border border-indigo-200 text-indigo-700 px-2.5 py-1 rounded-lg font-bold uppercase shrink-0">
                                Filter Aktif
                            </span>
                        )}
                    </div>
                    
                    <div className="overflow-x-auto rounded-xl border border-slate-200 max-h-[300px] overflow-y-auto">
                        <table className="w-full text-left border-collapse text-xs">
                            <thead>
                                <tr className="bg-slate-50 text-[10px] font-black uppercase text-slate-500 border-b border-slate-200 sticky top-0 z-10">
                                    <th className="p-2.5 bg-slate-50">Petugas PCL (Nama / Email)</th>
                                    <th className="p-2.5 text-center bg-slate-50">Cakupan SLS</th>
                                    <th className="p-2.5 text-center bg-slate-50">Muatan Pemetaan</th>
                                    <th className="p-2.5 text-center bg-slate-50">Jumlah Prelist</th>
                                    <th className="p-2.5 text-center bg-slate-50">Akumulasi Gap</th>
                                    <th className="p-2.5 text-center bg-slate-50">Critical Flags</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-semibold text-slate-600">
                                {agregasiPetugas.map(p => {
                                    const isTarget = selectedPetugas?.id === p.petugas_id;
                                    return (
                                        <tr 
                                            key={p.petugas_id} 
                                            onClick={() => setSelectedPetugas(isTarget ? null : { id: p.petugas_id, nama: p.nama_petugas })}
                                            className={`cursor-pointer transition-colors ${
                                                isTarget ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'hover:bg-slate-50'
                                            }`}
                                        >
                                            <td className="p-2.5">
                                                <div className={`font-black uppercase ${isTarget ? 'text-white' : 'text-slate-800'}`}>{p.nama_petugas}</div>
                                                <div className={`text-[10px] font-mono mt-0.5 truncate max-w-[180px] ${isTarget ? 'text-indigo-200' : 'text-slate-400'}`}>{p.petugas_id}</div>
                                            </td>
                                            <td className="p-2.5 text-center font-mono">{p.totalSls}</td>
                                            <td className={`p-2.5 text-center font-mono ${isTarget ? 'text-white' : 'text-indigo-600'}`}>{p.totalA}</td>
                                            <td className={`p-2.5 text-center font-mono ${isTarget ? 'text-white' : 'text-amber-600'}`}>{p.totalB}</td>
                                            <td className={`p-2.5 text-center font-mono ${isTarget ? 'text-white' : 'text-red-600'}`}>{p.totalSelisih}</td>
                                            <td className="p-2.5 text-center">
                                                <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                                                    isTarget 
                                                        ? 'bg-indigo-500 text-white font-black' 
                                                        : p.kasusEkstrem > 0 ? 'bg-red-50 text-red-600 border border-red-100 font-black' : 'bg-slate-100 text-slate-400'
                                                }`}>
                                                    {p.kasusEkstrem} SLS
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* 📌 DETAIL TABEL UTAMA SLS */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-4">
                
                {/* FILTER CONTROLLERS */}
                <div className="flex flex-col lg:flex-row gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-4 top-3.5 text-slate-400" size={14} />
                        <input 
                            type="text"
                            placeholder={selectedPetugas ? `Menampilkan SLS milik: ${selectedPetugas.nama}...` : "Cari Kode SLS, Nama Desa, atau Nama Petugas PCL..."}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-11 pr-4 text-xs font-semibold outline-none focus:border-emerald-500 focus:bg-white text-slate-700 transition-all"
                        />
                        {selectedPetugas && (
                            <button 
                                onClick={() => setSelectedPetugas(null)}
                                className="absolute right-3 top-2.5 p-1 bg-slate-200 hover:bg-slate-300 text-slate-600 rounded-lg flex items-center gap-1 text-[10px] font-black uppercase px-2 transition-all z-10"
                            >
                                <X size={10} /> Bersihkan Filter PCL
                            </button>
                        )}
                    </div>
                    
                    <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                        <div className="bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl flex items-center gap-2">
                            <Filter size={12} className="text-slate-400" />
                            <select
                                value={selectedKecamatan}
                                onChange={(e) => setSelectedKecamatan(e.target.value)}
                                className="bg-transparent text-xs font-bold text-slate-600 outline-none cursor-pointer w-full"
                            >
                                <option value="SEMUA">Semua Kecamatan</option>
                                {cachedDaftarKecamatanUnik.map(k => <option key={k} value={k}>Kec. {k}</option>)}
                            </select>
                        </div>

                        <div className="bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl flex items-center gap-2">
                            <AlertCircle size={12} className="text-slate-400" />
                            <select
                                value={selectedRiskLevel}
                                onChange={(e) => setSelectedRiskLevel(e.target.value)}
                                className="bg-transparent text-xs font-bold text-slate-600 outline-none cursor-pointer w-full"
                            >
                                <option value="ALL">Semua Tingkat Gap</option>
                                <option value="RED">🔴 Perbedaan Ekstrem (RED)</option>
                                <option value="AMBER">🟡 Perbedaan Sedang (AMBER)</option>
                                <option value="NORMAL">🟢 Data Sinkron (NORMAL)</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* TAMPILAN MOBILE LIST */}
                <div className="block md:hidden space-y-3">
                    {filteredAndSortedSls.map((sls) => {
                        const isRed = sls.status_risiko === "RED";
                        const isAmber = sls.status_risiko === "AMBER";
                        return (
                            <div 
                                key={sls.idsubsls} 
                                className={`p-4 rounded-xl border transition-all ${
                                    isRed ? 'bg-red-50/30 border-red-200' : isAmber ? 'bg-amber-50/30 border-amber-200' : 'bg-slate-50/50 border-slate-200'
                                }`}
                            >
                                <div className="flex justify-between items-start gap-2">
                                    <div>
                                        <h4 className="text-xs font-black text-slate-800 uppercase">({sls.kdsls}) {sls.nmsls}</h4>
                                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">ID: {sls.idsubsls}</p>
                                    </div>
                                    <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border shrink-0 ${
                                        isRed ? 'bg-red-100 text-red-700 border-red-200' : isAmber ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-emerald-100 text-emerald-700 border-emerald-200'
                                    }`}>
                                        {isRed ? "RED FLAG" : isAmber ? "AMBER FLAG" : "SINKRON"}
                                    </span>
                                </div>
                                
                                <div className="mt-2 text-[10px] text-slate-500 font-bold uppercase">
                                    Desa {sls.nmdesa} ({sls.kddesa}) • Kec. {sls.nmkec} ({sls.kdkec})
                                </div>
                                <div className="text-[10px] text-slate-400 font-bold mt-1">
                                    PCL: <span className="text-slate-700">{sls.nama_petugas}</span>
                                </div>

                                <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-slate-200/60 text-center text-xs font-mono">
                                    <div className="bg-white p-2 rounded-lg border border-slate-200/80">
                                        <span className="text-[8px] text-slate-400 block font-sans font-bold uppercase">Pemetaan</span>
                                        <span className="font-bold text-indigo-600">{sls.sumber_a}</span>
                                    </div>
                                    <div className="bg-white p-2 rounded-lg border border-slate-200/80">
                                        <span className="text-[8px] text-slate-400 block font-sans font-bold uppercase">Prelist</span>
                                        <span className="font-bold text-amber-600">{sls.sumber_b}</span>
                                    </div>
                                </div>
                                <div className="mt-2 flex justify-between items-center text-[10px] bg-white px-3 py-1.5 rounded-lg border border-slate-200/70 font-semibold text-slate-600">
                                    <span>Selisih: <b className="font-bold font-mono text-slate-800">{sls.selisih_absolut}</b></span>
                                    <span>Rasio: <b className="font-bold font-mono text-slate-800">
                                        {sls.rasio_kesenjangan === 999 || !sls.rasio_kesenjangan ? 'KOSONG' : `${Number(sls.rasio_kesenjangan).toFixed(1)}x`}
                                    </b></span>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* TAMPILAN DESKTOP TABLE */}
                <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200 bg-white">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 text-[10px] font-black uppercase text-slate-500 border-b border-slate-200 tracking-wider">
                                <th className="p-3">Kode / Nama SLS</th>
                                <th className="p-3">Wilayah & Petugas PCL</th>
                                <th className="p-3 text-center cursor-pointer select-none hover:bg-slate-100" onClick={() => requestSort('sumber_a')}>
                                    Pemetaan <ArrowUpDown size={10} className="inline ml-1 text-slate-400" />
                                </th>
                                <th className="p-3 text-center cursor-pointer select-none hover:bg-slate-100" onClick={() => requestSort('sumber_b')}>
                                    Prelist <ArrowUpDown size={10} className="inline ml-1 text-slate-400" />
                                </th>
                                <th className="p-3 text-center cursor-pointer select-none hover:bg-slate-100" onClick={() => requestSort('selisih_absolut')}>
                                    Selisih <ArrowUpDown size={10} className="inline ml-1 text-slate-400" />
                                </th>
                                <th className="p-3 text-center cursor-pointer select-none hover:bg-slate-100" onClick={() => requestSort('rasio_kesenjangan')}>
                                    Rasio <ArrowUpDown size={10} className="inline ml-1 text-slate-400" />
                                </th>
                                <th className="p-3">Hasil Evaluasi / Klasifikasi Gap</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-600">
                            {filteredAndSortedSls.map((sls) => {
                                const isRed = sls.status_risiko === "RED";
                                const isAmber = sls.status_risiko === "AMBER";

                                return (
                                    <tr 
                                        key={sls.idsubsls} 
                                        className={`hover:bg-slate-50/80 transition-colors ${
                                            isRed ? 'bg-red-50/20' : isAmber ? 'bg-amber-50/20' : ''
                                        }`}
                                    >
                                        <td className="p-3">
                                            <div className="font-black text-slate-800 uppercase">({sls.kdsls}) {sls.nmsls}</div>
                                            <div className="text-[10px] text-slate-400 font-mono mt-0.5">ID: {sls.idsubsls}</div>
                                        </td>
                                        <td className="p-3 text-[10px] font-bold text-slate-500 uppercase">
                                            <div>Desa: <span className="text-slate-700 font-bold">{sls.nmdesa} ({sls.kddesa})</span></div>
                                            <div className="text-[9px] text-slate-400">Kec: {sls.nmkec} ({sls.kdkec})</div>
                                            <div className="text-[10px] text-emerald-600 font-black mt-1 bg-emerald-50 px-1.5 py-0.5 rounded w-max">
                                                PCL: {sls.nama_petugas}
                                            </div>
                                        </td>
                                        <td className="p-3 text-center font-mono font-bold text-indigo-600 bg-indigo-50/20">{sls.sumber_a}</td>
                                        <td className="p-3 text-center font-mono font-bold text-amber-600 bg-amber-50/20">{sls.sumber_b}</td>
                                        <td className={`p-3 text-center font-mono font-black ${sls.selisih_absolut >= 50 ? 'text-red-600' : 'text-slate-700'}`}>
                                            {sls.selisih_absolut}
                                        </td>
                                        <td className="p-3 text-center font-mono">
                                            <div className={`font-black flex items-center justify-center gap-1 ${isRed ? 'text-red-600' : isAmber ? 'text-amber-600' : 'text-emerald-600'}`}>
                                                {sls.rasio_kesenjangan === 999 || !sls.rasio_kesenjangan ? 'KOSONG' : `${Number(sls.rasio_kesenjangan).toFixed(1)}x`}
                                                {sls.rasio_kesenjangan > 1.5 && sls.rasio_kesenjangan !== 999 ? <TrendingUp size={11} /> : null}
                                            </div>
                                        </td>
                                        <td className="p-3">
                                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border block w-max ${
                                                isRed 
                                                    ? 'bg-red-50 border-red-200 text-red-600' 
                                                    : isAmber 
                                                        ? 'bg-amber-50 border-amber-200 text-amber-600' 
                                                        : 'bg-emerald-50 border-emerald-200 text-emerald-600'
                                            }`}>
                                                {sls.tipeAnomali}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {filteredAndSortedSls.length === 0 && (
                    <div className="text-center p-8 text-slate-400 font-bold uppercase tracking-wider text-xs bg-slate-50 rounded-xl border border-dashed border-slate-200">
                        Tidak Ada Data Ketimpangan Pra-Cetak yang Sesuai Kriteria Filter.
                    </div>
                )}
            </div>

            {/* MODAL DETAIL KECAMATAN */}
            {activeKecamatanDetail && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
                    <div className="bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-md shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
                        <div>
                            <span className="text-[9px] bg-emerald-600 text-white px-2 py-0.5 rounded-full font-black uppercase tracking-wider">
                                Rekonsiliasi Muatan Kecamatan
                            </span>
                            <h3 className="text-base font-black uppercase text-slate-800 mt-1">Kecamatan {activeKecamatanDetail.nmkec}</h3>
                        </div>

                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2.5 font-bold text-xs text-slate-500">
                            <div className="flex justify-between"><span>Total SLS Di Wilayah:</span><span className="font-black text-slate-800 font-mono">{activeKecamatanDetail.totalSls} SLS</span></div>
                            <div className="flex justify-between"><span>Muatan Pemetaan (Sumber A):</span><span className="font-black text-indigo-600 font-mono">{activeKecamatanDetail.totalSumberA} Unit</span></div>
                            <div className="flex justify-between"><span>Muatan Prelist (Sumber B):</span><span className="font-black text-amber-600 font-mono">{activeKecamatanDetail.totalSumberB} Unit</span></div>
                            <div className="flex justify-between border-t border-slate-200 pt-2 text-red-600">
                                <span>SLS dengan selisih besar (RED FLAGS):</span>
                                <span className="font-black font-mono bg-red-50 border border-red-100 px-1.5 rounded">{activeKecamatanDetail.redFlags} SLS</span>
                            </div>
                        </div>

                        <button 
                            onClick={() => setActiveKecamatanDetail(null)}
                            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-black py-2.5 rounded-xl text-xs uppercase tracking-wide transition-all"
                        >
                            Tutup Detail Wilayah
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}