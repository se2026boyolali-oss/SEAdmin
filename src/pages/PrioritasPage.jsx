import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { 
    ShieldAlert, 
    Layers, 
    CheckCircle2, 
    AlertTriangle, 
    Building2,
    SlidersHorizontal,
    Search,
    Download,
    UserCheck,
    MapPin,
    Radio,
    UserX,
    Filter,
    Activity
} from 'lucide-react';

export default function PrioritasPage() {
    const { profile } = useAuth();
    const [loading, setLoading] = useState(false);
    const [viewMode, setViewMode] = useState('pcl-centric'); 
    
    // State Data Master
    const [auditPetugasList, setAuditPetugasList] = useState([]);
    const [prioritasSlsList, setPrioritasSlsList] = useState([]);
    
    // State Filter & Pencarian
    const [selectedKec, setSelectedKec] = useState("SEMUA");
    const [selectedStatus, setSelectedStatus] = useState("SEMUA"); 
    const [searchQuery, setSearchQuery] = useState("");

    useEffect(() => {
        loadDashboardData();
    }, []);

    const loadDashboardData = async () => {
        setLoading(true);
        try {
            const { data: auditData, error: auditError } = await supabase
                .from('view_audit_prioritas_petugas')
                .select('*');
            if (auditError) throw auditError;
            setAuditPetugasList(auditData || []);

            const { data: slsData, error: slsError } = await supabase
                .from('muatan_sls')
                .select('idsubsls, nmkec, nmdesa, kdsls, kdsubsls, nmsls, petugas_id, target_kk_prioritas, perkiraan_jumlah_beban, realisasi_pencacahan, is_selesai')
                .eq('is_prioritas', true);
            if (slsError) throw slsError;
            setPrioritasSlsList(slsData || []);

        } catch (err) {
            console.error("Gagal memuat mesin audit:", err.message);
            alert("Gagal sinkronisasi data: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    // --- 📊 AGREGASI STATISTIK RINGKASAN ---
    const totalSlsPrioritas = prioritasSlsList.length;
    const teralokasiCount = prioritasSlsList.filter(s => s.petugas_id).length;
    const allocationRate = totalSlsPrioritas > 0 ? Math.round((teralokasiCount / totalSlsPrioritas) * 100) : 0;
    const petugasMelencengCount = auditPetugasList.filter(p => p.sls_lain_dikerjakan > 0 && p.prioritas_terjamah < p.jumlah_sls_prioritas).length;

    // 🎯 LOGIKA PERSENTASE SLS PRIORITAS YANG SUDAH DIKERJAKAN (BAGIAN BARU)
    const totalSlsTerjamah = auditPetugasList.reduce((sum, p) => sum + (p.prioritas_terjamah || 0), 0);
    const prsSlsDikerjakan = totalSlsPrioritas > 0 ? Math.round((totalSlsTerjamah / totalSlsPrioritas) * 100) : 0;

    const listKecamatan = ["SEMUA", ...new Set(prioritasSlsList.map(s => s.nmkec).filter(Boolean))];

    // --- 🛡️ LOGIKA FILTER + URUT DATA ---
    const dapatkanStatusKepatuhan = (p) => {
        if (p.sls_lain_dikerjakan > 0 && p.prioritas_terjamah === 0) return "DIABAIKAN";
        if (p.sls_lain_dikerjakan > 0 && p.prioritas_terjamah > 0 && p.prioritas_terjamah < p.jumlah_sls_prioritas) return "DEVIASI";
        if (p.prioritas_terjamah === p.jumlah_sls_prioritas) return "TAAT";
        return "PROGRES";
    };

// --- 🛡️ LOGIKA FILTER + URUT DATA BERHASIL SINKRON ---

// 1. Filter & Urut Data Petugas PCL (Tab 1)
// --- 🛡️ LOGIKA FILTER + URUT DATA (PERBAIKAN KODE KECAMATAN) ---

// 1. Filter & Urut Data Petugas PCL (Tab 1)
const filteredPetugas = auditPetugasList
    .filter(p => {
        const kecPetugas = p.kecamatan_tugas ? String(p.kecamatan_tugas).toLowerCase() : "";
        const kecSelected = selectedKec ? String(selectedKec).toLowerCase() : "SEMUA";
        
        // 🚀 KUNCI PERBAIKAN: Menggunakan .includes() agar "020 ampel" bisa cocok dengan "ampel"
        const matchesKec = kecSelected === "semua" || kecPetugas.includes(kecSelected) || kecSelected.includes(kecPetugas);
        
        const statusPcl = dapatkanStatusKepatuhan(p);
        const matchesStatus = selectedStatus === "SEMUA" || statusPcl === selectedStatus;
        const matchesSearch = searchQuery === "" || 
            p.nama_petugas.toLowerCase().includes(searchQuery.toLowerCase()) || 
            p.petugas_email.toLowerCase().includes(searchQuery.toLowerCase());
        
        return matchesKec && matchesStatus && matchesSearch;
    })
    .sort((a, b) => (a.kecamatan_tugas || "").localeCompare(b.kecamatan_tugas || ""));

// 2. Filter & Urut Data SLS (Tab 2)
const filteredSls = prioritasSlsList
    .filter(s => {
        const kecSls = s.nmkec ? String(s.nmkec).toLowerCase() : "";
        const kecSelected = selectedKec ? String(selectedKec).toLowerCase() : "SEMUA";
        
        // 🚀 KUNCI PERBAIKAN: Berlaku sama untuk internal data list SLS
        const matchesKec = kecSelected === "semua" || kecSls.includes(kecSelected) || kecSelected.includes(kecSls);
        
        const matchesSearch = searchQuery === "" || 
            s.nmsls.toLowerCase().includes(searchQuery.toLowerCase()) || 
            s.nmdesa.toLowerCase().includes(searchQuery.toLowerCase()) ||
            String(s.petugas_id).toLowerCase().includes(searchQuery.toLowerCase());
            
        return matchesKec && matchesSearch;
    })
    .sort((a, b) => String(a.idsubsls).localeCompare(String(b.idsubsls)));

    const handleExportExcel = () => {
        if (filteredPetugas.length === 0) return alert("Tidak ada data untuk diekspor");
        let csvContent = "\uFEFF"; 
        csvContent += "Nama Petugas PCL,Email Petugas,Kecamatan Tugas,Total Alokasi SLS Prioritas (Beban),Jumlah SLS Prioritas Terjamah,Jumlah SLS Non-Prioritas Dikerjakan (Melenceng),Lokasi Absen Terakhir Petugas,Hasil Status Audit Kepatuhan Lapangan,Nama PML Pengawas\n";
        
        filteredPetugas.forEach(p => {
            const statusTeks = dapatkanStatusKepatuhan(p) === "DIABAIKAN" ? "🚨 DIABAIKAN" :
                               dapatkanStatusKepatuhan(p) === "DEVIASI" ? "⚠️ DEVIASI WILAYAH" :
                               dapatkanStatusKepatuhan(p) === "TAAT" ? "✅ TAAT TARGET" : "🏃 IN PROGRES";
            
            const row = [
                `"${p.nama_petugas}"`, `"${p.petugas_email}"`, `"${p.kecamatan_tugas}"`,
                p.jumlah_sls_prioritas, p.prioritas_terjamah, p.sls_lain_dikerjakan,
                `"${p.sedang_mengerjakan_sls || '-'}"`, `"${statusTeks}"`, `"${p.nama_pml || '-'}"`
            ].join(",");
            csvContent += row + "\n";
        });

        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        link.setAttribute("href", URL.createObjectURL(blob));
        link.setAttribute("download", `AUDIT_KEPATUHAN_PCL_PRIORITAS_${selectedKec}_${selectedStatus}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="h-full flex flex-col gap-6 p-4 md:p-6 bg-slate-50/50 min-h-screen font-sans">
            
            {/* 1. SECTION HEADER VIEW */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-slate-200 pb-5">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                        <ShieldAlert className="text-red-500 animate-pulse" size={28} />
                        Monitoring SLS Prioritas
                    </h1>
                    <p className="text-xs text-slate-500 font-bold mt-1 uppercase tracking-wide">
                        Sensus Ekonomi 2026 • Pengecekan Progres Petugas PCL di Lapangan untuk SLS Prioritas
                    </p>
                </div>
                <div className="flex items-center gap-2 w-full lg:w-auto">
                    <button onClick={handleExportExcel} className="flex-1 lg:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all shadow-sm cursor-pointer">
                        <Download size={14} /> Export Rekap (.CSV)
                    </button>
                    <button onClick={loadDashboardData} className="flex-1 lg:flex-none px-4 py-2.5 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-bold text-slate-700 transition-all shadow-sm cursor-pointer">
                        🔄 Sinkronisasi Log View
                    </button>
                </div>
            </div>

            {/* 2. STATISTIK RINGKASAN WIDGET */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-4">
                    <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl"><Layers size={22} /></div>
                    <div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total SLS Prioritas</div>
                        <div className="text-xl font-black text-slate-800">{totalSlsPrioritas} <span className="text-xs text-slate-400 font-normal">SLS</span></div>
                    </div>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-4">
                    <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl"><CheckCircle2 size={22} /></div>
                    <div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Alokasi Petugas</div>
                        <div className="text-xl font-black text-slate-800">{allocationRate}%</div>
                        <div className="text-[9px] text-slate-400 font-medium">{teralokasiCount} Ter-plot Petugas</div>
                    </div>
                </div>

                {/* 🌟 CARD KE-3: SEKARANG MENAMPILKAN PERSENTASE PROGRESS KERJA SLS PRIORITAS */}
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-4">
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-xl"><Activity size={22} /></div>
                    <div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">SLS Prioritas Dikerjakan</div>
                        <div className="text-xl font-black text-slate-800">{prsSlsDikerjakan}%</div>
                        <div className="text-[9px] text-slate-400 font-medium">{totalSlsTerjamah} dari {totalSlsPrioritas} SLS sudah ada log absen petugas</div>
                    </div>
                </div>

                <div className={`p-4 rounded-2xl border shadow-xs flex items-center gap-4 transition-all ${petugasMelencengCount > 0 ? 'bg-rose-50 border-rose-200' : 'bg-white border-slate-200'}`}>
                    <div className={`p-3 rounded-xl ${petugasMelencengCount > 0 ? 'bg-rose-100 text-rose-600 animate-pulse' : 'bg-slate-100 text-slate-500'}`}><AlertTriangle size={22} /></div>
                    <div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">PCL Mengerjakan Selain SLS Prioritas</div>
                        <div className={`text-xl font-black ${petugasMelencengCount > 0 ? 'text-rose-600' : 'text-slate-800'}`}>{petugasMelencengCount} <span className="text-xs text-slate-400 font-normal">Orang</span></div>
                    </div>
                </div>
            </div>

            {/* 3. CONTROL FILTER & TAB BAR PANEL */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col lg:flex-row gap-4 justify-between items-stretch lg:items-center">
                <div className="bg-slate-100 p-1 rounded-xl flex gap-1 self-start">
                    <button onClick={() => setViewMode('pcl-centric')} className={`px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-1 cursor-pointer ${viewMode === 'pcl-centric' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                        👥 Ringkasan Petugas PCL ({filteredPetugas.length})
                    </button>
                    <button onClick={() => setViewMode('sls-centric')} className={`px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-1 cursor-pointer ${viewMode === 'sls-centric' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                        🗺️ Wilayah SLS Terurut ({filteredSls.length})
                    </button>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                    <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-1.5 bg-slate-50">
                        <SlidersHorizontal size={13} className="text-slate-400" />
                        <select value={selectedKec} onChange={(e) => setSelectedKec(e.target.value)} className="bg-transparent text-xs font-bold text-slate-700 outline-none cursor-pointer">
                            {listKecamatan.map(kec => <option key={kec} value={kec}>{kec === "SEMUA" ? "Semua Kecamatan" : `Kec. ${kec}`}</option>)}
                        </select>
                    </div>

                    {viewMode === 'pcl-centric' && (
                        <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-1.5 bg-slate-50">
                            <Filter size={13} className="text-slate-400" />
                            <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)} className="bg-transparent text-xs font-bold text-slate-700 outline-none cursor-pointer">
                                <option value="SEMUA">Semua Status</option>
                                <option value="DIABAIKAN">🚨 DIABAIKAN</option>
                                <option value="DEVIASI">⚠️ DEVIASI WILAYAH</option>
                                <option value="TAAT">✅ TAAT TARGET</option>
                                <option value="PROGRES">🏃 IN PROGRES</option>
                            </select>
                        </div>
                    )}

                    <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-1.5 bg-white focus-within:border-indigo-500 transition-colors">
                        <Search size={14} className="text-slate-400" />
                        <input type="text" placeholder="Cari nama, email, SLS..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="bg-transparent text-xs outline-none w-full sm:w-56 font-bold text-slate-700" />
                    </div>
                </div>
            </div>

            {/* 4. MAIN DATA SHEET PRESENTATION */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col min-h-[420px] h-[60vh]">
                {loading ? (
                    <div className="p-20 text-center font-bold text-slate-400 text-xs my-auto flex flex-col items-center gap-2 animate-pulse">
                        <Radio className="text-indigo-600 animate-spin" size={24} /> Mengambil Data Absen Lapangan...
                    </div>
                ) : viewMode === 'pcl-centric' ? (
                    
                    /* ================= TAB 1: RINGKASAN PETUGAS PCL ================= */
                    <div className="flex-1 overflow-auto scrollbar-thin">
                        <table className="w-full text-left border-collapse min-w-[1150px]">
                            <thead className="bg-slate-50/90 border-b border-slate-200 sticky top-0 z-10 backdrop-blur-xs">
                                <tr className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                                    <th className="px-6 py-4">Nama Petugas PCL</th>
                                    <th className="px-6 py-4">Kecamatan</th>
                                    <th className="px-6 py-4" style={{ width: '280px' }}>Alokasi SLS Prioritas (Monitoring)</th>
                                    <th className="px-6 py-4">Progress SLS Prioritas</th>
                                    <th className="px-4 py-4 text-center">SLS Lain Dikerjakan</th>
                                    <th className="px-6 py-4">SLS Absen Terakhir (Live)</th>
                                    <th className="px-6 py-4 text-center">Cek Status</th>
                                    <th className="px-6 py-4">Nama Pengawas</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white text-xs">
                                {filteredPetugas.length === 0 ? (
                                    <tr><td colSpan="8" className="text-center py-12 font-medium text-slate-400 italic">Tidak ditemukan data petugas aktif pada filter status ini.</td></tr>
                                ) : filteredPetugas.map(p => {
                                    const statusKunci = dapatkanStatusKepatuhan(p);
                                    const isAbaiTotal = statusKunci === "DIABAIKAN";
                                    const isBercabang = statusKunci === "DEVIASI";
                                    const isTaat = statusKunci === "TAAT";
                                    const pctProgress = p.jumlah_sls_prioritas > 0 ? Math.round((p.prioritas_terjamah / p.jumlah_sls_prioritas) * 100) : 0;

                                    const alokasiSlsPrioritasArray = p.daftar_target_prioritas_spesifik 
                                        ? p.daftar_target_prioritas_spesifik.split(',').map(s => s.trim()) 
                                        : [];

                                    const riwayatKunjunganArray = p.daftar_sls_dikerjakan 
                                        ? p.daftar_sls_dikerjakan.split(',').map(s => s.trim()) 
                                        : [];

                                    return (
                                        <tr key={p.petugas_email} className={`hover:bg-slate-50/50 transition-colors ${isAbaiTotal ? 'bg-rose-50/30' : isBercabang ? 'bg-amber-50/10' : ''}`}>
                                            <td className="px-6 py-4">
                                                <div className="font-extrabold text-slate-800 uppercase">{p.nama_petugas}</div>
                                                <div className="text-[10px] text-slate-400 font-mono font-medium mt-0.5">{p.petugas_email}</div>
                                            </td>
                                            <td className="px-6 py-4 font-bold text-slate-600 uppercase">{p.kecamatan_tugas}</td>
                                            
                                            <td className="px-6 py-4">
                                                <div className="flex flex-wrap gap-1.5 max-w-[280px]">
                                                    {alokasiSlsPrioritasArray.length === 0 ? (
                                                        <span className="text-slate-400 italic text-[11px]">Tidak ada plot prioritas</span>
                                                    ) : (
                                                        alokasiSlsPrioritasArray.map((namaSls, index) => {
                                                            const sudahPernahCheckin = riwayatKunjunganArray.includes(namaSls);
                                                            return (
                                                                <span 
                                                                    key={index} 
                                                                    className={`px-2 py-0.5 rounded-md text-[10px] font-black border transition-all uppercase tracking-wider ${
                                                                        sudahPernahCheckin 
                                                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-300 shadow-3xs' 
                                                                            : 'bg-slate-50 text-slate-500 border-slate-200/80'
                                                                    }`}
                                                                >
                                                                    {sudahPernahCheckin ? '✅ ' : '⚪ '}
                                                                    {namaSls}
                                                                </span>
                                                            );
                                                        })
                                                    )}
                                                </div>
                                            </td>
                                            
                                            <td className="px-6 py-4 min-w-[180px]">
                                                <div className="flex items-center justify-between font-mono font-black text-[10px] text-slate-500 mb-1">
                                                    <span>{p.prioritas_terjamah} / {p.jumlah_sls_prioritas} SLS</span>
                                                    <span>{pctProgress}%</span>
                                                </div>
                                                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200/50">
                                                    <div className={`h-full rounded-full transition-all duration-500 ${pctProgress === 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${pctProgress}%` }}></div>
                                                </div>
                                            </td>
                                            
                                            <td className="px-4 py-4 text-center">
                                                {p.sls_lain_dikerjakan > 0 ? (
                                                    <span className="px-2.5 py-1 bg-red-50 text-red-700 border border-red-200/60 font-black font-mono rounded-xl text-[11px] inline-flex items-center gap-1 shadow-2xs">
                                                        ⚠️ {p.sls_lain_dikerjakan} SLS
                                                    </span>
                                                ) : <span className="text-slate-300 font-bold">-</span>}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-1 font-bold text-slate-700 max-w-[160px] truncate" title={p.sedang_mengerjakan_sls}>
                                                    <MapPin size={12} className={p.sedang_mengerjakan_sls !== '-' ? 'text-indigo-500 animate-bounce' : 'text-slate-300'} />
                                                    {p.sedang_mengerjakan_sls}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                {isAbaiTotal ? (
                                                    <span className="bg-red-600 text-white px-2.5 py-1 rounded-md font-black text-[9px] tracking-wider uppercase block w-full text-center shadow-xs">🚨 DIABAIKAN</span>
                                                ) : isBercabang ? (
                                                    <span className="bg-amber-500 text-white px-2.5 py-1 rounded-md font-black text-[9px] tracking-wider uppercase block w-full text-center shadow-xs">⚠️ DEVIASI WILAYAH</span>
                                                ) : isTaat ? (
                                                    <span className="bg-emerald-600 text-white px-2.5 py-1 rounded-md font-black text-[9px] tracking-wider uppercase block w-full text-center shadow-xs">✅ TAAT TARGET</span>
                                                ) : (
                                                    <span className="bg-blue-500 text-white px-2.5 py-1 rounded-md font-black text-[9px] tracking-wider uppercase block w-full text-center shadow-xs">🏃 IN PROGRES</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 font-extrabold text-slate-500 uppercase">{p.nama_pml}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    
                    /* ================= TAB 2: SEBARAN WILAYAH SLS TERURUT ================= */
                    <div className="flex-1 overflow-auto scrollbar-thin">
                        <table className="w-full text-left border-collapse min-w-[900px]">
                            <thead className="bg-slate-50/90 border-b border-slate-200 sticky top-0 z-10 backdrop-blur-xs">
                                <tr className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                                    <th className="px-6 py-4">Kode Wilayah (BPS)</th>
                                    <th className="px-6 py-4">Kecamatan / Desa</th>
                                    <th className="px-6 py-4">Nama Lingkungan SLS</th>
                                    <th className="px-4 py-4 text-center">Beban Target KK</th>
                                    <th className="px-6 py-4">Petugas Alokasi (PCL)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white text-xs">
                                {filteredSls.length === 0 ? (
                                    <tr><td colSpan="5" className="text-center py-12 font-medium text-slate-400 italic">Tidak ditemukan daftar SLS Prioritas.</td></tr>
                                ) : filteredSls.map(sls => {
                                    const infoPcl = auditPetugasList.find(p => p.petugas_email === sls.petugas_id);

                                    return (
                                        <tr key={sls.idsubsls} className="hover:bg-slate-50/40 transition-colors">
                                            <td className="px-6 py-4 font-mono font-bold text-slate-500 text-sm tracking-tight bg-slate-50/30">
                                                {sls.idsubsls}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="font-extrabold text-slate-800 uppercase">{sls.nmdesa}</div>
                                                <div className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">Kec. {sls.nmkec}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="font-black text-slate-700 flex items-center gap-1.5">
                                                    {sls.nmsls}
                                                    <span className="bg-red-50 text-red-600 border border-red-100 text-[8px] font-black px-1.5 py-0.2 rounded shadow-3xs">PRIORITAS</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-4 text-center font-black text-indigo-600 font-mono text-sm">{sls.target_kk_prioritas || 0} KK</td>
                                            
                                            <td className="px-6 py-4">
                                                {sls.petugas_id ? (
                                                    <div className="flex flex-col">
                                                        <span className="font-black text-slate-800 uppercase flex items-center gap-1"><UserCheck size={12} className="text-emerald-600" /> {infoPcl?.nama_petugas || 'Akun Lapangan'}</span>
                                                        <span className="text-[10px] text-slate-400 font-mono font-medium mt-0.5">{sls.petugas_id}</span>
                                                    </div>
                                                ) : (
                                                    <span className="bg-red-50 text-red-600 border border-red-200 px-3 py-1 rounded-xl font-black text-[10px] inline-flex items-center gap-1 animate-pulse"><UserX size={12}/> KOSONG / BELUM PLOT</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}