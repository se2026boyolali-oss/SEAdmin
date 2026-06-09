import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { 
    ShieldAlert, 
    Users, 
    Layers, 
    ArrowLeft, 
    CheckCircle2, 
    AlertTriangle, 
    Building2,
    SlidersHorizontal
} from 'lucide-react';

export default function PrioritasPage() {
    const { profile } = useAuth();
    const [loading, setLoading] = useState(false);
    const [viewMode, setViewMode] = useState('sls-centric'); // 'sls-centric' atau 'pcl-centric'
    
    // Data Master dari Supabase
    const [prioritasSlsList, setPrioritasSlsList] = useState([]);
    const [pcls, setPcls] = useState([]);
    
    // Filter State
    const [selectedKec, setSelectedKec] = useState("SEMUA");
    const [searchQuery, setSearchQuery] = useState("");

    useEffect(() => {
        fetchPrioritasData();
    }, []);

    const fetchPrioritasData = async () => {
        setLoading(true);
        try {
            // 1. Ambil seluruh data SLS yang ditandai sebagai prioritas
            const { data: slsData, error: slsError } = await supabase
                .from('muatan_sls')
                .select('*')
                .eq('is_prioritas', true)
                .order('nmkec', { ascending: true })
                .order('nmdesa', { ascending: true })
                .order('kdsls', { ascending: true });

            if (slsError) throw slsError;
            setPrioritasSlsList(slsData || []);

            // 2. Ambil master data petugas untuk mapping nama/tim
            const { data: petugasData, error: petugasError } = await supabase
                .from('petugas')
                .select('*');

            if (petugasError) throw petugasError;
            setPcls(petugasData || []);

        } catch (err) {
            console.error("Gagal mengambil data prioritas:", err.message);
            alert("Gagal memuat data monitoring prioritas: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    // --- PROSES LOGIKA ANALISIS (METRIK UTAMA) ---
    const totalSlsPrioritas = prioritasSlsList.length;
    const teralokasiSlsPrioritas = prioritasSlsList.filter(s => s.petugas_id).length;
    const sisaSlsPrioritas = totalSlsPrioritas - teralokasiSlsPrioritas;
    const allocationRate = totalSlsPrioritas > 0 ? Math.round((teralokasiSlsPrioritas / totalSlsPrioritas) * 100) : 0;
    const totalKkPrioritas = prioritasSlsList.reduce((sum, curr) => sum + (curr.target_kk_prioritas || 0), 0);

    // Filter daftar kecamatan unik untuk dropdown filter
    const listKecamatan = ["SEMUA", ...new Set(prioritasSlsList.map(s => s.nmkec))];

    // Filter list SLS berdasarkan pilihan user
    const filteredSls = prioritasSlsList.filter(s => {
        const matchesKec = selectedKec === "SEMUA" || s.nmkec === selectedKec;
        const matchesSearch = s.nmsls.toLowerCase().includes(searchQuery.toLowerCase()) || 
                              s.nmdesa.toLowerCase().includes(searchQuery.toLowerCase()) ||
                              (s.petugas_id && s.petugas_id.toLowerCase().includes(searchQuery.toLowerCase()));
        return matchesKec && matchesSearch;
    });

    // --- LOGIKA UTAMA: HITUNG BEBAN PER PETUGAS (PCL-CENTRIC) ---
    const petugasAnalysis = pcls.filter(p => p.posisi_tugas === 'PCL').map(pcl => {
        // Cari SLS prioritas yang dipegang oleh PCL ini
        const slsPrioritasPcl = prioritasSlsList.filter(s => s.petugas_id === pcl.email);
        const pmlAtasan = pcls.find(p => p.email === pcl.id_pml_atasan);

        return {
            email: pcl.email,
            nama_petugas: pcl.nama_petugas,
            nama_pml: pmlAtasan ? pmlAtasan.nama_petugas : "-",
            kecamatan: pcl.kecamatan_tugas || "-",
            jumlah_sls_prioritas: slsPrioritasPcl.length,
            total_kk_prioritas: slsPrioritasPcl.reduce((sum, curr) => sum + (curr.target_kk_prioritas || 0), 0),
            total_muatan_usaha: slsPrioritasPcl.reduce((sum, curr) => sum + (curr.perkiraan_jumlah_beban || 0), 0),
            detail_sls: slsPrioritasPcl
        };
    })
    // Hanya tampilkan petugas yang mengemban minimal 1 SLS prioritas
    .filter(p => p.jumlah_sls_prioritas > 0)
    // Urutkan dari beban SLS prioritas terbanyak ke terdikit
    .sort((a, b) => b.jumlah_sls_prioritas - a.jumlah_sls_prioritas);

    // Hitung berapa banyak petugas yang mengalami konsentrasi beban berlebih (> 2 SLS Prioritas)
    const petugasOverloadedCount = petugasAnalysis.filter(p => p.jumlah_sls_prioritas > 2).length;

    return (
        <div className="h-full flex flex-col gap-6 p-4 md:p-6 bg-slate-50/50 min-h-screen">
            
            {/* 1. HEADER HALAMAN */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                        <ShieldAlert className="text-amber-500" size={32} />
                        Monitoring SLS Prioritas
                    </h1>
                    <p className="text-sm text-slate-500 font-medium">
                        Manajemen sebaran beban kerja SLS Prioritas Sensus Ekonomi 2026
                    </p>
                </div>
                <button 
                    onClick={fetchPrioritasData}
                    className="px-4 py-2 bg-white border border-slate-200 hover:border-indigo-300 rounded-xl text-xs font-bold text-slate-700 transition-all shadow-sm cursor-pointer"
                >
                    🔄 Refresh Data
                </button>
            </div>

            {/* 2. PANEL WIDGET RINGKASAN DATA (METRICS CARD) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Card 1: Total SLS */}
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl"><Layers size={24} /></div>
                    <div>
                        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total SLS Prioritas</div>
                        <div className="text-2xl font-black text-slate-800">{totalSlsPrioritas} <span className="text-xs text-slate-400 font-normal">SLS</span></div>
                    </div>
                </div>

                {/* Card 2: Progres Alokasi */}
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl"><CheckCircle2 size={24} /></div>
                    <div className="w-full">
                        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Teralokasi</div>
                        <div className="text-2xl font-black text-slate-800">{allocationRate}%</div>
                        <div className="text-[10px] text-slate-400 mt-0.5 font-medium">{teralokasiSlsPrioritas} dari {totalSlsPrioritas} wilayah</div>
                    </div>
                </div>

                {/* Card 3: Target KK Prioritas */}
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-amber-50 text-amber-600 rounded-xl"><Building2 size={24} /></div>
                    <div>
                        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Target KK</div>
                        <div className="text-2xl font-black text-slate-800">{totalKkPrioritas.toLocaleString('id-ID')}</div>
                        <div className="text-[10px] text-slate-400 font-medium">Keluarga harus selesai awal</div>
                    </div>
                </div>

                {/* Card 4: Peringatan Penumpukan */}
                <div className={`p-4 rounded-2xl border shadow-sm flex items-center gap-4 transition-all ${
                    petugasOverloadedCount > 0 ? 'bg-rose-50/50 border-rose-200' : 'bg-white border-slate-200'
                }`}>
                    <div className={`p-3 rounded-xl ${petugasOverloadedCount > 0 ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-600'}`}>
                        <AlertTriangle size={24} />
                    </div>
                    <div>
                        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Petugas Overloaded</div>
                        <div className={`text-2xl font-black ${petugasOverloadedCount > 0 ? 'text-rose-600' : 'text-slate-800'}`}>
                            {petugasOverloadedCount} <span className="text-xs text-slate-400 font-normal">PCL</span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-medium">Memegang &gt; 2 SLS Prioritas</div>
                    </div>
                </div>
            </div>

            {/* 3. BAR FILTER & KONTROL VIEW TAB */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
                {/* Switcher Tab View */}
                <div className="bg-slate-100 p-1 rounded-xl flex gap-1 self-start">
                    <button
                        onClick={() => setViewMode('sls-centric')}
                        className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            viewMode === 'sls-centric' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                        }`}
                    >
                        🗺️ Tampilan SLS ({filteredSls.length})
                    </button>
                    <button
                        onClick={() => setViewMode('pcl-centric')}
                        className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            viewMode === 'pcl-centric' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                        }`}
                    >
                        👥 Sebaran Petugas ({petugasAnalysis.length})
                    </button>
                </div>

                {/* Input Filter Kontrol */}
                <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                    <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-1.5 bg-slate-50">
                        <SlidersHorizontal size={14} className="text-slate-400" />
                        <select
                            value={selectedKec}
                            onChange={(e) => setSelectedKec(e.target.value)}
                            className="bg-transparent text-xs font-bold text-slate-700 outline-none cursor-pointer"
                        >
                            {listKecamatan.map(kec => (
                                <option key={kec} value={kec}>{kec === "SEMUA" ? "Semua Kecamatan" : kec}</option>
                            ))}
                        </select>
                    </div>

                    <input
                        type="text"
                        placeholder="Cari desa, SLS, atau nama petugas..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="px-4 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 w-full sm:w-60 font-medium"
                    />
                </div>
            </div>

            {/* 4. MAIN LAYOUT DATA DISPLAY */}
{/* 4. MAIN LAYOUT DATA DISPLAY */}
{/* FIX: Ditambahkan flex flex-col h-[calc(100vh-280px)] md:h-[60vh] agar kontainer memiliki tinggi statis yang bisa di-scroll */}
<div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col min-h-[400px] h-[calc(100vh-280px)] md:h-[58vh]">
    
    {loading ? (
        <div className="p-20 text-center font-bold text-slate-500 my-auto">Memproses Data Analisis Wilayah...</div>
    ) : viewMode === 'sls-centric' ? (
        
        /* TAMPILAN GRID A: SUDUT PANDANG SLS (FIXED SCROLL) */
        /* FIX: Ditambahkan flex-1 overflow-y-auto agar isi tabel bisa di-scroll lancar tanpa merusak layout header halaman */
        <div className="flex-1 overflow-auto">
            <table className="w-full text-left border-collapse min-w-[900px]">
                <thead className="bg-slate-50/90 border-b border-slate-200 sticky top-0 z-10 backdrop-blur-sm">
                    <tr>
                        <th className="px-6 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Wilayah Tugas</th>
                        <th className="px-6 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Kode SLS</th>
                        <th className="px-6 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Nama SLS</th>
                        <th className="px-6 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Target KK Prioritas</th>
                        <th className="px-6 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Perkiraan Muatan</th>
                        <th className="px-6 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Petugas Alokasi (PCL)</th>
                        <th className="px-6 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Pengawas (PML)</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredSls.length === 0 ? (
                        <tr>
                            <td colSpan="7" className="text-center py-10 font-medium text-slate-400 italic">Tidak ditemukan daftar SLS prioritas yang cocok.</td>
                        </tr>
                    ) : filteredSls.map(sls => {
                        const petugasPcl = pcls.find(p => p.email === sls.petugas_id);
                        const petugasPml = petugasPcl ? pcls.find(p => p.email === petugasPcl.id_pml_atasan) : null;

                        return (
                            <tr key={sls.idsubsls} className="hover:bg-slate-50/60 transition-colors">
                                <td className="px-6 py-4">
                                    <div className="text-sm font-bold text-slate-800">{sls.nmdesa}</div>
                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{sls.nmkec}</div>
                                </td>
                                <td className="px-6 py-4 font-mono text-xs text-slate-600 font-bold">
                                    [{sls.kdsls} {sls.kdsubsls}]
                                </td>
                                <td className="px-6 py-4">
                                    <div className="text-sm font-extrabold text-slate-700 flex items-center gap-1.5">
                                        {sls.nmsls}
                                        <span className="text-[9px] bg-amber-100 text-amber-800 border border-amber-200 px-1.5 py-0.2 rounded-md font-black">PRIORITAS</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <span className="text-sm font-black text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-xl border border-indigo-100">
                                        {sls.target_kk_prioritas || 0} KK
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <span className="text-sm font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                        {sls.perkiraan_jumlah_beban || 0}
                                    </span>
                                </td>
                                <td className="px-6 py-4">
                                    {sls.petugas_id ? (
                                        <div className="flex flex-col">
                                            <span className="text-sm font-black text-emerald-800 uppercase leading-none mb-1">{petugasPcl?.nama_petugas}</span>
                                            <span className="text-[10px] text-slate-400 font-medium">{sls.petugas_id}</span>
                                        </div>
                                    ) : (
                                        <span className="text-xs bg-rose-50 text-rose-600 border border-rose-200 px-2 py-1 rounded-lg font-bold animate-pulse inline-block">
                                            ⚠️ Belum Ada Petugas
                                        </span>
                                    )}
                                </td>
                                <td className="px-6 py-4">
                                    <span className="text-sm font-bold text-slate-700 uppercase">
                                        {petGrid(petugasPml)}
                                    </span>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    ) : (
        
        /* TAMPILAN GRID B: SUDUT PANDANG SEBARAN PETUGAS (FIXED SCROLL) */
        /* FIX: Ditambahkan flex-1 overflow-y-auto agar isi tabel sebaran petugas juga bisa di-scroll mandiri */
        <div className="flex-1 overflow-auto">
            <table className="w-full text-left border-collapse min-w-[900px]">
                <thead className="bg-slate-50/80 border-b border-slate-200 sticky top-0 z-10 backdrop-blur-sm">
                    <tr>
                        <th className="px-6 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Nama Petugas PCL</th>
                        <th className="px-6 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Kecamatan Tugas</th>
                        <th className="px-6 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Jumlah SLS Prioritas</th>
                        <th className="px-6 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Total KK Prioritas</th>
                        <th className="px-6 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Total Perkiraan Muatan</th>
                        <th className="px-6 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Status Risiko</th>
                        <th className="px-6 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">PML Pengawas</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                    {petugasAnalysis.length === 0 ? (
                        <tr>
                            <td colSpan="7" className="text-center py-10 font-medium text-slate-400 italic">Belum ada petugas yang mengemban SLS prioritas.</td>
                        </tr>
                    ) : petugasAnalysis
                        .filter(p => selectedKec === "SEMUA" || p.kecamatan.toLowerCase().includes(selectedKec.toLowerCase()))
                        .map(pPcl => {
                            const isOver = pPcl.jumlah_sls_prioritas > 2;
                            return (
                                <tr key={pPcl.email} className={`hover:bg-slate-50/60 transition-colors ${isOver ? 'bg-rose-50/20' : ''}`}>
                                    <td className="px-6 py-4">
                                        <div className="text-sm font-black text-slate-800 uppercase">{pPcl.nama_petugas}</div>
                                        <div className="text-[10px] text-slate-400 font-medium">{pPcl.email}</div>
                                    </td>
                                    <td className="px-6 py-4 font-bold text-xs text-slate-600 uppercase">
                                        {pPcl.kecamatan}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <span className={`text-base font-black px-3 py-1 rounded-xl border ${
                                            isOver ? 'bg-rose-100 text-rose-700 border-rose-300' : 'bg-slate-100 text-slate-700 border-slate-200'
                                        }`}>
                                            {pPcl.jumlah_sls_prioritas} SLS
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-center font-bold text-indigo-600 text-sm">
                                        {pPcl.total_kk_prioritas.toLocaleString('id-ID')} KK
                                    </td>
                                    <td className="px-6 py-4 text-center font-black text-slate-700 text-sm">
                                        {pPcl.total_muatan_usaha.toLocaleString('id-ID')}
                                    </td>
                                    <td className="px-6 py-4">
                                        {isOver ? (
                                            <span className="text-[10px] bg-rose-100 text-rose-700 border border-rose-200 px-2 py-0.5 rounded-md font-extrabold flex items-center gap-1 w-fit">
                                                ⚠️ KONSENTRASI TINGGI
                                            </span>
                                        ) : (
                                            <span className="text-[10px] bg-emerald-100 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-md font-extrabold flex items-center gap-1 w-fit">
                                                ✅ DISTRIBUSI IDEAL
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-sm font-extrabold text-slate-600 uppercase">
                                        {pPcl.nama_pml}
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

// Pembantu render teks petugas pengawas
function petGrid(petModel) {
    if(!petModel) return "-";
    return petModel.nama_petugas;
}