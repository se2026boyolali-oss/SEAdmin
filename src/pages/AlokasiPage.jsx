import { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext'; 
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
const KecamatanTable = ({ kecamatanSummary, enterKecamatan, lockedKecamatan }) => (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="w-full overflow-x-auto">
            <table className="w-full text-left min-w-[700px] md:min-w-0">
                <thead className="bg-slate-50 border-b">
                    <tr>
                        <th className="px-6 py-4 text-sm font-semibold text-slate-600">Nama Kecamatan</th>
                        <th className="px-6 py-4 text-sm font-semibold text-slate-600 text-center">Status Akses</th>
                        <th className="px-6 py-4 text-sm font-semibold text-slate-600 text-center">Total SLS</th>
                        <th className="px-6 py-4 text-sm font-semibold text-slate-600 text-center">Ter-alokasi</th>
                        <th className="px-6 py-4 text-sm font-semibold text-slate-600 text-center">Belum</th>
                        <th className="px-6 py-4 text-sm font-semibold text-slate-600 text-center">Progres</th>
                        <th className="px-6 py-4"></th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {kecamatanSummary.map((kec) => {
                        const remaining = kec.total - kec.allocated;
                        const isKecLocked = lockedKecamatan.includes(kec.name.toLowerCase().trim());

                        return (
                            <tr
                                key={kec.name}
                                className="hover:bg-slate-50 transition-colors cursor-pointer"
                                onClick={() => enterKecamatan(kec.name)}
                            >
                                <td className="px-6 py-4 font-medium text-slate-800">({kec.code}) {kec.name}</td>
                                <td className="px-6 py-4 text-center">
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                        isKecLocked ? 'bg-rose-50 text-rose-600 border border-rose-200' : 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                                    }`}>
                                        {isKecLocked ? '🔒 TERKUNCI' : '🔓 TERBUKA'}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-center text-slate-600">{kec.total}</td>
                                <td className="px-6 py-4 text-center text-emerald-600 font-bold">{kec.allocated}</td>
                                <td className={`px-6 py-4 text-center font-bold ${
                                    remaining > 0 ? 'text-rose-600 bg-rose-50/30' : 'text-slate-400'
                                }`}>
                                    {remaining}
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-3 justify-center">
                                        <div className="w-24 bg-slate-100 h-2 rounded-full overflow-hidden">
                                            <div
                                                className="bg-emerald-500 h-full"
                                                style={{ width: `${kec.total > 0 ? (kec.allocated / kec.total) * 100 : 0}%` }}
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
                        );
                    })}
                </tbody>
            </table>
        </div>
    </div>
);

// --- KOMPONEN UTAMA ---
export default function AlokasiPage() {
    const { profile } = useAuth(); 
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

    // STATE KUNCI DINAMIS PER KECAMATAN
    const [lockedKecamatan, setLockedKecamatan] = useState([]);

    const slsContainerRef = useRef(null);
    const profileDataKey = profile ? `${profile.role}-${profile.kecamatan_tugas}` : '';

const fetchLockedKecamatan = async () => {
    try {
        const { data, error } = await supabase
            .from('app_settings')
            .select('value_json')
            .eq('key', 'locked_kecamatan_list')
            .single();
        
        if (!error && data && data.value_json) {
            // Ubah semua list kecamatan dari DB menjadi lowercase agar aman dari bentrok abjad
            const lowercaseKecamatan = data.value_json.map(k => k.toLowerCase().trim());
            setLockedKecamatan(lowercaseKecamatan);
        }
    } catch (err) {
        console.error("Gagal memuat status kunci kecamatan:", err.message);
    }
};

    useEffect(() => {
        fetchLockedKecamatan();
        if (profile) {
            if (profile.role === 'pml' && profile.kecamatan_tugas) {
                const rawKec = profile.kecamatan_tugas;
                let cleanKecName = rawKec.includes(" ") ? rawKec.substring(rawKec.indexOf(" ") + 1).trim() : rawKec.trim();
                setSelectedKec(cleanKecName);
                enterKecamatan(cleanKecName);
            } else {
                fetchKecamatanSummary();
            }
        }
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

            setTimeout(() => {
                if (slsContainerRef.current) slsContainerRef.current.scrollTop = currentPos;
            }, 0);
        } catch (err) { console.error(err); }
    };

    const enterKecamatan = async (kecName) => {
        setSelectedKec(kecName);
        setLoading(true);
        await fetchLockedKecamatan();
        try {
            const { data: p } = await supabase.from('petugas')
                .select('*')
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

    const handleExportWilayahTugas = async () => {
        setLoading(true);
        const toProperCase = (str) => {
            if (!str) return "-";
            return str.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
        };

        try {
            let fullPetugasList = pcls;
            let fullSlsList = slsList;

            if (!fullPetugasList || fullPetugasList.length === 0) {
                const { data: allPetugas, error: errPetugas } = await supabase
                    .from('petugas')
                    .select('*')
                    .in('status', ['Diterima', 'diterima']);
                if (errPetugas) throw errPetugas;
                fullPetugasList = allPetugas || [];
            }

            if (!fullSlsList || fullSlsList.length === 0) {
                const { data: allSls, error: errSls } = await supabase
                    .from('muatan_sls')
                    .select('petugas_id, nmkec, nmdesa');
                if (errSls) throw errSls;
                fullSlsList = allSls || [];
            }

            const dataToExport = fullPetugasList
                .filter(p => p.posisi_tugas === 'PCL' || p.posisi_tugas === 'PML')
                .map(p => {
                    let listDesa = [];
                    if (p.posisi_tugas === 'PCL') {
                        const mySls = fullSlsList.filter(s => s.petugas_id === p.email);
                        listDesa = [...new Set(mySls.map(s => s.nmdesa || ''))].filter(Boolean);
                    } else if (p.posisi_tugas === 'PML') {
                        const bawahanEmails = fullPetugasList.filter(b => b.id_pml_atasan === p.email).map(b => b.email);
                        const teamSls = fullSlsList.filter(s => bawahanEmails.includes(s.petugas_id));
                        listDesa = [...new Set(teamSls.map(s => s.nmdesa || ''))].filter(Boolean);
                    }

                    const listDesaProper = listDesa.map(desa => toProperCase(desa));
                    let desaTugasFormatted = "-";
                    const jmlDesa = listDesaProper.length;

                    if (jmlDesa === 1) {
                        desaTugasFormatted = `Desa ${listDesaProper[0]}`;
                    } else if (jmlDesa === 2) {
                        desaTugasFormatted = `Desa ${listDesaProper[0]} dan Desa ${listDesaProper[1]}`;
                    } else if (jmlDesa > 2) {
                        const desaAwal = listDesaProper.slice(0, -1).map(d => `Desa ${d}`).join(', ');
                        const desaTerakhir = `dan Desa ${listDesaProper[jmlDesa - 1]}`;
                        desaTugasFormatted = `${desaAwal}, ${desaTerakhir}`;
                    }

                    return {
                        "Nama": toProperCase(p.nama_petugas),
                        "Email": p.email || "-",
                        "Kecamatan Tugas": toProperCase(p.kecamatan_tugas),
                        "Posisi": p.posisi_tugas || "-",
                        "Desa Tugas": desaTugasFormatted
                    };
                })
                .sort((a, b) => {
                    const compareKecamatan = a["Kecamatan Tugas"].localeCompare(b["Kecamatan Tugas"]);
                    if (compareKecamatan !== 0) return compareKecamatan;
                    const bobotPosisi = (posisi) => posisi === 'PML' ? 1 : 2;
                    return bobotPosisi(a["Posisi"]) - bobotPosisi(b["Posisi"]);
                });

            const worksheet = XLSX.utils.json_to_sheet(dataToExport);
            worksheet['!cols'] = [{ wch: 25 }, { wch: 30 }, { wch: 25 }, { wch: 12 }, { wch: 55 }];
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Wilayah Tugas");
            XLSX.writeFile(workbook, `Rekap_Wilayah_Tugas_Kabupaten.xlsx`);
        } catch (error) {
            alert("Gagal mengekspor data: " + error.message);
        } finally { setLoading(false); }
    };

    const handleGantiPetugas = async (emailLama, emailCadangan, namaLama, namaCadangan, pmlAtasan) => {
        if (lockedKecamatan.includes(selectedKec)) {
            alert(`Sistem terkunci. Alokasi untuk Kecamatan ${selectedKec} sudah ditutup.`);
            return;
        }

        const confirmSwap = window.confirm(
            `PERINGATAN: Anda akan mengganti ${namaLama} dengan ${namaCadangan} (Cadangan).\n\nSeluruh beban SLS akan dipindah, dan status ${namaLama} akan dinonaktifkan. Lanjutkan?`
        );
        if (!confirmSwap) return;

        setLoading(true);
        const sekarangWib = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Jakarta" }).replace(" ", "T");

        try {
            const { error: errSls } = await supabase
                .from('muatan_sls')
                .update({
                    petugas_id: emailCadangan,
                    edited_at: sekarangWib,
                    edited_by: profile?.nama_pengguna || 'Sistem BPS (Swap)'
                })
                .eq('petugas_id', emailLama);
            if (errSls) throw errSls;

            const { error: errCadangan } = await supabase
                .from('petugas')
                .update({
                    status: 'Diterima',
                    posisi_tugas: 'PCL',
                    id_pml_atasan: pmlAtasan || '-',
                    kecamatan_tugas: selectedKec
                })
                .eq('email', emailCadangan);
            if (errCadangan) throw errCadangan;

            const { error: errLama } = await supabase
                .from('petugas')
                .update({ status: 'Mundur', id_pml_atasan: '-' })
                .eq('email', emailLama);
            if (errLama) throw errLama;

            alert("Berhasil melakukan pergantian petugas!");
            if (selectedKec) await enterKecamatan(selectedKec);
        } catch (err) {
            alert("Gagal melakukan pergantian: " + err.message);
        } finally { setLoading(false); }
    };

    const handleMovePclToNewPml = async (pclEmail, newPmlEmail, pclName) => {
        if (lockedKecamatan.includes(selectedKec)) {
            alert(`Sistem terkunci. Perubahan pengawas PML untuk Kecamatan ${selectedKec} sudah ditutup.`);
            return;
        }
        setLoading(true);
        try {
            const { error } = await supabase
                .from('petugas')
                .update({ id_pml_atasan: newPmlEmail })
                .eq('email', pclEmail);
            if (error) throw error;
            alert(`Berhasil memindahkan ${pclName} ke pengawas baru.`);
            if (selectedKec) await enterKecamatan(selectedKec);
        } catch (err) {
            alert("Gagal memindahkan PCL: " + err.message);
        } finally { setLoading(false); }
    };

    const handleBulkAssign = async (pclEmail) => {
        if (lockedKecamatan.includes(selectedKec)) {
            alert(`Maaf, pengisian atau perubahan alokasi untuk Kecamatan ${selectedKec} telah dikunci oleh Admin.`);
            return;
        }

        if (profile?.role === 'pegawai') {
            const userKec = profile.kecamatan_tugas || "";
            const cleanUserKec = userKec.includes(" ") ? userKec.substring(userKec.indexOf(" ") + 1).trim() : userKec.trim();
            const cleanSelectedKec = selectedKec ? selectedKec.trim() : "";

            if (cleanUserKec !== cleanSelectedKec) {
                alert(`Anda hanya memiliki hak akses alokasi untuk Kecamatan ${userKec}. Di kecamatan lain, Anda hanya bisa memonitor.`);
                return;
            }
        }

        if (selectedSlsIds.length === 0) return;
        if (pclEmail === "" && pclEmail !== null) {
            alert("Pilih petugas terlebih dahulu atau klik Kosongkan");
            return;
        }

        setLoading(true);
        const sekarangWib = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Jakarta" }).replace(" ", "T");

        try {
            const { error } = await supabase.from('muatan_sls')
                .update({
                    petugas_id: pclEmail,
                    edited_at: sekarangWib,
                    edited_by: profile?.nama_pengguna || 'Sistem BPS'
                })
                .in('idsubsls', selectedSlsIds);

            if (error) throw error;
            setSelectedSlsIds([]);
            setTempSelectedPcl("");
            await refreshCurrentData();
            alert(`Berhasil memperbarui alokasi untuk ${selectedSlsIds.length} SLS.`);
        } catch (err) {
            alert("Gagal: " + err.message);
        } finally { setLoading(false); }
    };

    const handleUpdateMuatanSls = async (idSubSls, muatanLama, muatanBaru, alasan, muatanAwalEksis) => {
        if (lockedKecamatan.includes(selectedKec)) {
            alert(`Maaf, perubahan data muatan untuk Kecamatan ${selectedKec} telah dikunci oleh Admin.`);
            return;
        }

        setLoading(true);
        const sekarangWib = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Jakarta" }).replace(" ", "T");
        const nilaiMuatanAwal = muatanAwalEksis !== null ? muatanAwalEksis : muatanLama;

        try {
            const { error } = await supabase
                .from('muatan_sls')
                .update({
                    perkiraan_jumlah_beban: parseInt(muatanBaru, 10),
                    muatan_awal: nilaiMuatanAwal,
                    alasan_perubahan: alasan,
                    edited_at: sekarangWib,
                    edited_by: profile?.nama_pengguna || 'Sistem BPS'
                })
                .eq('idsubsls', idSubSls);

            if (error) throw error;
            alert("Berhasil memperbarui jumlah muatan SLS!");
            await refreshCurrentData();
        } catch (err) {
            alert("Gagal memperbarui muatan: " + err.message);
        } finally { setLoading(false); }
    };

    const handleExportExcelFormat1 = () => {
        if (!slsList || slsList.length === 0) {
            alert("Tidak ada data untuk diekspor");
            return;
        }
        try {
            const dataToExport = slsList.map(s => {
                const petugasPpl = pcls.find(p => p.email === s.petugas_id);
                return {
                    "PROVINSI": String(s.kdprov || '33'),
                    "KABUPATEN/KOTA": String(s.kdkab || '09'),
                    "KECAMATAN": String(s.kdkec || ''),
                    "DESA": String(s.kddesa || ''),
                    "SLS": String(s.kdsls || ''),
                    "SUBSLS": String(s.kdsubsls || '00'),
                    "Email PML": petugasPpl ? petugasPpl.id_pml_atasan : "-",
                    "Email PPL": s.petugas_id || "-"
                };
            });

            const worksheet = XLSX.utils.json_to_sheet(dataToExport);
            worksheet['!cols'] = [{ wch: 10 }, { wch: 15 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 30 }, { wch: 30 }];
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
        } catch (error) { alert("Gagal mengekspor data"); }
    };

    const handleExportExcelFormat2 = () => {
        if (!slsList || slsList.length === 0) {
            alert("Tidak ada data untuk diekspor");
            return;
        }
        try {
            const dataToExport = slsList.map(s => {
                const petugasPpl = pcls.find(p => p.email === s.petugas_id);
                const namaPpl = petugasPpl ? petugasPpl.nama_petugas : "-";
                let namaPml = "-";
                if (petugasPpl && petugasPpl.id_pml_atasan && petugasPpl.id_pml_atasan !== "-") {
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
            worksheet['!cols'] = [{ wch: 10 }, { wch: 20 }, { wch: 10 }, { wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 25 }, { wch: 25 }, { wch: 25 }];
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
        } catch (error) { alert("Gagal mengekspor data"); }
    };

const handleExportExcelKabupaten = async () => {
    setLoading(true);
    try {
        // 1. Ambil semua data petugas se-kabupaten
        const { data: allPetugas, error: errPetugas } = await supabase
            .from('petugas')
            .select('email, nama_petugas, id_pml_atasan, posisi_tugas');
        
        if (errPetugas) throw errPetugas;

        // 2. Ambil semua data SLS se-kabupaten dengan teknik Chunking (mengatasi limit 1000 baris Supabase)
        let allSlsRows = [];
        let from = 0;
        let to = 999;
        let hasMore = true;

        while (hasMore) {
            const { data: chunkData, error: errSls } = await supabase
                .from('muatan_sls')
                .select('idsubsls, kdkec, nmkec, kddesa, nmdesa, kdsls, kdsubsls, nmsls, petugas_id')
                .range(from, to)
                .order('kdkec', { ascending: true })
                .order('kddesa', { ascending: true })
                .order('kdsls', { ascending: true });

            if (errSls) throw errSls;

            if (!chunkData || chunkData.length === 0) {
                hasMore = false;
            } else {
                allSlsRows = [...allSlsRows, ...chunkData];
                from += 1000;
                to += 1000;
            }
        }

        if (allSlsRows.length === 0) {
            alert("Tidak ada data SLS ditemukan di database.");
            return;
        }

        // 3. Mapping data gabungan SLS dan Petugas (PPL & PML)
        const dataToExport = allSlsRows.map(s => {
            const petugasPpl = allPetugas.find(p => p.email === s.petugas_id);
            const emailPpl = s.petugas_id || "-";
            const namaPpl = petugasPpl ? petugasPpl.nama_petugas : "-";
            
            let emailPml = "-";
            let namaPml = "-";
            
            if (petugasPpl && petugasPpl.id_pml_atasan && petugasPpl.id_pml_atasan !== "-") {
                emailPml = petugasPpl.id_pml_atasan;
                const petugasPml = allPetugas.find(p => p.email === emailPml);
                namaPml = petugasPml ? petugasPml.nama_petugas : "-";
            }

            return {
                "Kode Kecamatan": String(s.kdkec || ''),
                "Nama Kecamatan": s.nmkec || '',
                "Kode Desa": String(s.kddesa || ''),
                "Nama Desa": s.nmdesa || '',
                "Kode SLS": String(s.kdsls || ''),
                "Kode Sub SLS": String(s.kdsubsls || '00'),
                "Nama SLS": s.nmsls || '',
                "ID Sub SLS": String(s.idsubsls || ''),
                "Email PPL": emailPpl,
                "Nama PPL": namaPpl,
                "Email PML": emailPml,
                "Nama PML": namaPml
            };
        });

        // 4. Generate File Excel
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        
        // Atur lebar kolom agar rapi
        worksheet['!cols'] = [
            { wch: 15 }, { wch: 20 }, { wch: 12 }, { wch: 20 }, 
            { wch: 10 }, { wch: 12 }, { wch: 25 }, { wch: 18 }, 
            { wch: 25 }, { wch: 25 }, { wch: 25 }, { wch: 25 }
        ];
        
        // Pastikan format cell kode berupa TEXT agar angka '0' di depan tidak hilang
        const range = XLSX.utils.decode_range(worksheet['!ref']);
        const textColumnIndices = [0, 2, 4, 5, 7]; // Index kolom kode & ID
        for (let R = range.s.r + 1; R <= range.e.r; ++R) {
            textColumnIndices.forEach(C => {
                const cell_ref = XLSX.utils.encode_cell({ c: C, r: R });
                if (worksheet[cell_ref]) worksheet[cell_ref].t = 's';
            });
        }

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Master Alokasi Kabupaten");
        XLSX.writeFile(workbook, `Rekap_Alokasi_Lengkap_Kabupaten.xlsx`);

    } catch (error) {
        alert("Gagal mengunduh data kabupaten: " + error.message);
    } finally {
        setLoading(false);
    }
};

    // CARI BARIS INI SEBELUM RETURN UTAMA (~Baris 380):
const isCurrentKecamatanLocked = selectedKec && lockedKecamatan.includes(selectedKec.toLowerCase().trim());

    return (
        <div className="h-full flex flex-col gap-6 relative">
            {isCurrentKecamatanLocked && (
                <div className="bg-rose-50 border-l-4 border-rose-500 p-4 mb-2 rounded-xl text-rose-700 text-sm font-semibold animate-pulse">
                    ⚠️ Akses Pengisian Terkunci: Batas waktu alokasi wilayah untuk Kecamatan {selectedKec} telah ditutup oleh Admin BPS Kabupaten.
                </div>
            )}
            
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 px-2">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Dashboard Alokasi</h1>
                    <p className="text-slate-500">Distribusi beban kerja Sensus Ekonomi 2026</p>
                </div>

                <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                    {currentLevel === 'alokasi' && (
                        <>
                            <button
                                onClick={handleExportExcelFormat2}
                                className="w-full sm:w-auto flex items-center justify-center gap-2 bg-emerald-100 text-emerald-700 px-4 py-2 rounded-xl border border-emerald-200 hover:bg-emerald-600 hover:text-white transition-all font-bold text-sm shadow-sm cursor-pointer"
                            >
                                <Database size={18} /> Export Alokasi Kecamatan
                            </button>

                            <button
                                onClick={handleExportExcelFormat1}
                                className="w-full sm:w-auto flex items-center justify-center gap-2 bg-indigo-100 text-indigo-700 px-4 py-2 rounded-xl border border-indigo-200 hover:bg-indigo-600 hover:text-white transition-all font-bold text-sm shadow-sm cursor-pointer"
                            >
                                <Database size={18} /> Export Fasih
                            </button>
                        </>
                    )}

{currentLevel === 'kecamatan' && (
    <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
        
        {/* TOMBOL BARU UNTUK 1 KABUPATEN */}
        <button
            onClick={handleExportExcelKabupaten}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl border border-indigo-700 hover:bg-indigo-700 transition-all font-bold text-sm shadow-sm cursor-pointer"
        >
            <Database size={18} /> Export Alokasi 1 Kabupaten
        </button>

        <button
            onClick={handleExportWilayahTugas}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-amber-100 text-amber-700 px-4 py-2 rounded-xl border border-amber-200 hover:bg-amber-600 hover:text-white transition-all font-bold text-sm shadow-sm cursor-pointer"
        >
            <Database size={18} /> Export Wilayah Tugas
        </button>

        <div className="bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
            <Database className="text-indigo-500" size={20} />
            <div className="text-right">
                <div className="text-[10px] uppercase font-bold text-slate-400">Total SLS</div>
                <div className="font-bold text-slate-800">
                    {kecamatanSummary.reduce((a, b) => a + b.total, 0)}
                </div>
            </div>
        </div>
    </div>
)}
                </div>
            </div>

            <div className="flex-1 min-h-0">
                {loading && <div className="fixed inset-0 bg-white/50 backdrop-blur-sm z-50 flex items-center justify-center font-bold text-slate-600">Loading...</div>}

                {currentLevel === 'kecamatan' ? (
                    <KecamatanTable
                        kecamatanSummary={kecamatanSummary}
                        enterKecamatan={enterKecamatan}
                        lockedKecamatan={lockedKecamatan}
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
                        handleGantiPetugas={handleGantiPetugas}
                        profile={profile}
                        handleUpdateMuatanSls={handleUpdateMuatanSls}
                        isKecamatanLocked={isCurrentKecamatanLocked}
                    />
                )}
            </div>

            {/* FLOATING ACTION BOX REALOKASI MASSAL */}
            {selectedSlsIds.length > 0 && (
                <div className="fixed bottom-4 sm:bottom-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white p-3 sm:p-4 rounded-2xl shadow-2xl flex flex-col sm:flex-row items-center gap-4 sm:gap-6 z-[100] border border-slate-700 w-[92vw] sm:w-auto">
                    <div className="flex items-center justify-around sm:justify-start gap-4 px-2 border-b sm:border-b-0 sm:border-r border-slate-700 w-full sm:w-auto pb-2.5 sm:pb-0">
                        <div className="text-center min-w-[40px]">
                            <span className="text-xl font-bold text-orange-400">{selectedSlsIds.length}</span>
                            <span className="text-[10px] block uppercase text-slate-400 font-bold">SLS</span>
                        </div>
                        <div className="text-center min-w-[50px] border-l border-slate-800 pl-4">
                            <span className="text-xl font-bold text-emerald-400">
                                {slsList.filter(s => selectedSlsIds.includes(s.idsubsls)).reduce((sum, curr) => sum + (curr.perkiraan_jumlah_beban || 0), 0).toLocaleString('id-ID')}
                            </span>
                            <span className="text-[10px] block uppercase text-slate-400 font-bold">Muatan</span>
                        </div>
                    </div>

                    <div className="flex flex-col w-full sm:w-auto">
                        <span className="text-[10px] text-slate-400 mb-1 ml-1">
                            {isCurrentKecamatanLocked ? 'Sistem Terkunci:' : 'Realokasi ke:'}
                        </span>
                        <select
                            disabled={isCurrentKecamatanLocked}
                            className="bg-slate-800 border-slate-700 text-base sm:text-sm rounded-lg p-2 outline-none w-full sm:w-48 disabled:opacity-40 disabled:cursor-not-allowed text-white"
                            value={tempSelectedPcl}
                            onChange={(e) => setTempSelectedPcl(e.target.value)}
                        >
                            <option value="" disabled>Pilih Petugas...</option>
                            {pcls
                                .filter(p => p.posisi_tugas === 'PCL')
                                .sort((a, b) => (a.nama_petugas || '').localeCompare(b.nama_petugas || ''))
                                .map(p => (
                                    <option key={p.email} value={p.email}>{p.nama_petugas}</option>
                                ))
                            }
                        </select>
                    </div>

                    <div className="flex items-center justify-end gap-2 w-full sm:w-auto">
                        <button
                            onClick={() => handleBulkAssign(tempSelectedPcl)}
                            disabled={isCurrentKecamatanLocked || !tempSelectedPcl || loading}
                            className="flex-1 sm:flex-none bg-orange-600 hover:bg-orange-500 px-4 py-2.5 sm:py-2 rounded-xl text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-lg cursor-pointer"
                        >
                            {isCurrentKecamatanLocked ? 'Terkunci' : 'Update Alokasi'}
                        </button>

                        <button
                            onClick={() => {
                                if (window.confirm("Kosongkan petugas untuk SLS terpilih?")) {
                                    handleBulkAssign(null);
                                }
                            }}
                            disabled={isCurrentKecamatanLocked || loading}
                            className="bg-slate-700 hover:bg-rose-900 px-3 py-2.5 sm:py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
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
    userRole, handleMovePclToNewPml, handleGantiPetugas,
    profile, handleUpdateMuatanSls, isKecamatanLocked
}) => {
    const [swapTarget, setSwapTarget] = useState(null);
    const [searchCadangan, setSearchCadangan] = useState("");
    const [editMuatanTarget, setEditMuatanTarget] = useState(null);
    const [inputMuatanBaru, setInputMuatanBaru] = useState("");
    const [inputAlasan, setInputAlasan] = useState("");

    const pclsOnly = pcls.filter(p => p.posisi_tugas === 'PCL');
    const totalBebanKec = slsList.reduce((acc, curr) => acc + (curr.perkiraan_jumlah_beban || 0), 0);
    const bebanIdeal = pclsOnly.length > 0 ? Math.round(totalBebanKec / pclsOnly.length) : 0;

    const userKec = profile?.kecamatan_tugas || "";
    const cleanUserKec = userKec.includes(" ") ? userKec.substring(userKec.indexOf(" ") + 1).trim() : userKec.trim();
    const cleanSelectedKec = selectedKec ? selectedKec.trim() : "";

    // Gabungkan aturan role pegawai dan penguncian administrasi per wilayah
    const isReadOnly = (userRole === 'pegawai' && cleanUserKec !== cleanSelectedKec) || isKecamatanLocked;

    return (
        <div className="flex flex-col h-full gap-4">
            <div className="flex items-center gap-4 px-2">
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
                    {isReadOnly && (
                        <span className="inline-block mt-1 text-[10px] bg-amber-50 text-amber-700 font-bold px-2 py-0.5 rounded border border-amber-200">
                            {isKecamatanLocked ? '🔒 MODAL READ-ONLY (Kecamatan Dikunci Admin)' : `👁️ Mode Lihat (Anda Hanya Dapat Mengalokasikan Kecamatan {userKec})`}
                        </span>
                    )}
                </div>
            </div>

            <div className="flex-1 flex flex-col md:flex-row gap-6 overflow-y-auto md:overflow-hidden px-2">
                {/* PANEL TIM BEBAN KERJA */}
           <div className="w-full md:w-1/3 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col min-h-[350px] md:min-h-0">
                    <div className="p-4 border-b bg-slate-50 rounded-t-xl flex items-center justify-between font-bold text-slate-700">
                        <span className="flex items-center gap-2"><Users size={18} />  Beban Kerja Tim</span>
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
                                                    <div className="flex justify-between items-start mb-2">
                                                        <div className="flex flex-col gap-1">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-xs font-bold text-slate-800 uppercase">
                                                                    {pcl.nama_petugas}
                                                                </span>
                                                                {/* Sembunyikan tombol ganti cadangan jika dalam mode read-only pegawai */}
                                                                {userRole !== 'pml' && !isReadOnly && (
                                                                    <button
                                                                        onClick={() => {
                                                                            setSwapTarget(pcl.email);
                                                                            setSearchCadangan("");
                                                                        }}
                                                                        className="px-1 py-0.5 bg-slate-100 hover:bg-amber-100 border border-slate-200 hover:border-amber-300 rounded text-slate-500 transition-colors cursor-pointer text-[9px] font-bold"
                                                                        title="Ganti dengan petugas cadangan"
                                                                    >
                                                                        🔁 Ganti Cadangan
                                                                    </button>
                                                                )}
                                                            </div>

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

                                                        <div className="text-right shrink-0">
                                                            <div className="text-[11px] font-black text-slate-700">
                                                                Perkiraan Beban: {workload}
                                                            </div>
                                                            <div className="text-[10px] text-slate-400 font-medium uppercase mt-0.5">
                                                                {mySls.length} SLS
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="flex justify-between items-center mb-1 gap-2">
                                                        <div>
                                                            {/* Matikan selection pindah PML jika dalam keadaan read-only */}
                                                            {userRole !== 'pml' && !isReadOnly ? (
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

                                                    <div className="relative w-full pt-3 pb-1">
                                                        <div 
                                                            className="absolute top-0 bottom-0 flex flex-col items-center z-10 pointer-events-none"
                                                            style={{ left: '76.92%' }}
                                                        >
                                                            <div className="w-1.5 h-1.5 rounded-full bg-slate-400 ring-2 ring-white mb-0.5" />
                                                            <div className="w-[1px] h-full border-l border-dashed border-slate-300/80" />
                                                        </div>

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

                {/* PANEL WILAYAH DESA DAN SLS */}
                <div className="w-full md:w-2/3 bg-white rounded-xl border border-slate-200 flex flex-col shadow-sm min-h-[400px] md:min-h-0">
                    {rightPanelMode === 'desa' ? (
                        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {desaSummary.map(desa => {
                                const isFullyAllocated = desa.total === desa.allocated;
                                return (
                                    <div
                                        key={desa.name}
                                        onClick={() => { setSelectedDesa(desa.name); setRightPanelMode('sls'); }}
                                        className={`p-4 border rounded-xl cursor-pointer group transition-all ${isFullyAllocated ? 'bg-emerald-50/60 border-emerald-200 hover:bg-emerald-100/80' : 'bg-white border-slate-200 hover:bg-slate-50'}`}
                                    >
                                        <div className="flex justify-between items-center mb-2 font-bold text-slate-800">({desa.code}) {desa.name} <ChevronRight size={16} /></div>
                                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                                            <div>Total SLS: <span className="font-semibold text-slate-700">{desa.total}</span></div>
                                            <div>Teralokasi: <span className="font-semibold text-slate-700">{desa.allocated}</span></div>
                                            <div className="border-l pl-4">Sisa Alokasi: <span className={`font-semibold ${isFullyAllocated ? 'text-emerald-700' : 'text-amber-600'}`}>{desa.total - desa.allocated} SLS {isFullyAllocated && '(Selesai)'}</span></div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <>
                            <div className="p-4 border-b bg-slate-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 font-bold text-slate-700">
                                <button onClick={() => setRightPanelMode('desa')} className="flex items-center gap-2 hover:text-emerald-600 text-left group min-w-0 cursor-pointer">
                                    <ArrowLeft size={18} className="shrink-0 group-hover:-translate-x-0.5 transition-transform" />
                                    <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3 min-w-0">
                                        <span className="truncate text-base text-slate-800">{selectedDesa}</span>
                                        <span className="text-[11px] font-bold uppercase tracking-tight text-slate-500 bg-slate-200/50 border border-slate-300/40 px-2.5 py-1 rounded-md shrink-0">
                                            Total Muatan: {' '}
                                            <span className="text-slate-800 font-black">
                                                {slsList.filter(s => s.nmdesa === selectedDesa).reduce((acc, curr) => acc + (curr.perkiraan_jumlah_beban || 0), 0).toLocaleString('id-ID')}
                                            </span>
                                        </span>
                                    </div>
                                </button>

                                <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold uppercase tracking-tight shrink-0">
                                    <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-200/50 rounded-md text-slate-800">
                                        <span>Jumlah SLS:</span>
                                        <span>{slsList.filter(s => s.nmdesa === selectedDesa).length}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 px-2 py-1 bg-rose-50 rounded-md text-rose-400">
                                        <span>Belum dialokasi:</span>
                                        <span className="text-rose-600">{slsList.filter(s => s.nmdesa === selectedDesa && !s.petugas_id).length}</span>
                                    </div>
                                </div>
                            </div>

                            {/* PANEL UTAMA DETAIL LIST BARIS SLS */}
{/* List Baris SLS */}
<div ref={slsContainerRef} className="flex-1 overflow-y-auto p-4 space-y-2">
    {slsList.filter(s => s.nmdesa === selectedDesa).map(sls => {
        const isSelected = selectedSlsIds.includes(sls.idsubsls);
        const petugas = pcls.find(p => p.email === sls.petugas_id);
        const isAllocated = !!sls.petugas_id;

        return (
            <div
                key={sls.idsubsls}
                onClick={() => {
                    if (isReadOnly) return;
                    setSelectedSlsIds(prev => prev.includes(sls.idsubsls) ? prev.filter(id => id !== sls.idsubsls) : [...prev, sls.idsubsls]);
                }}
                className={`p-3 border rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0 transition-all mb-1 ${isReadOnly ? 'cursor-not-allowed opacity-85' : 'cursor-pointer'} ${isSelected ? 'border-orange-500 bg-orange-50 ring-1 ring-orange-500 z-10' : isAllocated ? 'bg-emerald-50 border-emerald-100 hover:border-emerald-300' : 'bg-white border-slate-200 hover:border-slate-300'}`}
            >
                <div className="w-full sm:flex-[0.8] min-w-0 sm:pr-4">
                    <div className="flex items-center gap-2">
                        <span className="w-[50px] text-[10px] font-bold text-slate-400 shrink-0">[{sls.kdsls} {sls.kdsubsls}]</span>
                        <span className={`font-bold truncate text-sm ${isAllocated ? 'text-emerald-900' : 'text-slate-700'}`}>{sls.nmsls}</span>
                    </div>
                    <div className="text-[10px] text-slate-500 pl-0 sm:pl-[58px]">{sls.jumlah_kk} Keluarga | {sls.jumlah_usaha} Usaha</div>
                </div>

                <div className="w-full sm:flex-1 px-0 sm:px-4 border-l-0 sm:border-l border-slate-200/50 pt-1 sm:pt-0">
                    {isAllocated ? (
                        <div className="flex flex-col">
                            <span className="text-[9px] font-bold text-emerald-600/70 uppercase tracking-tighter">Petugas PCL</span>
                            <div className="font-extrabold text-emerald-800 text-sm uppercase truncate leading-tight">{petugas?.nama_petugas || 'Petugas'}</div>
                        </div>
                    ) : <div className="text-[11px] text-slate-300 italic">Belum ditentukan</div>}
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-4 ml-0 sm:ml-2 w-full sm:w-auto border-t sm:border-t-0 border-slate-100 pt-2 sm:pt-0">
                    <div className="flex flex-col items-start sm:items-end">
                        <span className="text-[9px] font-bold text-slate-400 uppercase leading-none mb-1">Perkiraan Muatan</span>
                        <div className="flex items-center gap-1.5">
                            {sls.muatan_awal !== null && sls.muatan_awal !== undefined && (
                                <span className="text-[9px] bg-amber-50 text-amber-700 font-extrabold px-1.5 py-0.5 rounded border border-amber-200 cursor-help" title={`Muatan Awal: ${sls.muatan_awal}\nAlasan Perubahan: ${sls.alasan_perubahan || '-'}`}>Awal: {sls.muatan_awal}</span>
                            )}
                            <div className={`min-w-[40px] text-center py-0.5 rounded px-2 text-sm font-black border ${isSelected ? 'bg-orange-500 border-orange-600 text-white' : isAllocated ? 'bg-emerald-600 border-emerald-700 text-white' : 'bg-slate-100 border-slate-200 text-slate-600'}`}>{sls.perkiraan_jumlah_beban}</div>
                            
                            {/* FIX PERBAIKAN: setEditMuatanTarget diganti ke nama yang benar */}
                            {!isReadOnly && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setEditMuatanTarget(sls); 
                                        setInputMuatanBaru(sls.perkiraan_jumlah_beban);
                                        setInputAlasan(sls.alasan_perubahan || "");
                                    }}
                                    className="p-1 hover:bg-slate-100 border border-slate-200 hover:border-indigo-300 rounded text-slate-500 hover:text-indigo-600 transition-colors cursor-pointer text-xs flex items-center justify-center"
                                    title="Edit Jumlah Muatan SLS"
                                >
                                    ✏️
                                </button>
                            )}
                        </div>
                    </div>

                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all shrink-0 ${isSelected ? 'bg-orange-500 border-orange-500 scale-110' : isAllocated ? 'border-emerald-400 bg-emerald-100' : 'border-slate-200 bg-white'}`}>
                        {isSelected && <CheckCircle2 size={14} className="text-white" />}
                        {isAllocated && !isSelected && <CheckCircle2 size={12} className="text-emerald-500" />}
                    </div>
                </div>
            </div>
        );
    })}
</div>

{/* ============================================================= */}
{/* MODAL EDIT JUMLAH MUATAN SLS (Sudah Sinkron & Muncul Kembali) */}
{/* ============================================================= */}
{editMuatanTarget && (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-150">
            
            {/* Header */}
            <div className="p-4 border-b flex justify-between items-center bg-slate-50">
                <div>
                    <h3 className="font-bold text-slate-800">Edit Muatan SLS</h3>
                    <p className="text-[10px] text-slate-500 mt-0.5 font-medium uppercase tracking-wider">
                        {editMuatanTarget.nmdesa} | {editMuatanTarget.nmsls}
                    </p>
                </div>
                <button 
                    onClick={() => setEditMuatanTarget(null)}
                    className="text-slate-400 hover:bg-slate-100 w-8 h-8 rounded-lg flex items-center justify-center font-bold transition-colors cursor-pointer"
                >
                    ✕
                </button>
            </div>

            {/* Form Body */}
            <div className="p-4 space-y-4">
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1">
                        Muatan Saat Ini / Beban Baru
                    </label>
                    <input 
                        type="number"
                        min="0"
                        value={inputMuatanBaru}
                        onChange={(e) => setInputMuatanBaru(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl text-base font-black focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all shadow-sm"
                        placeholder="Masukkan angka muatan..."
                    />
                </div>

                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1">
                        Alasan Perubahan <span className="text-rose-500">*</span>
                    </label>
                    <textarea 
                        rows="3"
                        value={inputAlasan}
                        onChange={(e) => setInputAlasan(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-medium focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all shadow-sm resize-none"
                        placeholder="Contoh: Terjadi salah identifikasi, pasar hewan, banyak bangunan kosong, pasar belum beroperasi, penambahan muatan, dll..."
                    />
                </div>
            </div>

            {/* Footer Action */}
            <div className="p-4 bg-slate-50 border-t flex justify-end gap-2">
                <button
                    onClick={() => setEditMuatanTarget(null)}
                    className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-100 transition-colors cursor-pointer"
                >
                    Batal
                </button>
                <button
                    onClick={async () => {
                        if (!inputMuatanBaru || inputMuatanBaru < 0) {
                            alert("Masukkan jumlah muatan yang valid!");
                            return;
                        }
                        if (!inputAlasan.trim()) {
                            alert("Alasan perubahan wajib diisi!");
                            return;
                        }
                        
                        await handleUpdateMuatanSls(
                            editMuatanTarget.idsubsls,
                            editMuatanTarget.perkiraan_jumlah_beban,
                            inputMuatanBaru,
                            inputAlasan,
                            editMuatanTarget.muatan_awal
                        );
                        setEditMuatanTarget(null);
                    }}
                    disabled={!inputAlasan.trim() || inputMuatanBaru === ""}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold transition-colors shadow-md cursor-pointer"
                >
                    Simpan Perubahan
                </button>
            </div>

        </div>
    </div>
)}
                        </>
                    )}
                </div>
            </div>

            {/* MODAL EDIT JUMLAH BEBAN SLS */}
            {editMuatanTarget && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-150">
                        <div className="p-4 border-b flex justify-between items-center bg-slate-50">
                            <div>
                                <h3 className="font-bold text-slate-800">Edit Muatan SLS</h3>
                                <p className="text-[10px] text-slate-500 mt-0.5 font-medium uppercase tracking-wider">{editMuatanTarget.nmdesa} | {editMuatanTarget.nmsls}</p>
                            </div>
                            <button onClick={() => setEditMuatanTarget(null)} className="text-slate-400 hover:bg-slate-100 w-8 h-8 rounded-lg flex items-center justify-center font-bold transition-colors cursor-pointer">✕</button>
                        </div>
                        <div className="p-4 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">Muatan Saat Ini / Beban Baru</label>
                                <input type="number" min="0" value={inputMuatanBaru} onChange={(e) => setInputMuatanBaru(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-xl text-base font-black focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all shadow-sm" placeholder="Masukkan angka muatan..." />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">Alasan Perubahan <span className="text-rose-500">*</span></label>
                                <textarea rows="3" value={inputAlasan} onChange={(e) => setInputAlasan(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-medium focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all shadow-sm resize-none" placeholder="Contoh: Terjadi salah identifikasi, pasar hewan, banyak bangunan kosong..." />
                            </div>
                        </div>
                        <div className="p-4 bg-slate-50 border-t flex justify-end gap-2">
                            <button onClick={() => setEditMuatanTarget(null)} className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-100 transition-colors cursor-pointer">Batal</button>
                            <button
                                onClick={async () => {
                                    if (!inputMuatanBaru || inputMuatanBaru < 0) return alert("Masukkan jumlah muatan yang valid!");
                                    if (!inputAlasan.trim()) return alert("Alasan perubahan wajib diisi!");
                                    await handleUpdateMuatanSls(editMuatanTarget.idsubsls, editMuatanTarget.perkiraan_jumlah_beban, inputMuatanBaru, inputAlasan, editMuatanTarget.muatan_awal);
                                    setEditMuatanTarget(null);
                                }}
                                disabled={!inputAlasan.trim() || inputMuatanBaru === ""}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold transition-colors shadow-md cursor-pointer"
                            >Simpan Perubahan</button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL PETUGAS CADANGAN */}
            {swapTarget && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[85vh] overflow-hidden transform transition-all">
                        <div className="p-4 border-b flex justify-between items-center bg-amber-50">
                            <div>
                                <h3 className="font-bold text-amber-800">Pilih Petugas Cadangan</h3>
                                <p className="text-[10px] text-amber-600 mt-0.5">Mengganti PCL aktif: <span className="font-black uppercase">{pcls.find(p => p.email === swapTarget)?.nama_petugas}</span></p>
                            </div>
                            <button onClick={() => setSwapTarget(null)} className="text-amber-700 hover:bg-amber-200 w-8 h-8 rounded-lg flex items-center justify-center font-bold transition-colors cursor-pointer">✕</button>
                        </div>
                        <div className="p-4 border-b bg-slate-50">
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
                                <input type="text" placeholder="Ketik nama cadangan..." value={searchCadangan} onChange={(e) => setSearchCadangan(e.target.value)} className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-xl text-base sm:text-sm font-medium focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 transition-all shadow-sm" autoFocus />
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 space-y-1 bg-slate-50/50">
                            {pcls
                                .filter(p => p.status && p.status.toLowerCase() === 'cadangan')
                                .filter(p => p.nama_petugas && p.nama_petugas.toLowerCase().includes(searchCadangan.toLowerCase()))
                                .map(cadangan => (
                                    <div key={cadangan.email} className="flex justify-between items-center p-3 bg-white hover:bg-amber-50 border border-slate-100 hover:border-amber-200 rounded-xl transition-all shadow-sm group gap-2">
                                        <div className="flex flex-col min-w-0 pr-4">
                                            <span className="font-bold text-slate-800 text-xs uppercase truncate">{cadangan.nama_petugas}</span>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-[10px] text-slate-500 truncate">{cadangan.email}</span>
                                                <span className="text-[9px] font-bold px-1.5 py-0.5 bg-slate-200/70 text-slate-600 rounded border border-slate-300 shrink-0">📍 Kec: {cadangan.kecamatan_tugas || 'Belum Ditugaskan'}</span>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => {
                                                const pclLama = pcls.find(p => p.email === swapTarget);
                                                handleGantiPetugas(pclLama.email, cadangan.email, pclLama.nama_petugas, cadangan.nama_petugas, pclLama.id_pml_atasan);
                                                setSwapTarget(null);
                                            }}
                                            className="bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg shadow-sm transition-colors shrink-0 cursor-pointer"
                                        >Pilih & Ganti</button>
                                    </div>
                                ))
                            }
                            {pcls.filter(p => p.status && p.status.toLowerCase() === 'cadangan' && p.nama_petugas?.toLowerCase().includes(searchCadangan.toLowerCase())).length === 0 && (
                                <div className="text-center py-10 flex flex-col items-center">
                                    <span className="text-3xl mb-2">🕵️‍♂️</span>
                                    <span className="text-sm font-bold text-slate-500">Tidak ada cadangan ditemukan</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};