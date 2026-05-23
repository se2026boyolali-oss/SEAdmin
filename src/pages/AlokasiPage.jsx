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
        {/* RESPONSIVE: Ditambahkan pembungkus overflow-x-auto agar tabel kecamatan bisa di-swipe horizontal pada layar HP */}
        <div className="w-full overflow-x-auto">
            <table className="w-full text-left min-w-[600px] md:min-w-0">
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

    // 1. Buat key string unik berbasis data profile agar referensinya stabil
    const profileDataKey = profile ? `${profile.role}-${profile.kecamatan_tugas}` : '';

    useEffect(() => {
        // Pastikan profile benar-benar termuat
        if (profile) {
            if (profile.role === 'pml' && profile.kecamatan_tugas) {
                const rawKec = profile.kecamatan_tugas;

                let cleanKecName = rawKec;
                if (rawKec.includes(" ")) {
                    cleanKecName = rawKec.substring(rawKec.indexOf(" ") + 1).trim();
                } else {
                    cleanKecName = rawKec.trim();
                }

                console.log("PML Login, mengunci ke kecamatan:", cleanKecName);
                enterKecamatan(cleanKecName);
            } else {
                // Admin atau Pegawai biasa melihat rekap kabupaten seluruhnya
                fetchKecamatanSummary();
            }
        }
        // 2. Ganti dependensi objek [profile] dengan string primitif [profileDataKey]
    }, [profileDataKey]);

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
                // Menggunakan format and/or dari Supabase:
                .or(`and(status.eq.Diterima,kecamatan_tugas.ilike.%${kecName}%),status.eq.Cadangan`);

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

    const handleGantiPetugas = async (emailLama, emailCadangan, namaLama, namaCadangan, pmlAtasan) => {
        if (!allowAllocation) {
            alert("Sistem terkunci.");
            return;
        }

        const confirmSwap = window.confirm(
            `PERINGATAN: Anda akan mengganti ${namaLama} dengan ${namaCadangan} (Cadangan).\n\nSeluruh beban SLS akan dipindah, dan status ${namaLama} akan dinonaktifkan. Lanjutkan?`
        );

        if (!confirmSwap) return;

        setLoading(true);
        const sekarangWib = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Jakarta" }).replace(" ", "T");

        try {
            // 1. Pindahkan seluruh beban SLS ke petugas baru
            const { error: errSls } = await supabase
                .from('muatan_sls')
                .update({
                    petugas_id: emailCadangan,
                    edited_at: sekarangWib,
                    edited_by: profile?.nama_pengguna || 'Sistem BPS (Swap)'
                })
                .eq('petugas_id', emailLama);
            if (errSls) throw errSls;

            // 2. Aktifkan petugas Cadangan (Menjadi PCL Diterima & masuk tim PML)
            const { error: errCadangan } = await supabase
                .from('petugas')
                .update({
                    status: 'Diterima',
                    posisi_tugas: 'PCL',
                    id_pml_atasan: pmlAtasan || '-',

                    // 👇 TAMBAHKAN BARIS INI AGAR PETUGAS TIDAK GAIB SAAT DI-REFRESH
                    kecamatan_tugas: selectedKec
                })
                .eq('email', emailCadangan);
            if (errCadangan) throw errCadangan;

            // 3. Nonaktifkan petugas Lama
            const { error: errLama } = await supabase
                .from('petugas')
                .update({
                    status: 'Mundur', // Atau 'Diganti', sesuaikan dengan master status Anda
                    id_pml_atasan: '-'
                })
                .eq('email', emailLama);
            if (errLama) throw errLama;

            alert("Berhasil melakukan pergantian petugas!");

            // Refresh data di layar
            if (selectedKec) await enterKecamatan(selectedKec);

        } catch (err) {
            alert("Gagal melakukan pergantian: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleMovePclToNewPml = async (pclEmail, newPmlEmail, pclName) => {
        setLoading(true); // Tambahkan loading state
        try {
            const { error } = await supabase
                .from('petugas')
                .update({ id_pml_atasan: newPmlEmail })
                .eq('email', pclEmail);

            if (error) throw error;

            alert(`Berhasil memindahkan ${pclName} ke pengawas baru.`);

            // REVISI: Gunakan enterKecamatan untuk memuat ulang SEMUA data (Petugas & SLS)
            if (selectedKec) {
                await enterKecamatan(selectedKec);
            }
        } catch (err) {
            alert("Gagal memindahkan PCL: " + err.message);
        } finally {
            setLoading(false); // Matikan loading
        }
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

    // FORMAT 1 (Tetap seperti kode lama Anda)
    const handleExportExcelFormat1 = () => {
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

            // Paksa kolom 0 sampai 5 (Kode wilayah) menjadi Text ('s')
            const range = XLSX.utils.decode_range(worksheet['!ref']);
            for (let R = range.s.r + 1; R <= range.e.r; ++R) {
                for (let C = 0; C <= 5; ++C) {
                    const cell_ref = XLSX.utils.encode_cell({ c: C, r: R });
                    if (worksheet[cell_ref]) worksheet[cell_ref].t = 's';
                }
            }

            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Data Alokasi");
            XLSX.writeFile(workbook, `Rekap_Alokasi_${selectedKec.replace(/\s+/g, '_')}_Format1.xlsx`);

        } catch (error) {
            console.error("Export Error:", error);
            alert("Gagal mengekspor data");
        }
    };

    // FORMAT 2 (Format Baru dengan Nama/Teks)
    // FORMAT 2 (Sudah Diperbaiki Properti Nama & Relasi PML)
    const handleExportExcelFormat2 = () => {
        if (!slsList || slsList.length === 0) {
            alert("Tidak ada data untuk diekspor");
            return;
        }

        try {
            const dataToExport = slsList.map(s => {
                // 1. Mencari data petugas PPL berdasarkan petugas_id (email)
                const petugasPpl = pcls.find(p => p.email === s.petugas_id);
                // REVISI: Menggunakan properti 'nama_petugas' sesuai isi komponen Anda
                const namaPpl = petugasPpl ? petugasPpl.nama_petugas : "-";

                // 2. Mencari data petugas PML berdasarkan 'id_pml_atasan' yang ada di PPL
                let namaPml = "-";
                if (petugasPpl && petugasPpl.id_pml_atasan && petugasPpl.id_pml_atasan !== "-") {
                    // Cari data PML di array pcls berdasarkan email PML
                    const petugasPml = pcls.find(p => p.email === petugasPpl.id_pml_atasan);
                    namaPml = petugasPml ? petugasPml.nama_petugas : "-";
                }

                return {
                    "kdkec": String(s.kdkec || ''),
                    "nmkec": s.nmkec || '',
                    "kddesa": String(s.kddesa || ''),
                    "nmdesa": s.nmdesa || '',
                    "kdsls": String(s.kdsls || ''),
                    "kdsubsls": String(s.kdsubsls || '00'),
                    "nmsls": s.nmsls || '',
                    "nmppl": namaPpl,
                    "nmpml": namaPml
                };
            });

            const worksheet = XLSX.utils.json_to_sheet(dataToExport);

            // Menyesuaikan lebar kolom untuk Format 2 (9 Kolom)
            worksheet['!cols'] = [
                { wch: 10 }, { wch: 20 }, { wch: 10 }, { wch: 20 },
                { wch: 10 }, { wch: 10 }, { wch: 25 }, { wch: 25 }, { wch: 25 }
            ];

            // Memaksa kolom kode menjadi string agar angka '0' di depan tidak hilang
            const range = XLSX.utils.decode_range(worksheet['!ref']);
            const kodeColumnIndices = [0, 2, 4, 5];

            for (let R = range.s.r + 1; R <= range.e.r; ++R) {
                kodeColumnIndices.forEach(C => {
                    const cell_ref = XLSX.utils.encode_cell({ c: C, r: R });
                    if (worksheet[cell_ref]) worksheet[cell_ref].t = 's';
                });
            }

            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Nama Alokasi");
            XLSX.writeFile(workbook, `Rekap_Nama_Alokasi_${selectedKec.replace(/\s+/g, '_')}_Format2.xlsx`);

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
            
            {/* RESPONSIVE: Diubah dari flex biasa menjadi flex-col sm:flex-row agar judul halaman dan tombol tidak bertumpuk di HP */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 px-2">

                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Dashboard Alokasi</h1>
                    <p className="text-slate-500">Distribusi beban kerja Sensus Ekonomi 2026</p>
                </div>

                {/* RESPONSIVE: flex-wrap ditambahkan agar tombol unduh excel otomatis rapi ke bawah jika dibuka di hp yang layarnya sempit */}
                <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                    {currentLevel === 'alokasi' && (
                        <>
                            {/* Tombol Export Pertama (Format Email / Kode) */}
                            <button
                                onClick={handleExportExcelFormat2}
                                className="w-full sm:w-auto flex items-center justify-center gap-2 bg-emerald-100 text-emerald-700 px-4 py-2 rounded-xl border border-emerald-200 hover:bg-emerald-600 hover:text-white transition-all font-bold text-sm shadow-sm cursor-pointer"
                            >
                                <Database size={18} />
                                Export Alokasi Kecamatan
                            </button>

                            {/* Tombol Export Kedua (Format Nama Wilayah & Petugas) */}
                            <button
                                onClick={handleExportExcelFormat1}
                                className="w-full sm:w-auto flex items-center justify-center gap-2 bg-indigo-100 text-indigo-700 px-4 py-2 rounded-xl border border-indigo-200 hover:bg-indigo-600 hover:text-white transition-all font-bold text-sm shadow-sm cursor-pointer"
                            >
                                <Database size={18} />
                                Export Fasih
                            </button>
                        </>
                    )}

                    {currentLevel === 'kecamatan' && (
                        <div className="bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
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
                {/* RESPONSIVE: Diubah dari absolute menjadi fixed inset-0 agar loading menutupi seluruh layar smartphone dengan sempurna */}
                {loading && <div className="fixed inset-0 bg-white/50 backdrop-blur-sm z-50 flex items-center justify-center font-bold text-slate-600">Loading...</div>}

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
                        userRole={profile?.role}
                        handleMovePclToNewPml={handleMovePclToNewPml}
                        handleGantiPetugas={handleGantiPetugas} // <-- Mengirim informasi role ke sub-komponen
                    />
                )}
            </div>

            {/* RESPONSIVE: Floating bar hitam di bawah diatur menjadi lebar penuh (w-[92vw]) dan flex-col di HP agar tidak gepeng */}
            {selectedSlsIds.length > 0 && (
                <div className="fixed bottom-4 sm:bottom-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white p-3 sm:p-4 rounded-2xl shadow-2xl flex flex-col sm:flex-row items-center gap-4 sm:gap-6 z-[100] border border-slate-700 w-[92vw] sm:w-auto">

                    {/* REVISI INDIKATOR: SEKARANG MENAMPILKAN SLS DAN TOTAL MUATAN TERPILIH */}
                    <div className="flex items-center justify-around sm:justify-start gap-4 px-2 border-b sm:border-b-0 sm:border-r border-slate-700 w-full sm:w-auto pb-2.5 sm:pb-0">
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
                    <div className="flex flex-col w-full sm:w-auto">
                        <span className="text-[10px] text-slate-400 mb-1 ml-1">
                            {!allowAllocation ? 'Sistem Terkunci:' : 'Realokasi ke:'}
                        </span>
                        {/* RESPONSIVE: text-base pada select di HP untuk mencegah browser Safari/Chrome iOS otomatis melakukan zoom-in paksa */}
                        <select
                            disabled={!allowAllocation}
                            className="bg-slate-800 border-slate-700 text-base sm:text-sm rounded-lg p-2 outline-none w-full sm:w-48 disabled:opacity-40 disabled:cursor-not-allowed text-white"
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

                    <div className="flex items-center justify-end gap-2 w-full sm:w-auto">
                        {/* 2. TOMBOL UPDATE ALOKASI */}
                        <button
                            onClick={() => handleBulkAssign(tempSelectedPcl)}
                            disabled={!allowAllocation || !tempSelectedPcl || loading}
                            className="flex-1 sm:flex-none bg-orange-600 hover:bg-orange-500 px-4 py-2.5 sm:py-2 rounded-xl text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-lg shadow-orange-900/20 cursor-pointer"
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
                            className="bg-slate-700 hover:bg-rose-900 px-3 py-2.5 sm:py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-40 disabled:hover:bg-slate-700 disabled:cursor-not-allowed cursor-pointer"
                            title="Hapus Petugas dari SLS ini"
                        >
                            Kosongkan
                        </button>
                    </div>

                    <button
                        onClick={() => { setSelectedSlsIds([]); setTempSelectedPcl(""); }}
                        className="text-xs text-slate-500 hover:text-white py-1 sm:py-0 w-full sm:w-auto text-center cursor-pointer"
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
    userRole, handleMovePclToNewPml, handleGantiPetugas // <-- Menerima properti role
}) => {
    const [swapTarget, setSwapTarget] = useState(null);
    const [searchCadangan, setSearchCadangan] = useState("");
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
                        className="p-2 hover:bg-slate-200 rounded-lg text-slate-600 transition-colors cursor-pointer"
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

            {/* RESPONSIVE: Mengubah pembagian layout utama panel kiri (w-1/3) & panel kanan (w-2/3) menjadi bertumpuk flex-col di HP dan mengaktifkan scroll internal */}
            <div className="flex-1 flex flex-col md:flex-row gap-6 overflow-y-auto md:overflow-hidden px-2">
                
                {/* PANEL TIM BEBAN KERJA: Diberikan min-height di mobile agar isi komponennya tidak terlipat gepeng */}
                <div className="w-full md:w-1/3 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col min-h-[350px] md:min-h-0">
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
                {/* --- CARD PML --- */}
                <div className="bg-indigo-50/60 p-3 rounded-lg border border-indigo-100">
                    <div className="flex items-center gap-2 mb-2">
                        <UserCircle className="text-indigo-600 shrink-0" size={18} />
                        <div className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                            {pml.nama_petugas} (PML)
                        </div>
                    </div>
                    
                    <div className="flex flex-col gap-1.5 mb-2">
                        {desaPml.length > 0 ? (
                            <div className="flex flex-wrap items-center gap-1">
                                <span className="text-[10px] font-semibold text-slate-400 uppercase mr-1">
                                    Desa Tugas :
                                </span>
                                {desaPml.map((d) => (
                                    <span
                                        key={d}
                                        className="text-[10px] bg-white text-indigo-600 px-1.5 py-0.5 rounded border border-indigo-100 font-bold uppercase shadow-sm"
                                    >
                                        {d}
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <span className="text-[10px] text-slate-400 italic font-medium">
                                Belum ada wilayah tugas
                            </span>
                        )}
                    </div>
                    
                    {/* REVISI: Menggabungkan info PCL dan SLS sejajar agar hemat ruang */}
                    <div className="text-[10px] text-indigo-600 font-bold uppercase tracking-wider flex items-center gap-1.5">
                        <span>Mengawasi: {bawahan.length} PCL</span>
                        <span className="text-indigo-300">•</span>
                        <span>Total: {slsBawahan.length} SLS</span>
                    </div>
                </div>

                {/* --- LIST PCL --- */}
                <div className="pl-4 space-y-3 border-l-2 border-slate-200">
                    {bawahan.map(pcl => {
                        const mySls = slsList.filter(s => s.petugas_id === pcl.email);
                        const workload = mySls.reduce((a, b) => a + (b.perkiraan_jumlah_beban || 0), 0);
                        const myDesas = [...new Set(mySls.map(s => s.nmdesa))];

                        const isUnder = workload < 0.85 * bebanIdeal;
                        const isWarning = workload >= 1.1 * bebanIdeal && workload <= bebanIdeal * 1.2;
                        const isOver = workload > bebanIdeal * 1.2;

                        let cardStyle = 'border-slate-100 bg-white shadow-sm';
                        let progressColor = 'bg-emerald-500';
                        
                        let badgeStyle = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                        let statusLabel = 'IDEAL';

                        if (isUnder) {
                            cardStyle = 'border-blue-200 bg-blue-50/50';
                            progressColor = 'bg-blue-500';
                            badgeStyle = 'bg-blue-50 text-blue-700 border-blue-200';
                            statusLabel = 'UNDER';
                        } else if (isOver) {
                            cardStyle = 'border-rose-200 bg-rose-50/50';
                            progressColor = 'bg-rose-500';
                            badgeStyle = 'bg-rose-50 text-rose-700 border-rose-200';
                            statusLabel = 'OVER';
                        } else if (isWarning) {
                            cardStyle = 'border-amber-200 bg-amber-50/50';
                            progressColor = 'bg-amber-500';
                            badgeStyle = 'bg-amber-50 text-amber-700 border-amber-200';
                            statusLabel = 'ABOVE AVERAGE';
                        }

                        const maxBudget = bebanIdeal * 1.3;
                        const progressPercentage = Math.min((workload / maxBudget) * 100, 100);

                        return (
                            <div key={pcl.email} className={`p-3 border rounded-lg transition-all ${cardStyle}`}>
                                {/* Konten Atas */}
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex flex-col gap-1">
                                        {/* Nama & Tombol Ganti */}
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold text-slate-800 uppercase">
                                                {pcl.nama_petugas}
                                            </span>
                                            {userRole !== 'pml' && (
                                                <button
                                                    onClick={() => {
                                                        setSwapTarget(pcl.email);
                                                        if (typeof setSearchCadangan === 'function') setSearchCadangan("");
                                                    }}
                                                    className="px-1 py-0.5 bg-slate-100 hover:bg-amber-100 border border-slate-200 hover:border-amber-300 rounded text-slate-500 transition-colors cursor-pointer text-[9px] font-bold"
                                                    title="Ganti dengan petugas cadangan"
                                                >
                                                    🔁 Ganti Cadangan
                                                </button>
                                            )}
                                        </div>

                                        {/* Daftar Desa Tugas */}
                                        <div className="flex flex-wrap items-center gap-1">
                                            {myDesas.length > 0 && (
                                                <span className="text-[10px] font-medium text-slate-400 uppercase shrink-0">
                                                    Desa Tugas:
                                                </span>
                                            )}
                                            <span className="text-[10px] text-slate-600 font-semibold uppercase">
                                                {myDesas.join(', ')}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Sisi Kanan (Metrik Muatan) */}
                                    <div className="text-right shrink-0">
                                        <div className="text-[11px] font-black text-slate-700">
                                            Perkiraan Beban: {workload}
                                        </div>
                                        <div className="text-[10px] text-slate-400 font-medium uppercase mt-0.5">
                                            {mySls.length} SLS
                                        </div>
                                    </div>
                                </div>

                                {/* Konten Bawah (Pindah PML & Badge Status) */}
                                <div className="flex justify-between items-center mb-1 gap-2">
                                    <div>
                                        {userRole !== 'pml' ? (
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-[10px] font-medium text-slate-400 uppercase">Pindah PML:</span>
                                                <select
                                                    value={pcl.id_pml_atasan || ""}
                                                    onChange={(e) => handleMovePclToNewPml(pcl.email, e.target.value, pcl.nama_petugas)}
                                                    className="text-[10px] bg-white border border-slate-200 rounded px-1.5 py-0.5 font-medium text-slate-700 outline-none w-28 cursor-pointer hover:border-indigo-400"
                                                >
                                                    <option value="" disabled>Pilih Pengawas</option>
                                                    {pcls.filter(p => p.posisi_tugas === 'PML').map(pmlOption => (
                                                        <option key={pmlOption.email} value={pmlOption.email}>
                                                            {pmlOption.nama_petugas}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        ) : (
                                            <div />
                                        )}
                                    </div>

                                    <span className={`text-[8px] font-extrabold tracking-wider px-1.5 py-0.5 rounded border shrink-0 ${badgeStyle}`}>
                                        {statusLabel}
                                    </span>
                                </div>

                                {/* Progress Bar Container dengan penanda Target Ideal yang Elegan */}
                                <div className="relative w-full pt-3 pb-1">
                                    {/* Penanda Batas Beban Ideal */}
                                    <div 
                                        className="absolute top-0 bottom-0 flex flex-col items-center z-10 pointer-events-none"
                                        style={{ left: '76.92%' }}
                                    >
                                        <div className="w-1.5 h-1.5 rounded-full bg-slate-400 ring-2 ring-white mb-0.5" />
                                        <div className="w-[1px] h-full border-l border-dashed border-slate-300/80" />
                                    </div>

                                    {/* Track Progress */}
                                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full transition-all duration-500 ${progressColor}`}
                                            style={{ width: `${progressPercentage}%` }}
                                        ></div>
                                    </div>
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

                {/* PANEL WILAYAH DAFTAR DESA ATAU SLS: Ditambahkan min-height agar proporsional di HP */}
                <div className="w-full md:w-2/3 bg-white rounded-xl border border-slate-200 flex flex-col shadow-sm min-h-[400px] md:min-h-0">
                    {rightPanelMode === 'desa' ? (
                        /* RESPONSIVE: Mengubah boks grid desa menjadi 1 kolom di HP dan tetap 2 kolom di PC (`grid-cols-1 sm:grid-cols-2`) */
                        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                            {/* RESPONSIVE: Header dalam panel SLS disesuaikan menjadi flex-col sm:flex-row agar judul desa tidak memotong badge muatan di HP */}
                            <div className="p-4 border-b bg-slate-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 font-bold text-slate-700">
                                {/* Tombol Kembali & Nama Desa */}
                                <button
                                    onClick={() => setRightPanelMode('desa')}
                                    className="flex items-center gap-2 hover:text-emerald-600 transition-colors text-left group min-w-0 cursor-pointer"
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
                            
                            {/* Baris List SLS */}
                            <div ref={slsContainerRef} className="flex-1 overflow-y-auto p-4 space-y-2">
                                {slsList.filter(s => s.nmdesa === selectedDesa).map(sls => {
                                    const isSelected = selectedSlsIds.includes(sls.idsubsls);
                                    const petugas = pcls.find(p => p.email === sls.petugas_id);
                                    const isAllocated = !!sls.petugas_id;

                                    return (
                                        /* RESPONSIVE: Mengubah susunan dalam baris SLS dari flex baris lurus menjadi membungkus (flex-col sm:flex-row) pada HP agar teks Nama Petugas dan Kode Wilayah tidak berimpitan hancur */
                                        <div
                                            key={sls.idsubsls}
                                            onClick={() => {
                                                setSelectedSlsIds(prev =>
                                                    prev.includes(sls.idsubsls) ? prev.filter(id => id !== sls.idsubsls) : [...prev, sls.idsubsls]
                                                )
                                            }}
                                            className={`p-3 border rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0 transition-all cursor-pointer group mb-1 ${isSelected
                                                ? 'border-orange-500 bg-orange-50 ring-1 ring-orange-500 z-10'
                                                : isAllocated
                                                    ? 'bg-emerald-50 border-emerald-100 hover:border-emerald-300'
                                                    : 'bg-white border-slate-200 hover:border-slate-300'
                                                }`}
                                        >
                                            <div className="w-full sm:flex-[0.8] min-w-0 sm:pr-4">
                                                <div className="flex items-center gap-2">
                                                    <span className="w-[50px] text-[10px] font-bold text-slate-400 shrink-0">[{sls.kdsls} {sls.kdsubsls}]</span>
                                                    <span className={`font-bold truncate text-sm ${isAllocated ? 'text-emerald-900' : 'text-slate-700'}`}>
                                                        {sls.nmsls}
                                                    </span>
                                                </div>
                                                <div className="text-[10px] text-slate-500 pl-0 sm:pl-[58px]">
                                                    {sls.jumlah_kk} Keluarga | {sls.jumlah_usaha} Usaha
                                                </div>
                                            </div>

                                            <div className="w-full sm:flex-1 px-0 sm:px-4 border-l-0 sm:border-l border-slate-200/50 pt-1 sm:pt-0">
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

                                            <div className="flex items-center justify-between sm:justify-end gap-4 ml-0 sm:ml-2 w-full sm:w-auto border-t sm:border-t-0 border-slate-100 pt-2 sm:pt-0">
                                                <div className="flex flex-col items-start sm:items-end">
                                                    <span className="text-[9px] font-bold text-slate-400 uppercase leading-none mb-1">Perkiraan Muatan</span>
                                                    <div className={`min-w-[40px] text-center py-0.5 rounded px-2 text-sm font-black border ${isSelected ? 'bg-orange-500 border-orange-600 text-white' :
                                                        isAllocated ? 'bg-emerald-600 border-emerald-700 text-white' : 'bg-slate-100 border-slate-200 text-slate-600'
                                                        }`}>
                                                        {sls.perkiraan_jumlah_beban}
                                                    </div>
                                                </div>

                                                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all shrink-0 ${isSelected
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
            {/* ------------------------------------------------------------- */}
            {/* MODAL PENCARIAN PETUGAS CADANGAN */}
            {/* ------------------------------------------------------------- */}
            {swapTarget && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[85vh] overflow-hidden transform transition-all">

                        {/* Modal Header */}
                        <div className="p-4 border-b flex justify-between items-center bg-amber-50">
                            <div>
                                <h3 className="font-bold text-amber-800">Pilih Petugas Cadangan</h3>
                                <p className="text-[10px] text-amber-600 mt-0.5">
                                    Mengganti PCL aktif: <span className="font-black uppercase">{pcls.find(p => p.email === swapTarget)?.nama_petugas}</span>
                                </p>
                            </div>
                            <button
                                onClick={() => setSwapTarget(null)}
                                className="text-amber-700 hover:bg-amber-200 w-8 h-8 rounded-lg flex items-center justify-center font-bold transition-colors cursor-pointer"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Search Bar */}
                        <div className="p-4 border-b bg-slate-50">
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
                                <input
                                    type="text"
                                    placeholder="Ketik nama cadangan..."
                                    value={searchCadangan}
                                    onChange={(e) => setSearchCadangan(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-xl text-base sm:text-sm font-medium focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 transition-all shadow-sm"
                                    autoFocus
                                />
                            </div>
                        </div>

                        {/* List Cadangan dengan Filter */}
                        <div className="flex-1 overflow-y-auto p-2 space-y-1 bg-slate-50/50">
                            {pcls
                                .filter(p => p.status && p.status.toLowerCase() === 'cadangan')
                                .filter(p => p.nama_petugas && p.nama_petugas.toLowerCase().includes(searchCadangan.toLowerCase()))
                                .map(cadangan => (
                                    <div key={cadangan.email} className="flex justify-between items-center p-3 bg-white hover:bg-amber-50 border border-slate-100 hover:border-amber-200 rounded-xl transition-all shadow-sm group gap-2">
                                        {/* List Cadangan dengan Filter (Bagian dalam map) */}
                                        <div className="flex flex-col min-w-0 pr-4">
                                            <span className="font-bold text-slate-800 text-xs uppercase truncate">{cadangan.nama_petugas}</span>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-[10px] text-slate-500 truncate">{cadangan.email}</span>

                                                {/* --- TAMBAHAN BADGE KECAMATAN --- */}
                                                <span className="text-[9px] font-bold px-1.5 py-0.5 bg-slate-200/70 text-slate-600 rounded border border-slate-300 shrink-0">
                                                    📍 Kec: {cadangan.kecamatan_tugas || 'Belum Ditugaskan'}
                                                </span>
                                                {/* ------------------------------- */}

                                            </div>
                                        </div>
                                        <button
                                            onClick={() => {
                                                const pclLama = pcls.find(p => p.email === swapTarget);
                                                handleGantiPetugas(
                                                    pclLama.email,
                                                    cadangan.email,
                                                    pclLama.nama_petugas,
                                                    cadangan.nama_petugas,
                                                    pclLama.id_pml_atasan
                                                );
                                                setSwapTarget(null); // Tutup Modal setelah eksekusi
                                            }}
                                            className="bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg shadow-sm transition-colors shrink-0 cursor-pointer"
                                        >
                                            Pilih & Ganti
                                        </button>
                                    </div>
                                ))
                            }

                            {/* Kondisi Jika Pencarian Kosong */}
                            {pcls.filter(p => p.status && p.status.toLowerCase() === 'cadangan' && p.nama_petugas?.toLowerCase().includes(searchCadangan.toLowerCase())).length === 0 && (
                                <div className="text-center py-10 flex flex-col items-center">
                                    <span className="text-3xl mb-2">🕵️‍♂️</span>
                                    <span className="text-sm font-bold text-slate-500">Tidak ada cadangan ditemukan</span>
                                    <span className="text-xs text-slate-400">Coba gunakan kata kunci nama yang lain.</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

        </div> // <-- INI ADALAH PENUTUP DARI <div className="flex flex-col h-full gap-4"> (Komponen Utama)
    );
};