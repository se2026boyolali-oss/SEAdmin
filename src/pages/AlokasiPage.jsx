import { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext'; // <-- Integrasi Auth Terpercaya
import {
    ChevronRight,
    ArrowLeft,
    Users,
    MapPin,
    CheckCircle2,
    Database,
    UserCircle
} from 'lucide-react';

// --- KOMPONEN TABEL KECAMATAN (LEVEL 1) ---
// Perbaikan pada Komponen Tabel Kecamatan (LEVEL 1)
const KecamatanTable = ({ kecamatanSummary, enterKecamatan }) => (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left">
            <thead className="bg-slate-50 border-b">
                <tr>
                    <th className="px-6 py-4 text-sm font-semibold text-slate-600">Nama Kecamatan</th>
                    <th className="px-6 py-4 text-sm font-semibold text-slate-600 text-center">Total SLS</th>
                    <th className="px-6 py-4 text-sm font-semibold text-slate-600 text-center">Ter-alokasi</th>
                    <th className="px-6 py-4 text-sm font-semibold text-slate-600 text-center">Progres</th>
                    <th className="px-6 py-4"></th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                {/* REVISI: Mengubah getKecamatanSummary menjadi kecamatanSummary sesuai hulu datanya */}
                {kecamatanSummary.map((kec) => (
                    <tr
                        key={kec.name}
                        className="hover:bg-slate-50 transition-colors cursor-pointer"
                        onClick={() => enterKecamatan(kec.name)}
                    >
                        <td className="px-6 py-4 font-medium text-slate-800">({kec.code}) {kec.name}</td>
                        <td className="px-6 py-4 text-center text-slate-600">{kec.total}</td>
                        <td className="px-6 py-4 text-center text-emerald-600 font-medium">{kec.allocated}</td>
                        <td className="px-6 py-4">
                            <div className="flex items-center gap-3 justify-center">
                                <div className="w-24 bg-slate-100 h-2 rounded-full overflow-hidden">
                                    <div
                                        className="bg-emerald-500 h-full"
                                        style={{ width: `${kec.total > 0 ? (kec.allocated / kec.total) * 100 : 0}%` }} // Proteksi pembagian 0
                                    ></div>
                                </div>
                                <span className="text-xs font-bold text-slate-500">
                                    {kec.total > 0 ? Math.round((kec.allocated / kec.total) * 100) : 0}%
                                </span>
                            </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                            <ChevronRight size={18} className="text-slate-300 inline" />
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

// --- KOMPONEN UTAMA ---
export default function AlokasiPage() {
    const { user, profile, allowAllocation } = useAuth(); // <-- Mengambil data profil yang login
    const [currentLevel, setCurrentLevel] = useState('kecamatan');
    const [rightPanelMode, setRightPanelMode] = useState('desa');
    const [selectedKec, setSelectedKec] = useState(null);
    const [selectedDesa, setSelectedDesa] = useState(null);
    const [kecamatanSummary, setKecamatanSummary] = useState([]);
    const [desaSummary, setDesaSummary] = useState([]);
    const [pcls, setPcls] = useState([]);
    const [slsList, setSlsList] = useState([]);
    const [selectedSlsIds, setSelectedSlsIds] = useState([]);
    const [loading, setLoading] = useState(false);
    const [tempSelectedPcl, setTempSelectedPcl] = useState("");
    
    const slsContainerRef = useRef(null);

useEffect(() => {
        // Pastikan profile dan role sudah benar-benar termuat
        if (profile) {
            if (profile.role === 'pml' && profile.kecamatan_tugas) {
                const rawKec = profile.kecamatan_tugas;
                
                // Antisipasi super aman: Cek apakah string mengandung spasi untuk memisahkan kode & nama
                let cleanKecName = rawKec;
                if (rawKec.includes(" ")) {
                    cleanKecName = rawKec.substring(rawKec.indexOf(" ") + 1).trim();
                } else {
                    cleanKecName = rawKec.trim();
                }
                
                console.log("PML Login, mengunci ke kecamatan:", cleanKecName);
                
                // Masuk otomatis ke tingkat kecamatan milik PML
                enterKecamatan(cleanKecName);
            } else {
                // Admin atau Pegawai biasa melihat rekap kabupaten seluruhnya
                fetchKecamatanSummary();
            }
        }
    }, [profile]);

    const fetchKecamatanSummary = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase.from('kecamatan_summary').select('*');
            if (error) throw error;
            setKecamatanSummary(data || []);
        } catch (err) {
            console.error(err.message);
        } finally {
            setLoading(false);
        }
    };

    const refreshCurrentData = async () => {
        if (!selectedKec) return;
        const currentPos = slsContainerRef.current ? slsContainerRef.current.scrollTop : 0;

        try {
            const { data: s } = await supabase.from('muatan_sls')
                .select('*')
                .eq('nmkec', selectedKec)
                .order('kddesa', { ascending: true })
                .order('kdsls', { ascending: true });

            setSlsList(s || []);

            const dSummary = s.reduce((acc, curr) => {
                const desaKey = curr.kddesa;
                if (!acc[desaKey]) acc[desaKey] = { code: curr.kddesa, name: curr.nmdesa, total: 0, allocated: 0 };
                acc[desaKey].total += 1;
                if (curr.petugas_id) acc[desaKey].allocated += 1;
                return acc;
            }, {});
            setDesaSummary(Object.values(dSummary));

            // Kembalikan scroll setelah state terupdate
            setTimeout(() => {
                if (slsContainerRef.current) slsContainerRef.current.scrollTop = currentPos;
            }, 0);
        } catch (err) { console.error(err); }
    };

    const enterKecamatan = async (kecName) => {
        setSelectedKec(kecName);
        setLoading(true);
        try {
            const { data: p } = await supabase.from('petugas')
                .select('*')
                .ilike('kecamatan_tugas', `%${kecName}%`)
                .eq('status', 'Diterima');
            setPcls(p || []);

            const { data: s } = await supabase.from('muatan_sls')
                .select('*')
                .eq('nmkec', kecName)
                .order('kddesa', { ascending: true })
                .order('kdsls', { ascending: true });

            const allSls = s || [];
            const dSummary = allSls.reduce((acc, curr) => {
                const desaKey = curr.kddesa;
                if (!acc[desaKey]) acc[desaKey] = { code: curr.kddesa, name: curr.nmdesa, total: 0, allocated: 0 };
                acc[desaKey].total += 1;
                if (curr.petugas_id) acc[desaKey].allocated += 1;
                return acc;
            }, {});

            setDesaSummary(Object.values(dSummary));
            setSlsList(allSls);
            setCurrentLevel('alokasi');
            setRightPanelMode('desa');
        } catch (err) { console.error(err); } finally { setLoading(false); }
    };

const handleBulkAssign = async (pclEmail) => {
        // 1. PROTEKSI SAKELAR GLOBAL: Jika alokasi dikunci Admin, blokir aksi
        if (!allowAllocation) {
            alert("Maaf, pengisian atau perubahan alokasi telah dikunci oleh Admin.");
            return;
        }

        if (selectedSlsIds.length === 0) return;

        if (pclEmail === "" && pclEmail !== null) {
            alert("Pilih petugas terlebih dahulu atau klik Kosongkan");
            return;
        }

        setLoading(true);

        // --- FORMULASI WAKTU UTC+7 (WIB) ---
        // Membuat string waktu lokal Jakarta dengan format ISO tanpa huruf 'Z' di ujungnya
        const sekarangWib = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Jakarta" }).replace(" ", "T");

        try {
          	// Ambil data 'profile' dari useAuth() di atas komponen Anda
          	// const { user, profile, allowAllocation } = useAuth();

            // 2. JALANKAN UPDATE: Sertakan kolom alokasi dan audit trail versi baru
            const { error } = await supabase.from('muatan_sls')
                .update({ 
                    petugas_id: pclEmail,
                    // --- REVISI KOLOM AUDIT ---
                    edited_at: sekarangWib,                            // Jam otomatis +7 (Asia/Jakarta)
                    edited_by: profile?.nama_pengguna || 'Sistem BPS'  // Menyimpan NAMA LENGKAP saja
                })
                .in('idsubsls', selectedSlsIds);

            if (error) throw error;

            // 3. RESET STATE & REFRESH DATA
            setSelectedSlsIds([]);
            setTempSelectedPcl("");
            await refreshCurrentData();

            alert(`Berhasil memperbarui alokasi untuk ${selectedSlsIds.length} SLS.`);

        } catch (err) {
            alert("Gagal: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleExportExcel = () => {
        if (!slsList || slsList.length === 0) {
            alert("Tidak ada data untuk diekspor");
            return;
        }

        try {
            const dataToExport = slsList.map(s => {
                const petugasPpl = pcls.find(p => p.email === s.petugas_id);
                const emailPmlAtasan = petugasPpl ? petugasPpl.id_pml_atasan : "-";

                return {
                    "PROVINSI": String(s.kdprov || '33'),
                    "KABUPATEN/KOTA": String(s.kdkab || '09'),
                    "KECAMATAN": String(s.kdkec || ''),
                    "DESA": String(s.kddesa || ''),
                    "SLS": String(s.kdsls || ''),
                    "SUBSLS": String(s.kdsubsls || '00'),
                    "Email PML": emailPmlAtasan,
                    "Email PPL": s.petugas_id || "-"
                };
            });

            const worksheet = XLSX.utils.json_to_sheet(dataToExport);

            worksheet['!cols'] = [
                { wch: 10 }, { wch: 15 }, { wch: 12 }, { wch: 10 },
                { wch: 10 }, { wch: 10 }, { wch: 30 }, { wch: 30 }
            ];

            const range = XLSX.utils.decode_range(worksheet['!ref']);
            for (let R = range.s.r + 1; R <= range.e.r; ++R) {
                for (let C = 0; C <= 5; ++C) {
                    const cell_ref = XLSX.utils.encode_cell({ c: C, r: R });
                    if (worksheet[cell_ref]) worksheet[cell_ref].t = 's';
                }
            }

            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Data Alokasi");
            XLSX.writeFile(workbook, `Rekap_Alokasi_${selectedKec.replace(/\s+/g, '_')}.xlsx`);

        } catch (error) {
            console.error("Export Error:", error);
            alert("Gagal mengekspor data");
        }
    };

    return (
        <div className="h-full flex flex-col gap-6 relative">
            {!allowAllocation && (
  <div className="bg-rose-50 border-l-4 border-rose-500 p-4 mb-4 rounded-xl text-rose-700 text-sm font-semibold">
    ⚠️ Batas waktu pengisian atau perubahan alokasi Sensus Ekonomi 2026 telah berakhir. Seluruh alokasi wilayah saat ini dikunci oleh Administrator.
  </div>
)}
            <div className="flex justify-between items-end px-2">
                
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Dashboard Alokasi</h1>
                    <p className="text-slate-500">Distribusi beban kerja Sensus Ekonomi 2026</p>
                </div>

                <div className="flex items-center gap-3">
                    {currentLevel === 'alokasi' && (
                        <button
                            onClick={handleExportExcel}
                            className="flex items-center gap-2 bg-emerald-100 text-emerald-700 px-4 py-2 rounded-xl border border-emerald-200 hover:bg-emerald-600 hover:text-white transition-all font-bold text-sm shadow-sm"
                        >
                            <Database size={18} />
                            Export Excel
                        </button>
                    )}

                    {currentLevel === 'kecamatan' && (
                        <div className="bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
                            <Database className="text-indigo-500" size={20} />
                            <div className="text-right">
                                <div className="text-[10px] uppercase font-bold text-slate-400">Total SLS</div>
                                <div className="font-bold text-slate-800">
                                    {kecamatanSummary.reduce((a, b) => a + b.total, 0)}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex-1 min-h-0">
                {loading && <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-50 flex items-center justify-center">Loading...</div>}

                {currentLevel === 'kecamatan' ? (
                    <KecamatanTable
                        getKecamatanSummary={kecamatanSummary}
                        kecamatanSummary={kecamatanSummary}
                        enterKecamatan={enterKecamatan}
                    />
                ) : (
                    <AllocationViewContent
                        slsList={slsList}
                        pcls={pcls}
                        selectedKec={selectedKec}
                        selectedDesa={selectedDesa}
                        setSelectedDesa={setSelectedDesa}
                        rightPanelMode={rightPanelMode}
                        setRightPanelMode={setRightPanelMode}
                        setCurrentLevel={setCurrentLevel}
                        selectedSlsIds={selectedSlsIds}
                        setSelectedSlsIds={setSelectedSlsIds}
                        slsContainerRef={slsContainerRef}
                        desaSummary={desaSummary}
                        userRole={profile?.role} // <-- Mengirim informasi role ke sub-komponen
                    />
                )}
            </div>

{selectedSlsIds.length > 0 && (
    <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white p-4 rounded-2xl shadow-2xl flex items-center gap-6 z-[100] border border-slate-700">
        
        {/* REVISI INDIKATOR: SEKARANG MENAMPILKAN SLS DAN TOTAL MUATAN TERPILIH */}
        <div className="flex items-center gap-4 px-2 border-r border-slate-700">
            {/* Indikator SLS */}
            <div className="text-center min-w-[40px]">
                <span className="text-xl font-bold text-orange-400">{selectedSlsIds.length}</span>
                <span className="text-[10px] block uppercase text-slate-400 font-bold">SLS</span>
            </div>
            
            {/* Indikator Total Muatan Usaha Terpilih */}
            <div className="text-center min-w-[50px] border-l border-slate-800 pl-4">
                <span className="text-xl font-bold text-emerald-400">
                    {slsList
                        .filter(s => selectedSlsIds.includes(s.idsubsls))
                        .reduce((sum, curr) => sum + (curr.perkiraan_jumlah_beban || 0), 0)
                        .toLocaleString('id-ID')}
                </span>
                <span className="text-[10px] block uppercase text-slate-400 font-bold">Muatan</span>
            </div>
        </div>

        {/* 1. SELEKSI PETUGAS (Tambahkan disabled jika alokasi off) */}
{/* 1. SELEKSI PETUGAS (Sudah Terurut Abjad A-Z) */}
<div className="flex flex-col">
    <span className="text-[10px] text-slate-400 mb-1 ml-1">
        {!allowAllocation ? 'Sistem Terkunci:' : 'Realokasi ke:'}
    </span>
    <select
        disabled={!allowAllocation}
        className="bg-slate-800 border-slate-700 text-sm rounded-lg p-2 outline-none w-48 disabled:opacity-40 disabled:cursor-not-allowed"
        value={tempSelectedPcl}
        onChange={(e) => setTempSelectedPcl(e.target.value)}
    >
        <option value="" disabled>Pilih Petugas...</option>
        
        {/* PROSES FILTER & SORTING URUT NAMA PETUGAS */}
        {pcls
            .filter(p => p.posisi_tugas === 'PCL')
            .sort((a, b) => (a.nama_petugas || '').localeCompare(b.nama_petugas || ''))
            .map(p => (
                <option key={p.email} value={p.email}>
                    {p.nama_petugas}
                </option>
            ))
        }
    </select>
</div>

        <div className="flex items-center gap-2">
            {/* 2. TOMBOL UPDATE ALOKASI */}
            <button
                onClick={() => handleBulkAssign(tempSelectedPcl)}
                disabled={!allowAllocation || !tempSelectedPcl || loading}
                className="bg-orange-600 hover:bg-orange-500 px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-lg shadow-orange-900/20"
            >
                {!allowAllocation ? 'Terkunci' : 'Update Alokasi'}
            </button>

            {/* 3. TOMBOL KOSONGKAN */}
            <button
                onClick={() => {
                    if (window.confirm("Kosongkan petugas untuk SLS terpilih?")) {
                        handleBulkAssign(null);
                    }
                }}
                disabled={!allowAllocation || loading}
                className="bg-slate-700 hover:bg-rose-900 px-3 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-40 disabled:hover:bg-slate-700 disabled:cursor-not-allowed"
                title="Hapus Petugas dari SLS ini"
            >
                Kosongkan
            </button>
        </div>

        <button 
            onClick={() => { setSelectedSlsIds([]); setTempSelectedPcl(""); }} 
            className="text-xs text-slate-500 hover:text-white"
        >
            Batal
        </button>
    </div>
)}
        </div>
    );
}

// --- KOMPONEN KONTEN ALOKASI (LEVEL 2 & 3) ---
const AllocationViewContent = ({
    slsList, pcls, selectedKec, selectedDesa, setSelectedDesa,
    rightPanelMode, setRightPanelMode, setCurrentLevel,
    selectedSlsIds, setSelectedSlsIds, slsContainerRef, desaSummary,
    userRole // <-- Menerima properti role
}) => {
    const pclsOnly = pcls.filter(p => p.posisi_tugas === 'PCL');
    const totalBebanKec = slsList.reduce((acc, curr) => acc + (curr.perkiraan_jumlah_beban || 0), 0);
    const bebanIdeal = pclsOnly.length > 0 ? Math.round(totalBebanKec / pclsOnly.length) : 0;

    return (
        <div className="flex flex-col h-full gap-4">
            <div className="flex items-center gap-4 px-2">
                {/* TOMBOL KEMBALI HANYA MUNCUL JIKA USER BUKAN PML */}
                {userRole !== 'pml' ? (
                    <button 
                        onClick={() => setCurrentLevel('kecamatan')} 
                        className="p-2 hover:bg-slate-200 rounded-lg text-slate-600 transition-colors"
                    >
                        <ArrowLeft size={20} />
                    </button>
                ) : (
                    <div className="p-2 bg-indigo-600 text-white rounded-lg shadow-sm">
                        <MapPin size={20} />
                    </div>
                )}
                <div>
                    <h2 className="text-xl font-bold text-slate-800">Kecamatan {selectedKec}</h2>
                    <p className="text-xs text-slate-500">Target Ideal: {bebanIdeal} beban / PCL</p>
                </div>
            </div>

            <div className="flex-1 flex gap-6 overflow-hidden px-2">
                <div className="w-1/3 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col">
                    <div className="p-4 border-b bg-slate-50 rounded-t-xl flex items-center justify-between font-bold text-slate-700">
                        <span className="flex items-center gap-2"><Users size={18} />  Beban Kerja Tim</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-6">
                        {pcls.filter(p => p.posisi_tugas === 'PML').map(pml => {
                            const bawahan = pcls.filter(p => p.posisi_tugas === 'PCL' && p.id_pml_atasan === pml.email);
                            const slsBawahan = slsList.filter(s => bawahan.some(b => b.email === s.petugas_id));
                            const desaPml = [...new Set(slsBawahan.map(s => s.nmdesa))];

                            return (
                                <div key={pml.email} className="space-y-3">
                                    <div className="bg-indigo-50/50 p-3 rounded-lg border border-indigo-100">
                                        <div className="flex items-center gap-2 mb-2">
                                            <UserCircle className="text-indigo-600" size={20} />
                                            <div className="text-sm font-bold text-slate-800 uppercase">{pml.nama_petugas} (PML)</div>
                                        </div>
                                        <div className="flex flex-col gap-1 mb-2">
                                            {desaPml.length > 0 ? (
                                                <div className="flex flex-wrap items-center gap-1">
                                                    <span className="text-[9px] font-bold text-slate-500 uppercase mr-1">
                                                        Desa Tugas :
                                                    </span>
                                                    {desaPml.map((d) => (
                                                        <span
                                                            key={d}
                                                            className="text-[9px] bg-white text-indigo-600 px-1.5 py-0.5 rounded border border-indigo-100 font-bold uppercase shadow-sm"
                                                        >
                                                            {d}
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className="text-[9px] text-slate-400 italic font-medium tracking-tight">
                                                    Belum ada wilayah tugas
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-[10px] text-indigo-500 font-bold uppercase tracking-tighter">
                                            Total SLS : {slsBawahan.length} SLS
                                        </div>
                                    </div>

                                    <div className="pl-4 space-y-2 border-l-2 border-slate-100">
                                        {bawahan.map(pcl => {
                                            const mySls = slsList.filter(s => s.petugas_id === pcl.email);
                                            const workload = mySls.reduce((a, b) => a + (b.perkiraan_jumlah_beban || 0), 0);
                                            const myDesas = [...new Set(mySls.map(s => s.nmdesa))];

                                            const isWarning = workload >= 1.05 * bebanIdeal && workload <= bebanIdeal * 1.15;
                                            const isOver = workload > bebanIdeal * 1.15;

                                            let cardStyle = 'border-slate-100 bg-white';
                                            let progressColor = 'bg-emerald-500';

                                            if (isOver) {
                                                cardStyle = 'border-rose-200 bg-rose-50';
                                                progressColor = 'bg-rose-500';
                                            } else if (isWarning) {
                                                cardStyle = 'border-amber-200 bg-amber-50/60';
                                                progressColor = 'bg-amber-500';
                                            }

                                            const maxBudget = bebanIdeal * 1.2;
                                            const progressPercentage = Math.min((workload / maxBudget) * 100, 100);

                                            return (
                                                <div key={pcl.email} className={`p-3 border rounded-lg transition-all ${cardStyle}`}>
                                                    <div className="flex justify-between items-start mb-1.5">
                                                        <div className="flex flex-col">
                                                            <span className="text-xs font-extrabold text-slate-800 uppercase leading-none mb-1">
                                                                {pcl.nama_petugas}
                                                            </span>
                                                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                                                                {myDesas.length > 0 && (
                                                                    <span className="text-[8px] font-black text-slate-400 uppercase shrink-0">
                                                                        Desa Tugas :
                                                                    </span>
                                                                )}
                                                                <div className="flex flex-wrap gap-1">
                                                                    {myDesas.map((d) => (
                                                                        <span
                                                                            key={d}
                                                                            className="text-[8px] text-slate-600 font-bold uppercase"
                                                                        >
                                                                            {d}{myDesas.length > 1 && d !== myDesas[myDesas.length - 1] ? "," : ""}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="text-right">
                                                            <div className="text-[10px] font-black text-slate-700">Perkiraan Beban Muatan : {workload}</div>
                                                            <div className="text-[8px] text-slate-400 font-bold uppercase leading-none">Jumlah SLS tugas : {mySls.length} SLS</div>
                                                        </div>
                                                    </div>

                                                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                                        <div
                                                            className={`h-full transition-all duration-500 ${progressColor}`}
                                                            style={{ width: `${progressPercentage}%` }}
                                                        ></div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="w-2/3 bg-white rounded-xl border border-slate-200 flex flex-col shadow-sm">
                    {rightPanelMode === 'desa' ? (
                        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 gap-4">
                            {desaSummary.map(desa => {
                                const isFullyAllocated = desa.total === desa.allocated;

                                return (
                                    <div
                                        key={desa.name}
                                        onClick={() => { setSelectedDesa(desa.name); setRightPanelMode('sls'); }}
                                        className={`p-4 border rounded-xl cursor-pointer group transition-all ${isFullyAllocated
                                                ? 'bg-emerald-50/60 border-emerald-200 hover:bg-emerald-100/80'
                                                : 'bg-white border-slate-200 hover:bg-slate-50'
                                            }`}
                                    >
                                        <div className="flex justify-between items-center mb-2 font-bold text-slate-800">
                                            ({desa.code}) {desa.name} <ChevronRight size={16} />
                                        </div>

                                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                                            <div>Total SLS: <span className="font-semibold text-slate-700">{desa.total}</span></div>
                                            <div>Teralokasi: <span className="font-semibold text-slate-700">{desa.allocated}</span></div>

                                            <div className={`border-l pl-4 ${isFullyAllocated ? 'border-emerald-200' : 'border-slate-200'}`}>
                                                Sisa Alokasi: {' '}
                                                <span className={`font-semibold ${isFullyAllocated ? 'text-emerald-700' : 'text-amber-600'}`}>
                                                    {desa.total - desa.allocated} SLS {isFullyAllocated && '(Selesai)'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                   ) : (
    <>
        <div className="p-4 border-b bg-slate-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 font-bold text-slate-700">
            {/* Tombol Kembali & Nama Desa */}
            <button
                onClick={() => setRightPanelMode('desa')}
                className="flex items-center gap-2 hover:text-emerald-600 transition-colors text-left group min-w-0"
            >
                <ArrowLeft size={18} className="shrink-0 group-hover:-translate-x-0.5 transition-transform" />
                <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3 min-w-0">
                    <span className="truncate text-base text-slate-800">{selectedDesa}</span>
                    
                    {/* INDIKATOR TOTAL BEBAN MUATAN DESA */}
<span className="text-[11px] font-bold uppercase tracking-tight text-slate-500 bg-slate-200/50 border border-slate-300/40 px-2.5 py-1 rounded-md shrink-0">
    Total Muatan: {' '}
    <span className="text-slate-800 font-black">
        {slsList
            .filter(s => s.nmdesa === selectedDesa)
            .reduce((acc, curr) => acc + (curr.perkiraan_jumlah_beban || 0), 0)
            .toLocaleString('id-ID')}
    </span>
</span>
                </div>
            </button>

            {/* Statistik Ringkas SLS Bagian Kanan */}
            <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold uppercase tracking-tight shrink-0">
                <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-200/50 rounded-md text-slate-500">
                    <span>Jumlah SLS:</span>
                    <span className="text-slate-800">
                        {slsList.filter(s => s.nmdesa === selectedDesa).length}
                    </span>
                </div>

                <div className="flex items-center gap-1.5 px-2 py-1 bg-rose-50 rounded-md text-rose-400">
                    <span>Belum dialokasi:</span>
                    <span className="text-rose-600">
                        {slsList.filter(s => s.nmdesa === selectedDesa && !s.petugas_id).length}
                    </span>
                </div>
            </div>
        </div>
                            <div ref={slsContainerRef} className="flex-1 overflow-y-auto p-4 space-y-2">
                                {slsList.filter(s => s.nmdesa === selectedDesa).map(sls => {
                                    const isSelected = selectedSlsIds.includes(sls.idsubsls);
                                    const petugas = pcls.find(p => p.email === sls.petugas_id);
                                    const isAllocated = !!sls.petugas_id;

                                    return (
                                        <div
                                            key={sls.idsubsls}
                                            onClick={() => {
                                                setSelectedSlsIds(prev =>
                                                    prev.includes(sls.idsubsls) ? prev.filter(id => id !== sls.idsubsls) : [...prev, sls.idsubsls]
                                                )
                                            }}
                                            className={`p-2 px-4 border rounded-lg flex items-center justify-between transition-all cursor-pointer group mb-1 ${isSelected
                                                    ? 'border-orange-500 bg-orange-50 ring-1 ring-orange-500 z-10'
                                                    : isAllocated
                                                        ? 'bg-emerald-50 border-emerald-100 hover:border-emerald-300'
                                                        : 'bg-white border-slate-200 hover:border-slate-300'
                                                }`}
                                        >
                                            <div className="flex-[0.8] min-w-0 pr-4">
                                                <div className="flex items-center gap-2">
                                                    <span className="w-[50px] text-[10px] font-bold text-slate-400">[{sls.kdsls} {sls.kdsubsls}]</span>
                                                    <span className={`font-bold truncate text-sm ${isAllocated ? 'text-emerald-900' : 'text-slate-700'}`}>
                                                        {sls.nmsls}
                                                    </span>
                                                </div>
                                                <div className="text-[10px] text-slate-500">
                                                    {sls.jumlah_kk} Keluarga | {sls.jumlah_usaha} Usaha
                                                </div>
                                            </div>

                                            <div className="flex-1 px-4 border-l border-slate-200/50">
                                                {isAllocated ? (
                                                    <div className="flex flex-col">
                                                        <span className="text-[9px] font-bold text-emerald-600/70 uppercase tracking-tighter">Petugas PCL</span>
                                                        <div className="font-extrabold text-emerald-800 text-sm uppercase truncate leading-tight">
                                                            {petugas?.nama_petugas || 'Petugas'}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="text-[11px] text-slate-300 italic">Belum ditentukan</div>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-4 ml-2">
                                                <div className="flex flex-col items-end">
                                                    <span className="text-[9px] font-bold text-slate-400 uppercase leading-none mb-1">Perkiraan Muatan</span>
                                                    <div className={`min-w-[40px] text-center py-0.5 rounded px-2 text-sm font-black border ${isSelected ? 'bg-orange-500 border-orange-600 text-white' :
                                                            isAllocated ? 'bg-emerald-600 border-emerald-700 text-white' : 'bg-slate-100 border-slate-200 text-slate-600'
                                                        }`}>
                                                        {sls.perkiraan_jumlah_beban}
                                                    </div>
                                                </div>

                                                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${isSelected
                                                        ? 'bg-orange-500 border-orange-500 scale-110'
                                                        : isAllocated
                                                            ? 'border-emerald-400 bg-emerald-100'
                                                            : 'border-slate-200 bg-white'
                                                    }`}>
                                                    {isSelected && <CheckCircle2 size={14} className="text-white" />}
                                                    {isAllocated && !isSelected && <CheckCircle2 size={12} className="text-emerald-500" />}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};