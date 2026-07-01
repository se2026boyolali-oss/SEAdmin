import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import {
    BarChart, Bar, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, LabelList
} from 'recharts';
import {
    ShieldAlert, Search, ArrowRight, User, Calendar, X, AlertTriangle, MapPin, UserX, RefreshCw, Download
} from 'lucide-react';
import * as XLSX from 'xlsx';

// 📸 Helper Taktis: Mengubah link biasa menjadi Link Embed Preview Google Drive
const konversiLinkDrive = (urlDrive) => {
    if (!urlDrive) return "";
    const match = urlDrive.match(/\/d\/([^/]+)/);
    return match && match[1] ? `https://drive.google.com/file/d/${match[1]}/preview` : urlDrive;
};

// 🛡️ Helper Taktis: Ekstraksi 3 digit kode kecamatan_tugas
const ekstrakKodeKecPetugas = (stringKec) => {
    if (!stringKec) return "";
    const match = String(stringKec).trim().match(/^\d+/);
    return match ? match[0] : "";
};

const MiniCalendar = React.memo(({ arrayTanggalAktif }) => {
    const jktDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
    const tglHariIni = `${jktDate.getFullYear()}-${String(jktDate.getMonth() + 1).padStart(2, '0')}-${String(jktDate.getDate()).padStart(2, '0')}`;

    const tujuhHariTerakhir = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(jktDate);
        d.setDate(jktDate.getDate() - (6 - i));
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });

    const aktifSet = useMemo(() => new Set(arrayTanggalAktif), [arrayTanggalAktif]);

    return (
        <div className="flex gap-1">
            {tujuhHariTerakhir.map((fullDate, idx) => {
                const dayNum = parseInt(fullDate.split('-')[2], 10);
                const isActive = aktifSet.has(fullDate);
                const isHariIni = fullDate === tglHariIni;

                let styleClass = "bg-slate-50 text-slate-300 border-slate-100";
                if (isActive) styleClass = "bg-emerald-500 text-white border-emerald-600 shadow-sm";
                else if (isHariIni) styleClass = "bg-rose-500 text-white border-rose-600 animate-pulse ring-1 ring-rose-300";

                return (
                    <div key={idx} className={`w-5 h-5 flex items-center justify-center rounded-md text-[9px] font-black border transition-all ${styleClass}`}>
                        {dayNum}
                    </div>
                );
            })}
        </div>
    );
});
MiniCalendar.displayName = 'MiniCalendar';

export default function DashboardPusat() {
    const [loading, setLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isMasterReady, setIsMasterReady] = useState(false);
    const [searchInputValue, setSearchInputValue] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState('PCL');
    const [filterStatus, setFilterStatus] = useState('all');

    const [selectedKecamatan, setSelectedKecamatan] = useState(null);
    const [selectedKecTab, setSelectedKecTab] = useState("SEMUA");
    const [daftarKecamatan, setDaftarKecamatan] = useState([]);

    const [showDetailEvaluasi, setShowDetailEvaluasi] = useState(false);
    const [dataEvaluasiTerpilih, setDataEvaluasiTerpilih] = useState({ tanggal: '', listLaporan: [] });
    const [loadingDetailEval, setLoadingDetailEval] = useState(false);
    const [evalSearchTerm, setEvalSearchTerm] = useState('');
    const [evalActiveFilter, setEvalActiveFilter] = useState('SUDAH');
    const [evalCurrentPage, setEvalCurrentPage] = useState(1);
    const itemsPerPage = 5;

    const [showDetailLapangan, setShowDetailLapangan] = useState(false);
    const [dataLapanganTerpilih, setDataLapanganTerpilih] = useState({ tanggalLabel: '', tanggalDb: '', listPetugasAktif: [] });
    const [lapSearchTerm, setLapSearchTerm] = useState('');
    const [lapActiveFilter, setLapActiveFilter] = useState('AKTIF');
    const [lapCurrentPage, setLapCurrentPage] = useState(1);
    const lapItemsPerPage = 10;

    const [showModalMetrik, setShowModalMetrik] = useState(false);
    const [dataModalMetrik, setDataModalMetrik] = useState({ judul: '', role: '', tipeStatus: '', listPetugas: [] });
    const [modalMetrikSearch, setModalMetrikSearch] = useState('');
    const [modalMetrikPage, setModalMetrikPage] = useState(1);
    const [modalMetrikActiveTab, setModalMetrikActiveTab] = useState('AKTIF');
    const modalMetrikItemsPerPage = 10;

    const [tableCurrentPage, setTableCurrentPage] = useState(1);
    const tableItemsPerPage = 25;

    const [selectedFilterDate, setSelectedFilterDate] = useState(() => {
        const jktDate = new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" });
        const dateObj = new Date(jktDate);
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    });

    const [globalMetrics, setGlobalMetrics] = useState({ totalPcl: 0, pclAktifHariIni: 0, totalPml: 0, pmlAktifHariIni: 0, totalStagnan: 0 });
    const [masterPclList, setMasterPclList] = useState([]);
    const [masterPmlList, setMasterPmlList] = useState([]);
    const [selectedPetugas, setSelectedPetugas] = useState(null);
// 📅 Tambahkan ini untuk mengontrol perpindahan bulan secara lokal di kalender detail
const [currentCalMonth, setCurrentCalMonth] = useState(new Date(2026, 5, 1)); // Default ke Juni 2026 sesuai project SE26
    const [rawPetugas, setRawPetugas] = useState([]);
    const [rawLogsPcl, setRawLogsPcl] = useState([]);
    const [rawRealisasiPml, setRawRealisasiPml] = useState([]);
    const [rawMasterSls, setRawMasterSls] = useState([]);
    const [slsMap, setSlsMap] = useState(new Map());

    // 💡 EFFECT UNTUK DEBOUNCING PENCARIAN UTAMA
    useEffect(() => {
        const delayDebounceFn = setTimeout(() => {
            setSearchTerm(searchInputValue);
        }, 300);
        return () => clearTimeout(delayDebounceFn);
    }, [searchInputValue]);

    const handleExportToExcel = (tipe) => {
        let dataRaw = [];
        let namaFile = "";

        const pclTerfilter = selectedKecamatan
            ? masterPclList.filter(p => ekstrakKodeKecPetugas(p.kecamatan_tugas) === selectedKecamatan)
            : masterPclList;

        const pmlTerfilter = selectedKecamatan
            ? masterPmlList.filter(p => ekstrakKodeKecPetugas(p.kecamatan_tugas) === selectedKecamatan)
            : masterPmlList;

        if (tipe === 'PPL') {
            namaFile = `REKAP_PPL_LAPANGAN_${selectedKecamatan || 'KABUPATEN'}`;
            const pclSorted = [...pclTerfilter].sort((a, b) =>
                (a.kecamatan_tugas || "").localeCompare(b.kecamatan_tugas || "")
            );
            dataRaw = pclSorted.map(p => ({
                'Kecamatan Tugas': p.kecamatan_tugas,
                'Nama Petugas': p.nama_petugas,
                'Email': p.email,
                'Status Hari Ini': p.statusHariIni || 'ABSEN',
                'SLS Terakhir': p.lastSls || '-'
            }));
        } else if (tipe === 'PML') {
            namaFile = `REKAP_PML_LAPANGAN_${selectedKecamatan || 'KABUPATEN'}`;
            const pmlSorted = [...pmlTerfilter].sort((a, b) =>
                (a.kecamatan_tugas || "").localeCompare(b.kecamatan_tugas || "")
            );
            dataRaw = pmlSorted.map(p => ({
                'Kecamatan Tugas': p.kecamatan_tugas,
                'Nama Pengawas': p.nama_pengguna || p.nama_petugas,
                'Email': p.email,
                'Status Hari Ini': p.statusHariIni || 'ABSEN'
            }));
        } else if (tipe === 'STAGNAN') {
            namaFile = `DAFTAR_PETUGAS_STAGNAN_${selectedKecamatan || 'KABUPATEN'}`;
            const pclStagnan = pclTerfilter.filter(p => p.isStagnan).map(p => ({ 'Posisi': 'PPL', ...p }));
            const pmlStagnan = pmlTerfilter.filter(p => p.isStagnan).map(p => ({ 'Posisi': 'PML', ...p }));
            const gabunganStagnan = [...pclStagnan, ...pmlStagnan];
            gabunganStagnan.sort((a, b) =>
                (a.kecamatan_tugas || "").localeCompare(b.kecamatan_tugas || "")
            );
            dataRaw = gabunganStagnan.map(p => ({
                'Kecamatan Tugas': p.kecamatan_tugas,
                'Role': p.Posisi,
                'Nama Petugas': p.nama_petugas || p.nama_pengguna,
                'Email': p.email,
                'Keterangan': 'Tidak Kirim Absen >= 3 Hari'
            }));
        }

        if (dataRaw.length === 0) {
            alert("Tidak ada data untuk diekspor pada filter kecamatan ini.");
            return;
        }

        const worksheet = XLSX.utils.json_to_sheet(dataRaw);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Data Monitoring");
        XLSX.writeFile(workbook, `${namaFile}.xlsx`);
    };

    const handleDownloadSlsExcel = () => {
        const targetSls = selectedKecTab === "SEMUA"
            ? rawMasterSls
            : rawMasterSls.filter(sls => String(sls.kdkec).trim() === selectedKecTab);

        if (targetSls.length === 0) {
            alert("Tidak ada data SLS untuk diunduh!");
            return;
        }

        const sortedSlsDefault = [...targetSls].sort((a, b) => {
            return String(a.idsubsls || "").localeCompare(String(b.idsubsls || ""), 'id', { numeric: true });
        });

        const mappedSlsPetugasRaw = targetSls.map(sls => {
            const dataPpl = rawPetugas.find(p => p.id === sls.petugas_id || p.nama_petugas === sls.petugas?.nama_petugas);
            const emailPmlRaw = dataPpl?.id_pml_atasan || "-";
            const dataPml = emailPmlRaw !== "-" ? rawPetugas.find(p => p.email === emailPmlRaw) : null;
            const realisasiCount = parseInt(sls.realisasi_pencacahan) || 0;
            const statusValidasi = sls.is_selesai ? "SELESAI" : (realisasiCount > 0 ? "SEDANG DIKERJAKAN" : "BELUM DIKERJAKAN");

            return {
                "Kode Kec": sls.kdkec || "-",
                "Nama Kec": sls.nmkec || "-",
                "Email PML": emailPmlRaw,
                "Nama PML": dataPml?.nama_petugas || "-",
                "Email PPL": dataPpl?.email || "-",
                "Nama PPL": dataPpl?.nama_petugas || "Belum Ada Petugas",
                "Kode Desa": sls.kddesa || "-",
                "Nama Desa": sls.nmdesa || "-",
                "Kode SLS": sls.kdsls || "-",
                "Nama SLS": sls.nmsls || "-",
                "ID Sub SLS": sls.idsubsls || "-",
                "Target Muatan Awal": parseInt(sls.jml_muatan) || 0,
                "Realisasi Pendataan": realisasiCount,
                "Status": statusValidasi
            };
        });

        const filteredSlsPetugas = mappedSlsPetugasRaw.filter(sls =>
            sls["Status"] === "SEDANG DIKERJAKAN" || sls["Status"] === "SELESAI"
        );

        const sortedSlsPetugas = [...filteredSlsPetugas].sort((a, b) => {
            const rKec = String(a["Kode Kec"]).localeCompare(String(b["Kode Kec"]), 'id', { numeric: true });
            if (rKec !== 0) return rKec;
            const rPml = String(a["Nama PML"]).localeCompare(String(b["Nama PML"]), 'id');
            if (rPml !== 0) return rPml;
            const rPpl = String(a["Nama PPL"]).localeCompare(String(b["Nama PPL"]), 'id');
            if (rPpl !== 0) return rPpl;
            return String(a["ID Sub SLS"]).localeCompare(String(b["ID Sub SLS"]), 'id', { numeric: true });
        });

        const rekapPetugasMap = {};
        mappedSlsPetugasRaw.forEach(sls => {
            const kdkec = sls["Kode Kec"];
            const nmkec = sls["Nama Kec"];
            const emailPml = sls["Email PML"].toLowerCase().trim();
            const namaPml = sls["Nama PML"];
            const emailPpl = sls["Email PPL"].toLowerCase().trim();
            const namaPpl = sls["Nama PPL"];
            const realisasiSls = sls["Realisasi Pendataan"];
            const groupKey = `${kdkec}_${emailPml}_${emailPpl}`;

            if (!rekapPetugasMap[groupKey]) {
                rekapPetugasMap[groupKey] = {
                    "Kode Kec": kdkec,
                    "Nama Kec": nmkec,
                    "Email PML": emailPml === "-" ? "-" : sls["Email PML"],
                    "Nama PML": namaPml,
                    "Email PPL": emailPpl,
                    "Nama PPL": namaPpl,
                    "Jumlah SLS Selesai": 0,
                    "Jumlah SLS Sedang Dikerjakan": 0,
                    "Jumlah SLS Belum Dikerjakan": 0,
                    "Realisasi Lapangan": 0 
                };
            }

            rekapPetugasMap[groupKey]["Realisasi Lapangan"] += realisasiSls;
            if (sls["Status"] === "SELESAI") {
                rekapPetugasMap[groupKey]["Jumlah SLS Selesai"]++;
            } else if (sls["Status"] === "SEDANG DIKERJAKAN") {
                rekapPetugasMap[groupKey]["Jumlah SLS Sedang Dikerjakan"]++;
            } else {
                rekapPetugasMap[groupKey]["Jumlah SLS Belum Dikerjakan"]++;
            }
        });

        const dataRekapPetugasSorted = Object.values(rekapPetugasMap).sort((a, b) => {
            const rKec = String(a["Kode Kec"]).localeCompare(String(b["Kode Kec"]), 'id', { numeric: true });
            if (rKec !== 0) return rKec;
            const rPml = String(a["Nama PML"]).localeCompare(String(b["Nama PML"]), 'id');
            if (rPml !== 0) return rPml;
            return String(a["Nama PPL"]).localeCompare(String(b["Nama PPL"]), 'id');
        });

        const formatSlsData = (list) => list.map(sls => {
            const dataPpl = rawPetugas.find(p => p.id === sls.petugas_id || p.nama_petugas === sls.petugas?.nama_petugas);
            return {
                "Kode Kecamatan": sls.kdkec,
                "Nama Kecamatan": sls.nmkec,
                "Kode Desa": sls.kddesa,
                "Nama Desa/Kelurahan": sls.nmdesa,
                "Kode SLS": sls.kdsls,
                "Nama SLS": sls.nmsls,
                "ID Sub-SLS": sls.idsubsls,
                "Nama Petugas (PCL)": sls.petugas?.nama_petugas || "Belum Ada Petugas",
                "Email Petugas": dataPpl?.email || "-",
                "Target Muatan Awal": parseInt(sls.jml_muatan) || 0,
                "Realisasi Pencacahan": parseInt(sls.realisasi_pencacahan) || 0,
                "Status Validasi": sls.is_selesai ? "SELESAI" : (parseInt(sls.realisasi_pencacahan) > 0 ? "SEDANG DIDATA" : "BELUM MULAI")
            };
        });

        const sudahDidataRaw = sortedSlsDefault.filter(sls => sls.is_selesai === true || (parseInt(sls.realisasi_pencacahan) || 0) > 0);
        const belumDidataRaw = sortedSlsDefault.filter(sls => !sls.is_selesai && (parseInt(sls.realisasi_pencacahan) || 0) === 0);

        const worksheetSudah = XLSX.utils.json_to_sheet(formatSlsData(sudahDidataRaw));
        const worksheetBelum = XLSX.utils.json_to_sheet(formatSlsData(belumDidataRaw));
        const worksheetSlsPetugas = XLSX.utils.json_to_sheet(sortedSlsPetugas);
        const worksheetRekapPetugas = XLSX.utils.json_to_sheet(dataRekapPetugasSorted);

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheetSudah, "SUDAH DIDATA");
        XLSX.utils.book_append_sheet(workbook, worksheetBelum, "BELUM DIDATA");
        XLSX.utils.book_append_sheet(workbook, worksheetSlsPetugas, "SLS PER PETUGAS");
        XLSX.utils.book_append_sheet(workbook, worksheetRekapPetugas, "REKAP PER PETUGAS");

        const namaKecLabel = selectedKecTab === "SEMUA" ? "KABUPATEN" : `KEC_${selectedKecTab}`;
        const tanggalUnduh = new Date().toISOString().split('T')[0].replace(/-/g, '');
        const namaFileFinal = `MONITORING_SLS_SE26_${namaKecLabel}_${tanggalUnduh}.xlsx`;
        XLSX.writeFile(workbook, namaFileFinal);
    };

    const handleExportSiklusToExcel = (item) => {
        const isLapangan = item.target === 'PENDATAAN';
        const namaFile = `DETAIL_PETUGAS_${item.target}_TGL_${item.tanggal.replace(/ /g, '_')}`;
        const dayPart = item.tanggal.split(' ')[0].padStart(2, '0');
        const dbDateFormatted = `2026-06-${dayPart}`;
        let dataRaw = [];

        if (isLapangan) {
            const pplTerfilter = selectedKecamatan
                ? masterPclList.filter(p => ekstrakKodeKecPetugas(p.kecamatan_tugas) === selectedKecamatan)
                : masterPclList;
            const pplSorted = [...pplTerfilter].sort((a, b) =>
                (a.kecamatan_tugas || "").localeCompare(b.kecamatan_tugas || "")
            );
            dataRaw = pplSorted.map(p => {
                const isAktifTanggalIni = (p.rawLogs || []).some(l => l.tanggal === dbDateFormatted);
                return {
                    'Kecamatan Tugas': p.kecamatan_tugas,
                    'Nama Petugas (PPL)': p.nama_petugas,
                    'Email': p.email,
                    'Status Pada Tanggal Ini': isAktifTanggalIni ? 'JALAN LAPANGAN (AKTIF)' : 'BELUM ABSEN (ABSEN)',
                    'SLS Terakhir': p.lastSls || '-',
                    'Tanggal Kegiatan': dbDateFormatted
                };
            });
        } else {
            const pmlTerfilter = selectedKecamatan
                ? masterPmlList.filter(p => ekstrakKodeKecPetugas(p.kecamatan_tugas) === selectedKecamatan)
                : masterPmlList;
            const realisasiMap = new Map(
                rawRealisasiPml
                    .filter(r => r.tanggal === dbDateFormatted)
                    .map(r => [r.pml_email.toLowerCase().trim(), r])
            );
            const pmlSorted = [...pmlTerfilter].sort((a, b) =>
                (a.kecamatan_tugas || "").localeCompare(b.kecamatan_tugas || "")
            );
            dataRaw = pmlSorted.map(p => {
                const emailKey = p.email.toLowerCase().trim();
                const logRealisasi = realisasiMap.get(emailKey);
                const sudahKirim = !!logRealisasi;
                return {
                    'Kecamatan Tugas': p.kecamatan_tugas,
                    'Nama Pengawas (PML)': p.nama_pengguna || p.nama_petugas,
                    'Email': p.email,
                    'Status Evaluasi': sudahKirim ? 'SUDAH KIRIM EVALUASI' : 'BELUM KIRIM EVALUASI',
                    'Kendala Lapangan': sudahKirim ? (logRealisasi.kendala_lapangan || 'Tidak Ada Kendala') : '-',
                    'Solusi Lapangan': sudahKirim ? (logRealisasi.solusi_lapangan || 'Tidak Ada Solusi') : '-',
                    'Link Foto Evaluasi': sudahKirim ? (logRealisasi.foto_evaluasi || '-') : '-',
                    'Tanggal Siklus': dbDateFormatted
                };
            });
        }

        if (dataRaw.length === 0) {
            alert("Tidak ada data petugas untuk diekspor.");
            return;
        }

        const worksheet = XLSX.utils.json_to_sheet(dataRaw);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Detail Petugas Siklus");
        XLSX.writeFile(workbook, `${namaFile}.xlsx`);
    };

    // 🚀 MASTER DATA FETCH (Optimasi Egress: Hapus join relasional mahal)
    const fetchMasterData = useCallback(async () => {
        try {
            const [petugasRes, masterSlsRes] = await Promise.all([
                supabase.from('petugas').select('email, nama_petugas, posisi_tugas, status, kecamatan_tugas, id_pml_atasan').eq('status', 'Diterima'),
                supabase.from('muatan_sls').select('idsubsls, kdkec, nmkec, kddesa, nmdesa, kdsls, nmsls, jml_muatan, realisasi_pencacahan, is_selesai, petugas_id')
            ]);

            if (petugasRes.error || masterSlsRes.error) {
                console.error("Gagal mengambil master data petugas atau SLS");
                return;
            }

            const allPetugas = petugasRes.data || [];
            
            // Re-create relasi petugas secara lokal untuk menghemat egress
            const masterSls = (masterSlsRes.data || []).map(sls => {
                const matchedPetugas = sls.petugas_id ? allPetugas.find(p => p.id === sls.petugas_id) : null;
                return {
                    ...sls,
                    petugas: matchedPetugas ? { nama_petugas: matchedPetugas.nama_petugas } : null
                };
            });

            setRawPetugas(allPetugas);
            setRawMasterSls(masterSls);
            setSlsMap(new Map(masterSls.map(s => [s.idsubsls, s])));

            const rawDaftarKec = Array.from(new Set(allPetugas.map(p => p.kecamatan_tugas).filter(Boolean)));
            const dropdownObjList = rawDaftarKec.sort((a, b) => a.localeCompare(b, 'id', { numeric: true })).map(str => ({
                kode: ekstrakKodeKecPetugas(str),
                label: str
            })).filter(item => item.kode !== "");

            setDaftarKecamatan(dropdownObjList);
            setIsMasterReady(true); 
        } catch (err) {
            console.error("Error pada fetchMasterData:", err);
        }
    }, []);

    // 🚀 LOG DATA FETCH (Optimasi: Terlepas dari Filter Tanggal)
    const fetchOperationalLogs = useCallback(async () => {
        if (!isMasterReady) return; 

        setIsRefreshing(true);
        if (rawLogsPcl.length === 0) setLoading(true);

        const jktDateString = new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" });
        const now = new Date(jktDateString);
        const tglHariIni = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

// ❌ KODE LAMA (Hanya mengunci di tanggal 1 bulan berjalan):
// const batasBawahStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

// =========================================================================

//  KODE BARU (Aman untuk Awal Bulan & Menjaga Histori MiniCalendar 7 Hari):
const tanggalBatas = new Date(now);
// Jika tanggal 1-7 di awal bulan, tarik data dari tanggal 1 di bulan SEBELUMNYA agar MiniCalendar tidak kosong
if (now.getDate() <= 7) {
    tanggalBatas.setMonth(now.getMonth() - 1);
}
const batasBawahStr = `${tanggalBatas.getFullYear()}-${String(tanggalBatas.getMonth() + 1).padStart(2, '0')}-01`;

        const [logsPclRes, logsPmlRes, realisasiPmlRes] = await Promise.all([
            supabase.from('log_checkin_pcl').select('idsubsls, tanggal, petugas_email, foto_bukti').gte('tanggal', batasBawahStr),
            supabase.from('log_checkin_pml').select('pml_email, tanggal, idsubsls, foto_bukti').gte('tanggal', batasBawahStr),
            // Tambahan kolom foto_evaluasi untuk mengurangi query kedua nanti
            supabase.from('log_realisasi_pml').select('tanggal, pml_email, kendala_lapangan, solusi_lapangan, foto_evaluasi').gte('tanggal', batasBawahStr)
        ]);

        if (logsPclRes.error || logsPmlRes.error || realisasiPmlRes.error) {
            console.error("Gagal mengambil log operasional");
            setIsRefreshing(false);
            setLoading(false);
            return;
        }

        const logsPcl = logsPclRes.data || [];
        const logsPml = logsPmlRes.data || [];
        const realisasiPml = realisasiPmlRes.data || [];

        setRawLogsPcl(logsPcl);
        setRawRealisasiPml(realisasiPml);

        const allPcl = rawPetugas.filter(p => p.posisi_tugas === 'PCL');
        const allPml = rawPetugas.filter(p => p.posisi_tugas === 'PML');

        const logsPclMap = new Map();
        logsPcl.forEach(log => {
            if (!logsPclMap.has(log.petugas_email)) logsPclMap.set(log.petugas_email, []);
            logsPclMap.get(log.petugas_email).push(log);
        });

        const logsPmlMap = new Map();
        logsPml.forEach(log => {
            if (!logsPmlMap.has(log.pml_email)) logsPmlMap.set(log.pml_email, []);
            logsPmlMap.get(log.pml_email).push(log);
        });

        let pclAktifCount = 0;
        let pmlAktifCount = 0;
        let totalStagnanCount = 0;

        const prosesDetailedPetugas = (list, logsMap, isPcl) => list.map(petugas => {
            const logs = logsMap.get(petugas.email) || [];
            const checkinHariIni = logs.some(l => l.tanggal === tglHariIni);
            if (checkinHariIni) { if (isPcl) pclAktifCount++; else pmlAktifCount++; }

            let terakhirTanggalStr = "";
            logs.forEach(l => {
                if (!terakhirTanggalStr || l.tanggal > terakhirTanggalStr) terakhirTanggalStr = l.tanggal;
            });

            let hariSelesai = 999;
            if (terakhirTanggalStr) {
                const tglAktivitas = new Date(terakhirTanggalStr);
                hariSelesai = Math.floor((now - tglAktivitas) / (1000 * 60 * 60 * 24));
            }
            const isStagnan = hariSelesai >= 3;
            if (isStagnan) totalStagnanCount++;

            const uniqueSlsIds = Array.from(new Set(logs.map(l => l.idsubsls)));

            return {
                ...petugas,
                terakhirAktivitas: terakhirTanggalStr ? new Date(terakhirTanggalStr).toLocaleDateString('id-ID') : 'Belum Lapangan',
                hariSifatStagnan: hariSelesai,
                isStagnan,
                statusHariIni: checkinHariIni ? 'AKTIF' : (isStagnan ? 'STAGNAN' : 'ABSEN'),
                totalSlsDisentuh: uniqueSlsIds.length,
                daftarSls: uniqueSlsIds.map(id => slsMap.get(id) || { nmsls: 'Unknown SLS', nmdesa: '-' }),
                totalInput: logs.length,
                arrayTanggalAktif: logs.map(l => l.tanggal),
                rawLogs: logs
            };
        });

        const detailedPcl = prosesDetailedPetugas(allPcl, logsPclMap, true);
        const detailedPml = prosesDetailedPetugas(allPml, logsPmlMap, false);

        setGlobalMetrics({
            totalPcl: allPcl.length,
            pclAktifHariIni: pclAktifCount,
            totalPml: allPml.length,
            pmlAktifHariIni: pmlAktifCount,
            totalStagnan: totalStagnanCount
        });
        setMasterPclList(detailedPcl);
        setMasterPmlList(detailedPml);

        setLoading(false);
        setIsRefreshing(false);
    }, [isMasterReady, rawPetugas, slsMap]); // 🔥 Dependency tanggal dihapus

    useEffect(() => {
        fetchMasterData();
    }, [fetchMasterData]);

    useEffect(() => {
        fetchOperationalLogs();
    }, [fetchOperationalLogs]);

    const dataMonitoringWilayah = useMemo(() => {
        const rekapKecamatan = {};
        const rekapDesa = {};
        const rekapPetugas = {};
        const rekapSls = {};
        const rekapStatusSls = { selesai: 0, sedang: 0, belum: 0, total: 0 };
        const muatanStatus = { selesai: 0, proses: 0, belum: 0 };

        rawMasterSls.forEach(sls => {
            const kodeKec = sls.kdkec ? String(sls.kdkec).trim() : "";
            const kodeDesa = sls.kddesa ? String(sls.kddesa).trim() : "";
            const kodeSls = sls.kdsls ? String(sls.kdsls).trim() : "";
            const idSubSls = sls.idsubsls ? String(sls.idsubsls).trim() : "";
            if (!kodeKec || !kodeDesa) return;

            const isTargetKec = selectedKecTab === "SEMUA" || kodeKec === selectedKecTab;
            const muatanAwal = parseInt(sls.jml_muatan) || 0;
            const realisasi = parseInt(sls.realisasi_pencacahan) || 0;
            const isSelesai = sls.is_selesai === true;
            const targetDinamis = (isSelesai || realisasi > muatanAwal) ? realisasi : muatanAwal;

            let muatanSelesai = 0, muatanSedang = 0, muatanBelum = 0;
            if (isSelesai) muatanSelesai = realisasi;
            else if (realisasi > 0) { muatanSedang = realisasi; muatanBelum = Math.max(0, targetDinamis - realisasi); }
            else muatanBelum = targetDinamis;

            if (isTargetKec) {
                rekapStatusSls.total++;
                if (isSelesai) { rekapStatusSls.selesai++; muatanStatus.selesai += realisasi; }
                else if (realisasi > 0) { rekapStatusSls.sedang++; muatanStatus.proses += realisasi; muatanStatus.belum += Math.max(0, targetDinamis - realisasi); }
                else { rekapStatusSls.belum++; muatanStatus.belum += targetDinamis; }
            }

            const updateRekap = (obj, key, namaDefault, extraProps = {}) => {
                if (!obj[key]) {
                    obj[key] = {
                        kode: extraProps.kode || key, ...extraProps,
                        total_target: 0, total_realisasi: 0, jml_sls: 0, sls_selesai: 0,
                        muatan_selesai: 0, muatan_sedang: 0, muatan_belum: 0
                    };
                }
                const target = obj[key];
                target.total_target += targetDinamis;
                target.total_realisasi += realisasi;
                target.jml_sls += 1;
                target.muatan_selesai += muatanSelesai;
                target.muatan_sedang += muatanSedang;
                target.muatan_belum += muatanBelum;
                if (isSelesai) target.sls_selesai += 1;
            };

            updateRekap(rekapKecamatan, kodeKec, sls.nmkec, { nama_asli: sls.nmkec || `Kec. ${kodeKec}`, nama: `[${kodeKec}] ${sls.nmkec}` });
            updateRekap(rekapDesa, `${kodeKec}-${kodeDesa}`, sls.nmdesa, { kodeDesa, kodeKec, nama_asli: sls.nmdesa || `Desa ${kodeDesa}`, nama: `[${kodeDesa}] ${sls.nmdesa}` });

            const keySls = idSubSls || `${kodeKec}-${kodeDesa}-${kodeSls}`;
            updateRekap(rekapSls, keySls, sls.nmsls, { kodeDesa, kodeKec, nama_asli: sls.nmsls || `SLS ${kodeSls}`, nama: sls.nmsls });

            if (sls.petugas_id) {
                const idPetugas = String(sls.petugas_id).trim();
                const namaDariJoin = sls.petugas?.nama_petugas;
                const namaPetugas = String(namaDariJoin || idPetugas.split('@')[0]).toUpperCase();
                updateRekap(rekapPetugas, `${kodeKec}-${idPetugas}`, namaPetugas, { kode: idPetugas, kodeKec, nama_asli: namaPetugas, nama: namaPetugas });
            }
        });

        const calculateStatus = (item) => {
            const totalTargetWilayah = item.total_target || 1;
            const selesai = Math.round((item.muatan_selesai / totalTargetWilayah) * 100);
            const sedang = Math.round((item.muatan_sedang / totalTargetWilayah) * 100);
            return { selesai, sedang, belum: Math.max(0, 100 - selesai - sedang), persen: Math.min(Math.round((item.total_realisasi / totalTargetWilayah) * 100), 100) };
        };

        const formatMap = (obj) => Object.values(obj).map(item => ({ ...item, ...calculateStatus(item) })).sort((a, b) => (a.kode || "").localeCompare(b.kode || "", 'id', { numeric: true }));

        return {
            kecamatan: formatMap(rekapKecamatan),
            desa: formatMap(rekapDesa),
            sls: formatMap(rekapSls),
            petugas: Object.values(rekapPetugas).map(item => ({ ...item, ...calculateStatus(item) })).sort((a, b) => b.persen - a.persen),
            statusSls: rekapStatusSls,
            muatanStatus
        };
    }, [rawMasterSls, selectedKecTab]);

    const namaKecamatanTerpilihText = useMemo(() => {
        if (!selectedKecamatan) return null;
        const match = dataMonitoringWilayah.kecamatan.find(k => k.kode === selectedKecamatan);
        return match ? match.nama_asli : null;
    }, [selectedKecamatan, dataMonitoringWilayah.kecamatan]);

    const trendAndMetricsData = useMemo(() => {
        const now = new Date();
        const jktDateString = now.toLocaleString("en-US", { timeZone: "Asia/Jakarta" });
        const nowJkt = new Date(jktDateString);

        const hitungTrenHarian = (listPcl, listPml, logsPcl, logsPml) => {
            const trendDataRaw = [];
            const logPclMap = new Map();
            const logPmlMap = new Map();

            logsPcl.forEach(l => {
                if (!logPclMap.has(l.tanggal)) logPclMap.set(l.tanggal, new Set());
                logPclMap.get(l.tanggal).add(l.petugas_email);
            });

            logsPml.forEach(l => {
                if (!logPmlMap.has(l.tanggal)) logPmlMap.set(l.tanggal, new Set());
                logPmlMap.get(l.tanggal).add(l.pml_email);
            });

            for (let i = 13; i >= 0; i--) {
                const d = new Date(nowJkt);
                d.setDate(nowJkt.getDate() - i);
                const dateString = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

                const pclAktifTgl = logPclMap.get(dateString)?.size || 0;
                const pclPct = listPcl.length > 0 ? Math.round((pclAktifTgl / listPcl.length) * 100) : 0;

                const pmlAktifTgl = logPmlMap.get(dateString)?.size || 0;
                const pmlPct = listPml.length > 0 ? Math.round((pmlAktifTgl / listPml.length) * 100) : 0;

                trendDataRaw.push({
                    rawDate: dateString,
                    tanggalLabel: d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
                    'PCL Aktif (%)': pclPct,
                    'PML Aktif (%)': pmlPct
                });
            }
            return trendDataRaw;
        };

        const seluruhLogPcl = masterPclList.flatMap(p => p.rawLogs || []);
        const seluruhLogPml = masterPmlList.flatMap(p => p.rawLogs || []);

        if (!selectedKecamatan) {
            return {
                filteredMetrics: globalMetrics,
                trendChartData: hitungTrenHarian(masterPclList, masterPmlList, seluruhLogPcl, seluruhLogPml)
            };
        }

        const pclKec = masterPclList.filter(p => ekstrakKodeKecPetugas(p.kecamatan_tugas) === selectedKecamatan);
        const pmlKec = masterPmlList.filter(p => ekstrakKodeKecPetugas(p.kecamatan_tugas) === selectedKecamatan);

        const pclAktif = pclKec.filter(p => p.rawLogs.some(l => l.tanggal === selectedFilterDate)).length;
        const pmlAktif = pmlKec.filter(p => p.rawLogs.some(l => l.tanggal === selectedFilterDate)).length;
        const stagnan = [...pclKec, ...pmlKec].filter(p => p.isStagnan).length;

        const logPclKec = seluruhLogPcl.filter(l => pclKec.some(p => p.email === l.petugas_email));
        const logPmlKec = seluruhLogPml.filter(l => pmlKec.some(p => p.email === l.pml_email));

        return {
            filteredMetrics: { totalPcl: pclKec.length, pclAktifHariIni: pclAktif, totalPml: pmlKec.length, pmlAktifHariIni: pmlAktif, totalStagnan: stagnan },
            trendChartData: hitungTrenHarian(pclKec, pmlKec, logPclKec, logPmlKec)
        };
    }, [selectedKecamatan, globalMetrics, masterPclList, masterPmlList, selectedFilterDate]);

    const filteredMetrics = trendAndMetricsData.filteredMetrics;
    const trendChartData = trendAndMetricsData.trendChartData;

    const kecamatanChartData = useMemo(() => {
        if (daftarKecamatan.length === 0) return [];
        return daftarKecamatan.map(item => {
            const pclKec = masterPclList.filter(p => ekstrakKodeKecPetugas(p.kecamatan_tugas) === item.kode);
            const pmlKec = masterPmlList.filter(p => ekstrakKodeKecPetugas(p.kecamatan_tugas) === item.kode);

            const pclAktifRiil = pclKec.filter(p => p.rawLogs.some(l => l.tanggal === selectedFilterDate)).length;
            const pmlAktifRiil = pmlKec.filter(p => p.rawLogs.some(l => l.tanggal === selectedFilterDate)).length;

            return {
                name: item.label,
                kode: item.kode,
                'PCL Aktif (%)': pclKec.length > 0 ? Math.round((pclAktifRiil / pclKec.length) * 100) : 0,
                'PML Aktif (%)': pmlKec.length > 0 ? Math.round((pmlAktifRiil / pmlKec.length) * 100) : 0,
                pclAktif: pclAktifRiil,
                pclTotal: pclKec.length,
                pmlAktif: pmlAktifRiil,
                pmlTotal: pmlKec.length
            };
        });
    }, [daftarKecamatan, masterPclList, masterPmlList, selectedFilterDate]);

    const progresSiklusTerfilter = useMemo(() => {
        const petugasTerfilter = selectedKecamatan ? rawPetugas.filter(p => ekstrakKodeKecPetugas(p.kecamatan_tugas) === selectedKecamatan) : rawPetugas;
        const pclKec = petugasTerfilter.filter(p => p.posisi_tugas === 'PCL');
        const pmlKec = petugasTerfilter.filter(p => p.posisi_tugas === 'PML');
        const emailPclSet = new Set(pclKec.map(p => p.email));
        const emailPmlSet = new Set(pmlKec.map(p => p.email));

        const hasilSiklus = [];
        for (let d = 15; d <= 20; d++) {
            const dateString = `2026-06-${d.toString().padStart(2, '0')}`;
            const targetHariIni = [15, 16, 18, 19].includes(d) ? 'PENDATAAN' : 'EVALUASI';
            let petugasAktif = 0;

            if (targetHariIni === 'PENDATAAN') {
                petugasAktif = new Set(rawLogsPcl.filter(l => l.tanggal === dateString && emailPclSet.has(l.petugas_email)).map(l => l.petugas_email)).size;
                hasilSiklus.push({ tanggal: `${d} Juni 2026`, target: targetHariIni, aktif: petugasAktif, absen: pclKec.length - petugasAktif, total: pclKec.length, persentase: pclKec.length > 0 ? (petugasAktif / pclKec.length) * 100 : 0 });
            } else {
                petugasAktif = new Set(rawRealisasiPml.filter(r => r.tanggal === dateString && emailPmlSet.has(r.pml_email)).map(r => r.pml_email)).size;
                hasilSiklus.push({ tanggal: `${d} Juni 2026`, target: targetHariIni, aktif: petugasAktif, absen: pmlKec.length - petugasAktif, total: pmlKec.length, persentase: pmlKec.length > 0 ? (petugasAktif / pmlKec.length) * 100 : 0 });
            }
        }
        return hasilSiklus;
    }, [selectedKecamatan, rawPetugas, rawLogsPcl, rawRealisasiPml]);

    const filteredList = useMemo(() => {
        const listDataAktif = activeTab === 'PCL' ? masterPclList : masterPmlList;
        const jktDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
        const tglSistemSekarang = `${jktDate.getFullYear()}-${String(jktDate.getMonth() + 1).padStart(2, '0')}-${String(jktDate.getDate()).padStart(2, '0')}`;

        const query = searchTerm.toLowerCase();

        return listDataAktif.map(petugas => {
            const isAktifPadaTanggal = petugas.rawLogs.some(l => l.tanggal === selectedFilterDate);
            let statusDinamis = isAktifPadaTanggal ? 'AKTIF' : 'ABSEN';

            if (!isAktifPadaTanggal && petugas.isStagnan && selectedFilterDate === tglSistemSekarang) {
                statusDinamis = 'STAGNAN';
            }
            return { ...petugas, statusHariIni: statusDinamis };
        }).filter(p => {
            const matchSearch = (p.nama_petugas || '').toLowerCase().includes(query) || p.email.toLowerCase().includes(query);
            const matchKecamatan = selectedKecamatan ? ekstrakKodeKecPetugas(p.kecamatan_tugas) === selectedKecamatan : true;

            if (filterStatus === 'stagnan') return matchSearch && matchKecamatan && p.isStagnan;
            if (filterStatus === 'aktif') return matchSearch && matchKecamatan && p.statusHariIni === 'AKTIF';
            return matchSearch && matchKecamatan;
        }).sort((a, b) => (a.kecamatan_tugas || "").localeCompare(b.kecamatan_tugas || "", 'id', { numeric: true }));

    }, [activeTab, masterPclList, masterPmlList, searchTerm, selectedKecamatan, filterStatus, selectedFilterDate]);

    const handleBukaDetailLapangan = (tanggalLabel) => {
        setLapCurrentPage(1);
        setLapSearchTerm('');
        setLapActiveFilter('AKTIF');

        const part = tanggalLabel.split(' ');
        const day = part[0].padStart(2, '0');
        const dbDateFormatted = `2026-06-${day}`;

        const emailAktifSet = new Set(
            rawLogsPcl
                .filter(log => log.tanggal === dbDateFormatted)
                .map(log => log.petugas_email.toLowerCase().trim())
        );

        setDataLapanganTerpilih({
            tanggalLabel,
            tanggalDb: dbDateFormatted,
            listPetugasAktif: Array.from(emailAktifSet)
        });
        setShowDetailLapangan(true);
    };

    // 🚀 LOKALISASI: Fetch Evaluasi tanpa request egress ke Supabase
    const handleBukaDetailEvaluasi = (tanggalLabel) => {
        setLoadingDetailEval(true);
        setShowDetailEvaluasi(true);
        setEvalCurrentPage(1);
        setEvalSearchTerm('');

        const part = tanggalLabel.split(' ');
        const day = part[0].padStart(2, '0');
        const dbDateFormatted = `2026-06-${day}`;

        setDataEvaluasiTerpilih({ tanggal: tanggalLabel, listLaporan: [] });

        setTimeout(() => {
            try {
                // Filter murni dari lokal (rawRealisasiPml)
                const dataRaw = rawRealisasiPml.filter(log => log.tanggal === dbDateFormatted);

                const dataFormatted = dataRaw.map(log => {
                    const pml = rawPetugas.find(p => p.email === log.pml_email) || {};
                    return {
                        pml_email: log.pml_email,
                        kendala_lapangan: log.kendala_lapangan,
                        solusi_lapangan: log.solusi_lapangan,
                        foto_evaluasi: log.foto_evaluasi,
                        nama_petugas: pml.nama_petugas || 'TANPA NAMA',
                        kecamatan_tugas: pml.kecamatan_tugas || '999 KOSONG'
                    };
                });

                const dataSorted = dataFormatted.sort((a, b) => {
                    return a.kecamatan_tugas.localeCompare(b.kecamatan_tugas, 'id', { numeric: true });
                });

                setDataEvaluasiTerpilih({
                    tanggal: tanggalLabel,
                    listLaporan: dataSorted
                });

            } catch (err) {
                console.error("Gagal format detail evaluasi lokal:", err.message);
            } finally {
                setLoadingDetailEval(false);
            }
        }, 50); 
    };

    const [tahun, bulan, hari] = selectedFilterDate.split('-');
    const namaBulan = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
    const tanggalTampil = `${parseInt(hari)} ${namaBulan[parseInt(bulan) - 1]} ${tahun}`;
    const formatSistemSekarang = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;
    const isHariIni = selectedFilterDate === formatSistemSekarang;
    const labelTanggal = isHariIni ? `Hari Ini (${tanggalTampil})` : tanggalTampil;

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50">
                <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
                <div className="text-slate-500 text-xs font-bold tracking-wider animate-pulse">MENYUSUN DATA LAPORAN KABUPATEN...</div>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-6 bg-slate-50 min-h-screen text-slate-800 font-sans antialiased selection:bg-indigo-100">
            <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-b border-slate-200 pb-4">
                <div>
                    <h1 className="text-sm font-black tracking-wider text-slate-800 uppercase flex items-center gap-2">
                        <ShieldAlert className="text-indigo-600" size={18} /> Dashboard Lapangan Sensus Ekonomi 2026
                    </h1>
                    <p className="text-[11px] text-slate-400 font-medium mt-0.5">Monitoring Pemantauan Lapangan Sensus Ekonomi 2026 BPS Kabupaten Boyolali</p>
                </div>
                <button
                    onClick={fetchOperationalLogs}
                    disabled={isRefreshing}
                    className="flex items-center justify-center gap-2 text-[10px] bg-white border border-slate-200 px-4 py-2 rounded-xl text-indigo-600 font-black hover:bg-slate-50 hover:shadow-md transition-all active:scale-95 disabled:opacity-50 shadow-sm"
                >
                    <RefreshCw size={12} className={isRefreshing ? "animate-spin" : ""} />
                    {isRefreshing ? 'MEMPERBARUI...' : 'REFRESH DATA'}
                </button>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                <div
                    onClick={() => {
                        const pclTerfilterKec = selectedKecamatan
                            ? masterPclList.filter(p => ekstrakKodeKecPetugas(p.kecamatan_tugas) === selectedKecamatan)
                            : masterPclList;

                        setDataModalMetrik({
                            judul: `Pemantauan Aktivitas Harian PPL ${selectedKecamatan ? `Kec. ${namaKecamatanTerpilihText}` : '(Kabupaten)'}`,
                            role: 'PPL',
                            tipeStatus: 'DYNAMIC',
                            listPetugas: pclTerfilterKec
                        });
                        setModalMetrikActiveTab('AKTIF');
                        setModalMetrikPage(1);
                        setModalMetrikSearch('');
                        setShowModalMetrik(true);
                    }}
                    className="bg-gradient-to-br from-white to-slate-50 p-4 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all cursor-pointer select-none active:scale-98 flex flex-col justify-between"
                >
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-tight">PPL Jalan Lapangan</div>
                            <div className={`text-[8px] px-1.5 py-0.5 rounded-md font-bold border ${isHariIni ? 'bg-indigo-50 border-indigo-100 text-indigo-600' : 'bg-slate-100 border-slate-200 text-slate-500'}`}>
                                {labelTanggal}
                            </div>
                        </div>
                        <div className="flex items-baseline justify-between mt-1">
                            <div className="text-xl font-black text-slate-800">
                                {filteredMetrics.pclAktifHariIni}
                                <span className="text-xs font-normal text-slate-400 ml-1">/{filteredMetrics.totalPcl} PPL</span>
                            </div>
                            <div className="text-sm font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-100">
                                {filteredMetrics.totalPcl > 0 ? Math.round((filteredMetrics.pclAktifHariIni / filteredMetrics.totalPcl) * 100) : 0}%
                            </div>
                        </div>
                        <div className="w-full bg-slate-100 h-1.5 mt-3 rounded-full overflow-hidden">
                            <div className="bg-gradient-to-r from-indigo-500 to-indigo-600 h-full transition-all" style={{ width: `${filteredMetrics.totalPcl > 0 ? (filteredMetrics.pclAktifHariIni / filteredMetrics.totalPcl) * 100 : 0}%` }}></div>
                        </div>
                    </div>
                    <div>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation(); 
                                if (typeof handleExportToExcel === 'function') handleExportToExcel('PPL');
                            }}
                            className="mt-3 w-full bg-indigo-600 hover:bg-indigo-700 text-white py-1 px-2 rounded-lg text-[9px] font-black uppercase flex items-center justify-center gap-1 shadow-xs transition-colors cursor-pointer"
                        >
                            <Download size={10} /> Export Excel PPL
                        </button>
                        <div className="text-[7.5px] text-indigo-500 font-bold mt-1.5 text-right uppercase tracking-wider">Klik untuk Lihat Petugas ↗</div>
                    </div>
                </div>

                <div
                    onClick={() => {
                        const pmlTerfilterKec = selectedKecamatan
                            ? masterPmlList.filter(p => ekstrakKodeKecPetugas(p.kecamatan_tugas) === selectedKecamatan)
                            : masterPmlList;

                        setDataModalMetrik({
                            judul: `Pemantauan Aktivitas Harian PML ${selectedKecamatan ? `Kec. ${namaKecamatanTerpilihText}` : '(Kabupaten)'}`,
                            role: 'PML',
                            tipeStatus: 'DYNAMIC',
                            listPetugas: pmlTerfilterKec
                        });
                        setModalMetrikActiveTab('AKTIF');
                        setModalMetrikPage(1);
                        setModalMetrikSearch('');
                        setShowModalMetrik(true);
                    }}
                    className="bg-gradient-to-br from-white to-slate-50 p-4 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all cursor-pointer select-none active:scale-98 flex flex-col justify-between"
                >
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <div className="text-[10px] font-bold text-slate-400 tracking-tight uppercase">PML Jalan Lapangan</div>
                            <div className={`text-[8px] px-1.5 py-0.5 rounded-md font-bold border ${isHariIni ? 'bg-indigo-50 border-indigo-100 text-indigo-600' : 'bg-slate-100 border-slate-200 text-slate-500'}`}>
                                {labelTanggal}
                            </div>
                        </div>
                        <div className="flex items-baseline justify-between mt-1">
                            <div className="text-xl font-black text-indigo-600">
                                {filteredMetrics.pmlAktifHariIni}
                                <span className="text-xs font-normal text-slate-400 ml-1">/{filteredMetrics.totalPml} PML</span>
                            </div>
                            <div className="text-sm font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-100">
                                {filteredMetrics.totalPml > 0 ? Math.round((filteredMetrics.pmlAktifHariIni / filteredMetrics.totalPml) * 100) : 0}%
                            </div>
                        </div>
                        <div className="w-full bg-slate-100 h-1.5 mt-3 rounded-full overflow-hidden">
                            <div className="bg-gradient-to-r from-indigo-500 to-indigo-600 h-full transition-all" style={{ width: `${filteredMetrics.totalPml > 0 ? (filteredMetrics.pmlAktifHariIni / filteredMetrics.totalPml) * 100 : 0}%` }}></div>
                        </div>
                    </div>

                    <div>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                if (typeof handleExportToExcel === 'function') handleExportToExcel('PML');
                            }}
                            className="mt-3 w-full bg-indigo-600 hover:bg-indigo-700 text-white py-1 px-2 rounded-lg text-[9px] font-black uppercase flex items-center justify-center gap-1 shadow-xs transition-colors cursor-pointer"
                        >
                            <Download size={10} /> Export Excel PML
                        </button>
                        <div className="text-[7.5px] text-indigo-500 font-bold mt-1.5 text-right uppercase tracking-wider">Klik untuk Lihat Petugas ↗</div>
                    </div>
                </div>

                <div
                    onClick={() => {
                        const pclStagnan = masterPclList.filter(p => p.isStagnan && (selectedKecamatan ? ekstrakKodeKecPetugas(p.kecamatan_tugas) === selectedKecamatan : true));
                        const pmlStagnan = masterPmlList.filter(p => p.isStagnan && (selectedKecamatan ? ekstrakKodeKecPetugas(p.kecamatan_tugas) === selectedKecamatan : true));

                        const rawPclMapped = pclStagnan.map(p => ({ ...p, posisi_tugas: 'PCL' }));
                        const rawPmlMapped = pmlStagnan.map(p => ({ ...p, posisi_tugas: 'PML' }));

                        setDataModalMetrik({
                            judul: `Daftar Petugas Stagnan ${selectedKecamatan ? `Kec. ${namaKecamatanTerpilihText}` : '(Kabupaten)'}`,
                            role: 'Gabungan',
                            tipeStatus: 'STAGNAN',
                            listPetugas: [...rawPclMapped, ...rawPmlMapped]
                        });
                        setModalMetrikPage(1);
                        setModalMetrikSearch('');
                        setShowModalMetrik(true);
                    }}
                    className="bg-gradient-to-br from-rose-50/50 to-rose-50 p-4 rounded-2xl border border-rose-100 shadow-sm hover:shadow-md hover:border-rose-300 transition-all cursor-pointer select-none active:scale-98 flex flex-col justify-between"
                >
                    <div>
                        <div className="text-[10px] font-bold text-rose-600 uppercase tracking-tight mb-1">Total Petugas Tidak Aktif</div>
                        <div className="flex items-baseline justify-between mt-1">
                            <div className="text-xl font-black text-rose-600">
                                {filteredMetrics.totalStagnan}
                                <span className="text-xs font-normal text-rose-400 ml-1"> Orang</span>
                            </div>
                            <div className="text-xs font-bold text-rose-600 bg-rose-100/50 px-2 py-0.5 rounded-lg border border-rose-200">
                                {((filteredMetrics.totalPcl + filteredMetrics.totalPml) > 0) ? Math.round((filteredMetrics.totalStagnan / (filteredMetrics.totalPcl + filteredMetrics.totalPml)) * 100) : 0}%
                            </div>
                        </div>
                        <div className="text-[9px] text-rose-400 font-bold mt-2 flex items-center gap-1">
                            <AlertTriangle size={10} /> Tidak kirim absen lapangan &gt;= 3 hari.
                        </div>
                    </div>

                    <div>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation(); 
                                if (typeof handleExportToExcel === 'function') handleExportToExcel('STAGNAN');
                            }}
                            className="mt-3 w-full bg-rose-600 hover:bg-rose-700 text-white py-1 px-2 rounded-lg text-[9px] font-black uppercase flex items-center justify-center gap-1 shadow-xs transition-colors cursor-pointer"
                        >
                            <Download size={10} /> Export Daftar Stagnan
                        </button>
                        <div className="text-[7.5px] text-rose-500 font-bold mt-1.5 text-right uppercase tracking-wider">Lihat Petugas ↗</div>
                    </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div className="w-full">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-2">Filter Kecamatan</div>
                        <select
                            className="w-full text-xs font-black text-indigo-600 uppercase bg-indigo-50 px-3 py-2 rounded-xl border border-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer transition-shadow"
                            value={selectedKecamatan || ''}
                            onChange={(e) => {
                                const val = e.target.value === '' ? null : e.target.value;
                                setSelectedKecamatan(val);
                                setSelectedKecTab(val ? val : "SEMUA");
                                setSelectedPetugas(null);
                                if (typeof setTableCurrentPage === 'function') setTableCurrentPage(1);
                            }}
                        >
                            <option value="">Semua Kecamatan (Kab. Boyolali)</option>
                            {daftarKecamatan.map((kec) => (
                                <option key={kec.kode} value={kec.kode}>{kec.label}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between overflow-hidden">
                    <div className="flex justify-between items-center mb-4">
                        <div>
                            <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider">Petugas Aktif per Kecamatan</h3>
                            <p className="text-[10px] text-slate-400 font-bold mt-0.5">Persentase petugas aktif lapangan pada tanggal terpilih</p>
                        </div>
                        {selectedKecamatan && (
                            <button onClick={() => { setSelectedKecamatan(null); setSelectedKecTab("SEMUA"); setSelectedPetugas(null); }} className="text-[9px] uppercase font-black bg-rose-50 text-rose-600 px-3 py-1.5 rounded-lg border border-rose-100 flex items-center gap-1 transition hover:bg-rose-100 hover:shadow-sm">
                                <X size={10} /> Clear Filter
                            </button>
                        )}
                    </div>
                    <div className="w-full overflow-x-auto overflow-y-hidden scrollbar-thin">
                        <div className="h-60 w-full min-w-[500px] md:min-w-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={kecamatanChartData}
                                    onClick={(e) => {
                                        if (e && e.activePayload && e.activePayload[0]) {
                                            const payloadData = e.activePayload[0].payload;
                                            setSelectedKecamatan(payloadData.kode);
                                            setSelectedKecTab(payloadData.kode);
                                            setSelectedPetugas(null);
                                        }
                                    }}
                                    margin={{ bottom: 35 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={8} tickLine={false} angle={-45} textAnchor="end" interval={0} height={45} tick={{ fontWeight: 700 }} />
                                    <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} unit="%" domain={[0, 100]} />
                                    <Tooltip
                                        cursor={{ fill: '#f8fafc', opacity: 0.4 }}
                                        content={({ active, payload }) => {
                                            if (active && payload && payload.length) {
                                                const data = payload[0].payload;
                                                return (
                                                    <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xl text-[11px] space-y-1.5 font-sans min-w-[160px] z-50">
                                                        <div className="font-black text-slate-800 uppercase tracking-wide border-b border-slate-100 pb-1 flex items-center gap-1 font-mono">
                                                            📍 {data.name}
                                                        </div>
                                                        <div className="space-y-1 font-semibold text-slate-500">
                                                            <div className="flex justify-between items-center gap-4">
                                                                <span className="flex items-center gap-1">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-[#6366f1]"></span> PPL Aktif:
                                                                </span>
                                                                <strong className="text-indigo-600 font-mono">
                                                                    {data.pclAktif} / {data.pclTotal} <span className="text-[9px] font-normal text-slate-400 font-sans">Org</span>
                                                                </strong>
                                                            </div>
                                                            <div className="flex justify-between items-center gap-4">
                                                                <span className="flex items-center gap-1">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-[#10b981]"></span> PML Aktif:
                                                                </span>
                                                                <strong className="text-emerald-600 font-mono">
                                                                    {data.pmlAktif} / {data.pmlTotal} <span className="text-[9px] font-normal text-slate-400 font-sans">Org</span>
                                                                </strong>
                                                            </div>
                                                        </div>
                                                        <div className="border-t border-slate-100 pt-1 text-[8px] text-slate-400 font-bold uppercase flex justify-between tracking-tight">
                                                            <span>Rasio Capaian:</span>
                                                            <span>PPL {data['PCL Aktif (%)']}% | PML {data['PML Aktif (%)']}%</span>
                                                        </div>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        }}
                                    />
                                    <Legend wrapperStyle={{ fontSize: '9px' }} verticalAlign="top" align="right" />
                                    <Bar dataKey="PCL Aktif (%)" fill="#6366f1" radius={[3, 3, 0, 0]} barSize={10} cursor="pointer" />
                                    <Bar dataKey="PML Aktif (%)" fill="#10b981" radius={[3, 3, 0, 0]} barSize={10} cursor="pointer" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
                    <div className="flex justify-between items-center mb-4">
                        <div>
                            <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider">
                                Tren Keaktifan Petugas {namaKecamatanTerpilihText ? `Kec. ${namaKecamatanTerpilihText}` : '(Kabupaten)'}
                            </h3>
                        </div>
                        {selectedKecamatan && (
                            <span className="text-[8px] font-black uppercase bg-indigo-50 text-indigo-600 px-2 py-1 rounded-md border border-indigo-100/60 shadow-sm">Terfilter Spasial</span>
                        )}
                    </div>
                    <div className="h-60 w-full mt-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart
                                syncId="trenKeaktifan"
                                data={trendChartData.slice(-7)}
                                margin={{ bottom: 5, left: -10, right: 10 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="tanggalLabel" stroke="#94a3b8" fontSize={9} tickLine={false} tick={{ fontWeight: 600 }} />
                                <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} unit="%" domain={[0, 100]} />
                                <Tooltip
                                    cursor={{ stroke: '#6366f1', strokeWidth: 2, strokeDasharray: '4 4' }}
                                    contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '11px', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                />
                                <Legend wrapperStyle={{ fontSize: '9px' }} verticalAlign="top" align="right" />
                                <Line
                                    type="monotone"
                                    dataKey="PCL Aktif (%)"
                                    stroke="#6366f1"
                                    strokeWidth={3}
                                    dot={{ r: 6, strokeWidth: 2, fill: '#fff', cursor: 'pointer' }}
                                    activeDot={{ r: 8, strokeWidth: 0, cursor: 'pointer' }}
                                    onClick={(data) => {
                                        if (data && data.payload) {
                                            setSelectedFilterDate(data.payload.rawDate);
                                            setSelectedPetugas(null);
                                        }
                                    }}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="PML Aktif (%)"
                                    stroke="#10b981"
                                    strokeWidth={3}
                                    dot={{ r: 6, strokeWidth: 2, fill: '#fff', cursor: 'pointer' }}
                                    activeDot={{ r: 8, strokeWidth: 0, cursor: 'pointer' }}
                                    onClick={(data) => {
                                        if (data && data.payload) {
                                            setSelectedFilterDate(data.payload.rawDate);
                                            setSelectedPetugas(null);
                                        }
                                    }}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            <div className="p-3 bg-white border border-slate-200 rounded-2xl flex flex-col lg:flex-row gap-3 justify-between items-center mb-4 shadow-sm">
                <div className="flex bg-slate-100 p-1.5 rounded-xl w-full lg:w-auto gap-1">
                    {['PCL', 'PML'].map((role) => (
                        <button key={role} onClick={() => { setActiveTab(role); setSelectedPetugas(null); }} className={`text-[11px] uppercase font-black px-6 py-2 rounded-lg tracking-wider flex-1 lg:flex-none transition-all duration-200 ${activeTab === role ? 'bg-white text-indigo-600 shadow-sm border border-slate-200' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-200/50'}`}>
                            {role === 'PCL' ? '👥 PPL' : '👔 PML'}
                        </button>
                    ))}
                </div>

                <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto items-center flex-1 lg:justify-end">
                    <div className="relative w-full sm:w-56">
                        <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
                        <input type="text" placeholder={`Cari nama / email ${activeTab}...`} value={searchInputValue} onChange={(e) => setSearchInputValue(e.target.value)} className="w-full bg-slate-50 text-xs border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-slate-700 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-shadow" />
                    </div>

                    <div className="relative w-full sm:w-40 group">
                        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                            <Calendar size={13} className="text-indigo-500" />
                        </div>
                        <input
                            type="date"
                            value={selectedFilterDate}
                            onChange={(e) => {
                                setSelectedFilterDate(e.target.value);
                                setSelectedPetugas(null);
                            }}
                            className="w-full bg-indigo-50 text-xs border border-indigo-100 rounded-xl pl-9 pr-3 py-2.5 text-indigo-700 font-bold focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 cursor-pointer transition-shadow"
                        />
                    </div>

                    <div className="flex bg-slate-100 p-1.5 rounded-xl border border-slate-200 w-full sm:w-auto gap-1">
                        {['all', 'stagnan', 'aktif'].map((st) => (
                            <button key={st} onClick={() => setFilterStatus(st)} className={`text-[10px] uppercase font-black px-4 py-1.5 rounded-lg flex-1 sm:flex-none transition-all ${filterStatus === st ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-200/50'}`}>
                                {st === 'all' ? 'Semua' : st}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
                <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm w-full">
                    {(() => {
                        const totalItems = filteredList.length;
                        const totalPages = Math.ceil(totalItems / tableItemsPerPage) || 1;
                        const indexOfLastItem = tableCurrentPage * tableItemsPerPage;
                        const indexOfFirstItem = indexOfLastItem - tableItemsPerPage;
                        const currentTableItems = filteredList.slice(indexOfFirstItem, indexOfLastItem);

                        return (
                            <>
                                <div className="overflow-x-auto w-full">
                                    <table className="w-full text-left border-collapse table-auto">
                                        <thead>
                                            <tr className="border-b border-slate-200 bg-slate-50 text-[10px] text-slate-400 uppercase font-black tracking-wider">
                                                <th className="p-4">Profil Petugas ({activeTab})</th>
                                                <th className="p-4">Kecamatan Tugas</th>
                                                <th className="p-4">Status Tgl {selectedFilterDate.slice(8, 10)}/{selectedFilterDate.slice(5, 7)}</th>
                                                <th className="p-4">History Absensi</th>
                                                <th className="p-4 text-right">Aksi</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                                            {currentTableItems.length === 0 ? (
                                                <tr>
                                                    <td colSpan="5" className="p-12 text-center text-slate-400 bg-white">
                                                        <div className="flex flex-col items-center justify-center gap-2">
                                                            <UserX size={32} className="text-slate-200" />
                                                            <span className="text-[11px] font-bold uppercase tracking-wider">Tidak ada data petugas pada kriteria & tanggal ini.</span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ) : (
                                                currentTableItems.map((petugas) => {
                                                    const tidakAktif = petugas.statusHariIni === 'ABSEN' || petugas.statusHariIni === 'STAGNAN';
                                                    return (
                                                        <tr
                                                            key={petugas.email}
                                                            className={`transition-colors cursor-pointer ${selectedPetugas?.email === petugas.email ? 'bg-indigo-50/60 border-l-4 border-l-indigo-600' : tidakAktif ? 'bg-slate-50/50 hover:bg-slate-100/70 border-l-4 border-l-transparent' : 'bg-white hover:bg-slate-50 border-l-4 border-l-transparent'}`}
                                                            // Cari baris onClick tabel yang menetapkan setSelectedPetugas, ubah menjadi:
onClick={() => {
    setSelectedPetugas(petugas);
    // Otomatis set kalender ke bulan sesuai filter date yang sedang aktif di dashboard
    const [fYear, fMonth] = selectedFilterDate.split('-');
    setCurrentCalMonth(new Date(parseInt(fYear, 10), parseInt(fMonth, 10) - 1, 1));
}}
                                                        >
                                                            <td className="p-3 pl-4">
                                                                <div className={`text-xs ${tidakAktif ? 'text-slate-500 font-semibold' : 'font-black text-slate-800'}`}>{petugas.nama_petugas || 'Tanpa Nama'}</div>
                                                                <div className="text-[10px] text-slate-400 font-mono tracking-tight mt-0.5">{petugas.email}</div>
                                                            </td>
                                                            <td className="p-3 font-bold text-slate-600 flex items-center gap-1 mt-1.5">
                                                                <MapPin size={12} className="text-slate-400" /> {petugas.kecamatan_tugas || '-'}
                                                            </td>
                                                            <td className="p-3">
                                                                <span className={`inline-block text-[9px] font-black tracking-wider px-2 py-1 rounded-md ${petugas.statusHariIni === 'AKTIF' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : petugas.statusHariIni === 'STAGNAN' ? 'bg-rose-100 text-rose-700 border border-rose-200 animate-pulse' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
                                                                    {petugas.statusHariIni}
                                                                </span>
                                                            </td>
                                                            <td className="p-3">
                                                                <div className="flex flex-col gap-1.5">
                                                                    <MiniCalendar arrayTanggalAktif={petugas.rawLogs.map(l => l.tanggal)} />
                                                                    <div className="flex items-center gap-2">
                                                                        <span className={`font-mono text-[10px] ${tidakAktif ? 'text-slate-400' : 'text-slate-600 font-bold'}`}>
                                                                            {petugas.terakhirAktivitas}
                                                                        </span>
                                                                        {petugas.isStagnan && (
                                                                            <span className="text-[9px] text-rose-500 font-bold flex items-center gap-0.5">
                                                                                <AlertTriangle size={9} /> {petugas.hariSifatStagnan}d
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="p-3 text-right pr-4">
                                                                <button className="text-[10px] text-indigo-600 bg-indigo-50 hover:bg-indigo-600 hover:text-white font-bold px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 transition-colors">
                                                                    Detail <ArrowRight size={10} />
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="bg-white p-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px]">
                                    <span className="font-bold text-slate-400 uppercase tracking-wider">
                                        Halaman {tableCurrentPage} dari {totalPages}
                                        <span className="font-medium font-mono text-slate-300 ml-1">
                                            ({totalItems} Total Petugas Terfilter)
                                        </span>
                                    </span>

                                    <div className="flex gap-2 w-full sm:w-auto justify-end">
                                        <button
                                            type="button"
                                            disabled={tableCurrentPage === 1}
                                            onClick={() => {
                                                setTableCurrentPage(prev => Math.max(prev - 1, 1));
                                                setSelectedPetugas(null); 
                                            }}
                                            className="bg-slate-100 hover:bg-slate-200 disabled:opacity-30 disabled:pointer-events-none text-slate-700 font-black px-4 py-2 rounded-xl transition-all active:scale-95 flex-1 sm:flex-none text-center"
                                        >
                                            Sebelumnya
                                        </button>
                                        <button
                                            type="button"
                                            disabled={tableCurrentPage === totalPages}
                                            onClick={() => {
                                                setTableCurrentPage(prev => Math.min(prev + 1, totalPages));
                                                setSelectedPetugas(null); 
                                            }}
                                            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-30 disabled:pointer-events-none text-white font-black px-4 py-2 rounded-xl transition-all shadow-md active:scale-95 flex-1 sm:flex-none text-center"
                                        >
                                            Berikutnya
                                        </button>
                                    </div>
                                </div>
                            </>
                        );
                    })()}
                </div>

                <div className="bg-white rounded-3xl border border-slate-200 p-5 sticky top-4 shadow-sm lg:col-span-1 min-h-[400px]">
                    {selectedPetugas ? (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                            <div className="flex items-start gap-3 border-b border-slate-100 pb-4 mb-4">
                                <div className="p-3 bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-2xl border border-indigo-200 text-indigo-600 shadow-sm"><User size={20} /></div>
                                <div className="overflow-hidden">
                                    <span className="text-[9px] font-black bg-indigo-600 text-white px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-sm">{selectedPetugas.posisi_tugas}</span>
                                    <div className="text-sm font-black text-slate-800 uppercase tracking-wide truncate mt-1.5">{selectedPetugas.nama_petugas}</div>
                                    <div className="text-[10px] text-slate-400 font-mono truncate">{selectedPetugas.email}</div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="bg-gradient-to-br from-slate-50 to-white p-3 rounded-2xl border border-slate-100 text-center shadow-sm">
                                        <span className="text-[9px] text-slate-400 uppercase block font-bold">Submit Log</span>
                                        <span className="text-lg font-black text-slate-700 mt-1 block font-mono">{selectedPetugas.totalInput} <span className="text-[9px] text-slate-400 font-sans uppercase">Kali</span></span>
                                    </div>
                                    <div className="bg-gradient-to-br from-slate-50 to-white p-3 rounded-2xl border border-slate-100 text-center shadow-sm">
                                        <span className="text-[9px] text-slate-400 uppercase block font-bold">Cakupan Wilayah</span>
                                        <span className="text-lg font-black text-slate-700 mt-1 block font-mono">{selectedPetugas.totalSlsDisentuh} <span className="text-[9px] text-slate-400 font-sans uppercase">SLS</span></span>
                                    </div>
                                </div>

{/* ─── 📅 KALENDER PRESENSI LAPANGAN DENGAN NAVIGASI MANDIRI (ZERO EGRESS) ─── */}
<div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
    <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
        <span className="text-[10px] text-slate-500 uppercase font-black flex items-center gap-1.5">
            <Calendar size={13} className="text-indigo-500" /> Presensi Lapangan
        </span>
        
        {/* Tombol Navigasi Bulan */}
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200/60 p-0.5 rounded-lg">
            <button 
                type="button"
                onClick={() => setCurrentCalMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                className="text-[10px] font-black w-4 h-4 rounded-md hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors select-none"
            >
                ‹
            </button>
            <span className="text-[9px] font-black uppercase text-indigo-600 font-mono tracking-tight min-w-[75px] text-center">
                {currentCalMonth.toLocaleString('id-ID', { month: 'short', year: 'numeric' })}
            </span>
            <button 
                type="button"
                onClick={() => setCurrentCalMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                className="text-[10px] font-black w-4 h-4 rounded-md hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors select-none"
            >
                ›
            </button>
        </div>
    </div>

    <div className="grid grid-cols-7 gap-1.5 text-center text-[9px] font-black text-slate-400 uppercase mb-2">
        <div>S</div><div>S</div><div>R</div><div>K</div><div>J</div><div>S</div><div>M</div>
    </div>
    
    <div className="grid grid-cols-7 gap-1.5 text-center">
        {(() => {
            const targetYear = currentCalMonth.getFullYear();
            const targetMonth = currentCalMonth.getMonth(); // Index 0-11

            // 1. Hitung baris kosong (offset awal minggu)
            const dayOfWeekIndex = new Date(targetYear, targetMonth, 1).getDay();
            const startDayOffset = dayOfWeekIndex === 0 ? 6 : dayOfWeekIndex - 1;

            // 2. Hitung total hari dalam bulan terpilih
            const totalDaysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();

            const calendarCells = [];

            // Render padding awal bulan
            for (let i = 0; i < startDayOffset; i++) {
                calendarCells.push(<div key={`blank-${i}`} className="h-6"></div>);
            }

            // Render hari-hari aktif murni hasil komparasi data lokal
            for (let dateNum = 1; dateNum <= totalDaysInMonth; dateNum++) {
                const stringTanggalLoop = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(dateNum).padStart(2, '0')}`;
                
                // Cari apakah ada data checkin petugas di tanggal YYYY-MM-DD ini
                const isPetugasAktif = selectedPetugas.rawLogs?.some(l => l.tanggal === stringTanggalLoop);
                
                // Deteksi hari ini real-time
                const jktNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
                const tglSistemHariIni = `${jktNow.getFullYear()}-${String(jktNow.getMonth() + 1).padStart(2, '0')}-${String(jktNow.getDate()).padStart(2, '0')}`;
                const isHariIni = stringTanggalLoop === tglSistemHariIni;

                let dateBg = "bg-slate-50 text-slate-400 border border-slate-100 hover:bg-slate-100";
                
                if (isPetugasAktif) {
                    dateBg = "bg-gradient-to-br from-emerald-400 to-emerald-500 text-white font-black shadow-md shadow-emerald-200 border-none";
                } else if (isHariIni) {
                    dateBg = "bg-rose-50 text-rose-600 border border-rose-200 font-extrabold ring-1 ring-rose-200";
                }

                calendarCells.push(
                    <div 
                        key={`date-${dateNum}`} 
                        title={isPetugasAktif ? `Aktif` : isHariIni ? 'Hari Ini' : ''}
                        className={`h-6 w-full mx-auto rounded-lg text-[10px] flex items-center justify-center transition-all select-none cursor-default ${dateBg}`}
                    >
                        {dateNum}
                    </div>
                );
            }

            return calendarCells;
        })()}
    </div>
</div>

                                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                                    <span className="text-[10px] text-slate-500 uppercase block font-black flex items-center gap-1.5 border-b border-slate-100 pb-2">
                                        <span>📸</span> Galeri Bukti Lapangan (3 Hari Terakhir)
                                    </span>

                                    {(() => {
                                        const grupFotoPerHari = {};
                                        (selectedPetugas.rawLogs || []).forEach(log => {
                                            if (log.foto_bukti) {
                                                if (!grupFotoPerHari[log.tanggal]) {
                                                    grupFotoPerHari[log.tanggal] = [];
                                                }
                                                grupFotoPerHari[log.tanggal].push(log);
                                            }
                                        });

                                        const urutanHariTerakhir = Object.keys(grupFotoPerHari)
                                            .sort((a, b) => new Date(b) - new Date(a))
                                            .slice(0, 3);

                                        if (urutanHariTerakhir.length === 0) {
                                            return (
                                                <div className="text-[10px] text-slate-400 p-4 text-center font-bold bg-slate-50 rounded-xl border border-dashed border-slate-200">
                                                    Belum ada unggahan foto bukti lapangan.
                                                </div>
                                            );
                                        }

                                        const isSelectedPml = selectedPetugas.posisi_tugas === 'PML';

                                        return (
                                            <div className="space-y-5">
                                                {urutanHariTerakhir.map((tanggal, indexHari) => {
                                                    const listLogHariIni = grupFotoPerHari[tanggal];
                                                    const tglObj = new Date(tanggal);
                                                    const tglFormatted = tglObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

                                                    return (
                                                        <div key={tanggal} className={`space-y-3 ${indexHari > 0 ? "border-t border-slate-100 pt-4" : ""}`}>
                                                            <div className="flex justify-between items-center">
                                                                <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md font-mono">
                                                                    📅 {tglFormatted}
                                                                </span>
                                                                <span className="text-[9px] font-medium text-slate-400 uppercase">
                                                                    {listLogHariIni.length} Laporan
                                                                </span>
                                                            </div>

                                                            <div className={`grid gap-3 ${listLogHariIni.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                                                                {listLogHariIni.map((log, idxFoto) => {
                                                                    const linkOriginal = log.foto_bukti;
                                                                    const urlEmbedPreview = konversiLinkDrive(linkOriginal);

                                                                    const detailSls = slsMap && typeof slsMap.get === 'function' ? slsMap.get(log.idsubsls) : null;
                                                                    const namaSls = detailSls?.nmsls || "Memuat Nama SLS...";
                                                                    const namaDesa = detailSls?.nmdesa || "Memuat Desa...";
                                                                    const namaPplDidampingi = detailSls?.petugas?.nama_petugas || "Tidak Ter-assign";

                                                                    return (
                                                                        <div key={idxFoto} className="bg-slate-50 border border-slate-200/60 p-2 rounded-xl flex flex-col justify-between shadow-2xs hover:shadow-xs transition-shadow">
                                                                            <div className="space-y-1.5">
                                                                                <div className="relative aspect-video rounded-lg overflow-hidden border border-slate-200 bg-slate-100">
                                                                                    <iframe
                                                                                        src={urlEmbedPreview}
                                                                                        className="w-full h-full border-none pointer-events-none"
                                                                                        title={`Bukti ${tanggal} - ${idxFoto}`}
                                                                                        allow="autoplay"
                                                                                        loading="lazy"
                                                                                    />
                                                                                    <div className="absolute inset-0 bg-transparent cursor-default"></div>
                                                                                </div>

                                                                                <div className="space-y-0.5 px-0.5">
                                                                                    <div className="text-[10px] font-black text-slate-800 tracking-tight leading-tight truncate uppercase">
                                                                                        {namaSls}
                                                                                    </div>
                                                                                    <div className="text-[8px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-0.5">
                                                                                        <span>📍</span> Desa {namaDesa}
                                                                                    </div>

                                                                                    {isSelectedPml && (
                                                                                        <div className="text-[8px] font-black text-indigo-600 bg-indigo-50/70 border border-indigo-100/50 px-1.5 py-0.5 rounded-md mt-1 truncate uppercase tracking-tight flex items-center gap-1">
                                                                                            <span>PPL yang Didampingi:</span> {namaPplDidampingi}
                                                                                        </div>
                                                                                    )}

                                                                                    <div className="text-[7.5px] font-mono text-slate-400 block truncate pt-0.5">
                                                                                        ID: {log.idsubsls}
                                                                                    </div>
                                                                                </div>
                                                                            </div>

                                                                            <div className="text-right pt-2 border-t border-slate-100 mt-2">
                                                                                <a
                                                                                    href={linkOriginal}
                                                                                    target="_blank"
                                                                                    rel="noopener noreferrer"
                                                                                    className="text-[8px] font-black text-indigo-600 hover:text-indigo-800 transition-colors uppercase tracking-tight"
                                                                                >
                                                                                    Drive Link ↗
                                                                                </a>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })()}
                                </div>

                                <div className="bg-indigo-50/50 p-3 rounded-xl border border-indigo-100/50 flex items-center gap-3">
                                    <div className="p-1.5 bg-white rounded-lg shadow-sm text-indigo-500"><MapPin size={14} /></div>
                                    <div>
                                        <span className="text-[9px] text-slate-400 uppercase block font-bold mb-0.5">Kecamatan Penugasan</span>
                                        <span className="text-xs font-black text-slate-700">Kecamatan {selectedPetugas.kecamatan_tugas || '-'}</span>
                                    </div>
                                </div>

                                <div>
                                    <span className="text-[10px] text-slate-500 uppercase font-black tracking-wider block mb-2 flex items-center gap-1.5 border-b border-slate-100 pb-2">
                                        <ShieldAlert size={12} className="text-slate-400" /> Daftar SLS Dikerjakan
                                    </span>
                                    <div className="max-h-40 overflow-y-auto space-y-1.5 bg-slate-50/50 p-1.5 rounded-xl border border-slate-100 scrollbar-thin">
                                        {selectedPetugas.daftarSls.length === 0 ? (
                                            <div className="text-[10px] text-slate-400 p-4 text-center font-bold">
                                                Belum ada jejak SLS di sistem.
                                            </div>
                                        ) : (
                                            selectedPetugas.rawLogs && (() => {
                                                const uniqueIds = Array.from(new Set(selectedPetugas.rawLogs.map(l => l.idsubsls)));

                                                return uniqueIds.map((id) => {
                                                    const detailSls = slsMap && typeof slsMap.get === 'function' ? slsMap.get(id) : null;
                                                    const namaSls = detailSls?.nmsls || "Nama SLS Tidak Ditemukan";
                                                    const namaDesa = detailSls?.nmdesa || "-";

                                                    return (
                                                        <div key={id} className="text-[10px] bg-white border border-slate-200 p-2.5 rounded-lg flex flex-col shadow-sm hover:shadow-md transition-shadow">
                                                            <span className="font-bold text-indigo-700">{namaSls}</span>
                                                            <span className="text-[9px] font-bold text-slate-400 mt-0.5">Desa {namaDesa}</span>
                                                            <span className="text-[8px] font-mono text-slate-300 mt-0.5">ID: {id}</span>
                                                        </div>
                                                    );
                                                });
                                            })()
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 gap-3 py-10 opacity-60">
                            <div className="p-4 bg-slate-50 rounded-full border border-slate-100">
                                <User size={32} className="text-slate-300" />
                            </div>
                            <div>
                                <p className="text-[11px] uppercase font-black tracking-wider text-slate-600 mb-1">Pilih Petugas</p>
                                <p className="text-[10px] text-slate-400 max-w-[200px] leading-relaxed">Klik salah satu baris di tabel kiri untuk melihat rincian operasional harian.</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {showDetailEvaluasi && (() => {
                const petugasTerfilter = selectedKecamatan
                    ? rawPetugas.filter(p => p.posisi_tugas === 'PML' && ekstrakKodeKecPetugas(p.kecamatan_tugas) === selectedKecamatan)
                    : rawPetugas.filter(p => p.posisi_tugas === 'PML');

                const emailSudahKirimSet = new Set(dataEvaluasiTerpilih.listLaporan.map(l => l.pml_email.toLowerCase().trim()));

                const pmlSudahKirim = dataEvaluasiTerpilih.listLaporan.filter(l =>
                    petugasTerfilter.some(p => p.email.toLowerCase().trim() === l.pml_email.toLowerCase().trim())
                );

                const pmlBelumKirimRaw = petugasTerfilter.filter(p => !emailSudahKirimSet.has(p.email.toLowerCase().trim()));

                const pmlBelumKirim = pmlBelumKirimRaw.sort((a, b) => {
                    const kecA = a.kecamatan_tugas || '999 KOSONG';
                    const kecB = b.kecamatan_tugas || '999 KOSONG';
                    return kecA.localeCompare(kecB, 'id', { numeric: true });
                });

                const listSesuaiTab = evalActiveFilter === 'SUDAH' ? pmlSudahKirim : pmlBelumKirim;
                const listTerfilterFinal = listSesuaiTab.filter(item => {
                    const emailToSearch = evalActiveFilter === 'SUDAH' ? item.pml_email : item.email;
                    const namaToSearch = evalActiveFilter === 'SUDAH' ? '' : (item.nama_petugas || '');
                    return emailToSearch.toLowerCase().includes(evalSearchTerm.toLowerCase()) ||
                        namaToSearch.toLowerCase().includes(evalSearchTerm.toLowerCase());
                });

                const totalItems = listTerfilterFinal.length;
                const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
                const indexOfLastItem = evalCurrentPage * itemsPerPage;
                const indexOfFirstItem = indexOfLastItem - itemsPerPage;
                const currentItems = listTerfilterFinal.slice(indexOfFirstItem, indexOfLastItem);

                return (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
                        <div className="bg-slate-50 w-full max-w-xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden max-h-[85vh] flex flex-col animate-scaleIn">

                            <div className="bg-white p-4 border-b border-slate-200 flex items-center justify-between shrink-0">
                                <div className="flex items-center gap-2">
                                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
                                    <div>
                                        <h3 className="text-xs font-black text-slate-800 uppercase tracking-wide">Rekap Evaluasi Masalah & Solusi</h3>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">Tanggal: {dataEvaluasiTerpilih.tanggal}</p>
                                    </div>
                                </div>
                                <button onClick={() => setShowDetailEvaluasi(false)} className="text-[10px] font-black bg-slate-100 hover:bg-rose-500 hover:text-white text-slate-500 w-6 h-6 rounded-xl transition-all flex items-center justify-center shadow-xs">✕</button>
                            </div>

                            <div className="grid grid-cols-2 gap-2 p-3 bg-white border-b border-slate-100 shrink-0">
                                <button type="button" onClick={() => { setEvalActiveFilter('SUDAH'); setEvalCurrentPage(1); }} className={`p-2 rounded-xl border text-center transition-all ${evalActiveFilter === 'SUDAH' ? 'bg-emerald-50 border-emerald-200 font-black text-emerald-700 shadow-xs ring-1 ring-emerald-300' : 'bg-slate-50 border-slate-200/60 text-slate-400 font-bold'}`}>
                                    <div className="text-[8px] uppercase tracking-wider">Sudah Kirim</div>
                                    <div className="text-sm font-mono mt-0.5">{pmlSudahKirim.length} TIM</div>
                                </button>
                                <button type="button" onClick={() => { setEvalActiveFilter('BELUM'); setEvalCurrentPage(1); }} className={`p-2 rounded-xl border text-center transition-all ${evalActiveFilter === 'BELUM' ? 'bg-rose-50 border-rose-200 font-black text-rose-700 shadow-xs ring-1 ring-rose-300' : 'bg-slate-50 border-slate-200/60 text-slate-400 font-bold'}`}>
                                    <div className="text-[8px] uppercase tracking-wider">Belum Laporan</div>
                                    <div className="text-sm font-mono mt-0.5">{pmlBelumKirim.length} TIM</div>
                                </button>
                            </div>

                            <div className="p-3 bg-white border-b border-slate-200 shrink-0">
                                <div className="relative">
                                    <Search className="absolute left-3 top-2.5 text-slate-400" size={12} />
                                    <input type="text" placeholder={`Cari dari ${listSesuaiTab.length} petugas di tab ini...`} value={evalSearchTerm} onChange={(e) => { setEvalSearchTerm(e.target.value); setEvalCurrentPage(1); }} className="w-full bg-slate-50 text-xs border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-slate-700 focus:outline-none focus:border-indigo-500" />
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50 scrollbar-thin">
                                {loadingDetailEval ? (
                                    <div className="h-40 flex flex-col justify-center items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-widest">
                                        <RefreshCw className="animate-spin text-emerald-500" size={16} />
                                        <span>Membaca Tabel Database...</span>
                                    </div>
                                ) : currentItems.length === 0 ? (
                                    <div className="text-center text-[10px] text-slate-400 font-bold py-12 bg-white rounded-2xl border border-dashed border-slate-200 shadow-2xs">Tidak ada data tim yang cocok dengan kata kunci pencarian.</div>
                                ) : (
                                    currentItems.map((item, idx) => {
                                        if (evalActiveFilter === 'SUDAH') {
                                            return (
                                                <div key={idx} className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-2xs space-y-3">
                                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 border-b border-slate-100 pb-2">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-5 h-5 rounded-full bg-slate-800 text-white flex items-center justify-center text-[9px] font-black uppercase font-mono">{item.nama_petugas.charAt(0)}</div>
                                                            <div>
                                                                <div className="text-[11px] font-black text-slate-800 uppercase tracking-wide">{item.nama_petugas}</div>
                                                                <div className="text-[9px] text-slate-400 font-mono tracking-tight">{item.pml_email}</div>
                                                            </div>
                                                        </div>
                                                        <span className="self-start sm:self-center text-[9px] font-black uppercase bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-lg border border-indigo-100 flex items-center gap-1 font-mono">
                                                            <MapPin size={10} className="text-indigo-400" /> {item.kecamatan_tugas}
                                                        </span>
                                                    </div>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[10px]">
                                                        <div className="bg-rose-50/50 border border-rose-100 p-2.5 rounded-xl space-y-0.5">
                                                            <span className="text-[8px] font-black text-rose-700 uppercase tracking-tight block">⚠️ Kendala Lapangan:</span>
                                                            <p className="font-semibold text-slate-700 leading-relaxed">{item.kendala_lapangan || '-'}</p>
                                                        </div>
                                                        <div className="bg-emerald-50/50 border border-emerald-100 p-2.5 rounded-xl space-y-0.5">
                                                            <span className="text-[8px] font-black text-emerald-700 uppercase tracking-tight block">💡 Solusi:</span>
                                                            <p className="font-semibold text-slate-700 leading-relaxed">{item.solusi_lapangan || '-'}</p>
                                                        </div>
                                                    </div>
                                                    {item.foto_evaluasi && item.foto_evaluasi !== "KOSONG_ATAU_OFFLINE" && (
                                                        <div className="pt-1 border-t border-slate-100 mt-1 flex justify-end">
                                                            <a href={item.foto_evaluasi} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[9px] font-black text-indigo-600 bg-indigo-50/60 hover:bg-indigo-100 px-2.5 py-1 rounded-lg border border-indigo-100 transition-all">Lihat Lampiran Foto Bukti Evaluasi ↗</a>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        } else {
                                            return (
                                                <div key={idx} className="bg-white border border-rose-100 rounded-2xl p-3.5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition-colors hover:bg-rose-50/20">
                                                    <div className="flex items-center gap-2 overflow-hidden">
                                                        <div className="w-5 h-5 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[9px] font-black uppercase font-mono shrink-0">{item.nama_petugas ? item.nama_petugas.charAt(0) : '👔'}</div>
                                                        <div className="overflow-hidden">
                                                            <div className="text-[11px] font-black text-slate-800 uppercase tracking-wide truncate">{item.nama_petugas || 'Tanpa Nama'}</div>
                                                            <div className="text-[9px] text-slate-400 font-mono truncate mt-0.5">{item.email}</div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 justify-between sm:justify-end shrink-0">
                                                        <span className="text-[8px] font-black uppercase bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md border border-slate-200/60 font-mono flex items-center gap-0.5">
                                                            <MapPin size={9} className="text-slate-400" /> {item.kecamatan_tugas || 'Belum Diatur'}
                                                        </span>
                                                        <span className="text-[8px] font-black uppercase text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200/40 tracking-tight">Belum Lapor</span>
                                                    </div>
                                                </div>
                                            );
                                        }
                                    })
                                )}
                            </div>

                            <div className="bg-white p-3 border-t border-slate-200 flex items-center justify-between shrink-0 text-[10px]">
                                <span className="font-bold text-slate-400 uppercase tracking-wider">Halaman {evalCurrentPage} / {totalPages} <span className="font-medium font-mono text-slate-300">({totalItems} data)</span></span>
                                <div className="flex gap-1.5">
                                    <button type="button" disabled={evalCurrentPage === 1} onClick={() => setEvalCurrentPage(prev => Math.max(prev - 1, 1))} className="bg-slate-100 hover:bg-slate-200 disabled:opacity-30 disabled:pointer-events-none text-slate-700 font-black px-3 py-1.5 rounded-xl transition-all">Sebelumnya</button>
                                    <button type="button" disabled={evalCurrentPage === totalPages} onClick={() => setEvalCurrentPage(prev => Math.min(prev + 1, totalPages))} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-30 disabled:pointer-events-none text-white font-black px-3 py-1.5 rounded-xl transition-all shadow-md">Berikutnya</button>
                                </div>
                            </div>

                        </div>
                    </div>
                );
            })()}

            {showDetailLapangan && (() => {
                const baseMasterPcl = selectedKecamatan
                    ? rawPetugas.filter(p => p.posisi_tugas === 'PCL' && ekstrakKodeKecPetugas(p.kecamatan_tugas) === selectedKecamatan)
                    : rawPetugas.filter(p => p.posisi_tugas === 'PCL');

                const setAktifHariIni = new Set(dataLapanganTerpilih.listPetugasAktif);

                const listAktif = baseMasterPcl.filter(p => setAktifHariIni.has(p.email.toLowerCase().trim()));
                const listAbsen = baseMasterPcl.filter(p => !setAktifHariIni.has(p.email.toLowerCase().trim()));

                const currentTabList = lapActiveFilter === 'AKTIF' ? listAktif : listAbsen;

                const filteredFinal = currentTabList.filter(p => {
                    const query = lapSearchTerm.toLowerCase();
                    return (p.nama_petugas || '').toLowerCase().includes(query) ||
                        p.email.toLowerCase().includes(query) ||
                        (p.kecamatan_tugas || '').toLowerCase().includes(query);
                });

                const sortedFinal = filteredFinal.sort((a, b) => {
                    const kecA = a.kecamatan_tugas || '999 KOSONG';
                    const kecB = b.kecamatan_tugas || '999 KOSONG';
                    return kecA.localeCompare(kecB, 'id', { numeric: true });
                });

                const totalItems = sortedFinal.length;
                const totalPages = Math.ceil(totalItems / lapItemsPerPage) || 1;
                const indexOfLastItem = lapCurrentPage * lapItemsPerPage;
                const indexOfFirstItem = indexOfLastItem - lapItemsPerPage;
                const currentItems = sortedFinal.slice(indexOfFirstItem, indexOfLastItem);

                return (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
                        <div className="bg-slate-50 w-full max-w-xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden max-h-[85vh] flex flex-col animate-scaleIn">

                            <div className="bg-white p-4 border-b border-slate-200 flex items-center justify-between shrink-0">
                                <div className="flex items-center gap-2">
                                    <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse"></div>
                                    <div>
                                        <h3 className="text-xs font-black text-slate-800 uppercase tracking-wide">Pemantauan Petugas Lapangan (PPL)</h3>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">Tanggal : {dataLapanganTerpilih.tanggalLabel}</p>
                                    </div>
                                </div>
                                <button onClick={() => setShowDetailLapangan(false)} className="text-[10px] font-black bg-slate-100 hover:bg-rose-500 hover:text-white text-slate-500 w-6 h-6 rounded-xl transition-all flex items-center justify-center shadow-xs">✕</button>
                            </div>

                            <div className="grid grid-cols-2 gap-2 p-3 bg-white border-b border-slate-100 shrink-0">
                                <button type="button" onClick={() => { setLapActiveFilter('AKTIF'); setLapCurrentPage(1); }} className={`p-2 rounded-xl border text-center transition-all ${lapActiveFilter === 'AKTIF' ? 'bg-indigo-50 border-indigo-200 font-black text-indigo-700 shadow-xs ring-1 ring-indigo-300' : 'bg-slate-50 border-slate-200/60 text-slate-400 font-bold'}`}>
                                    <div className="text-[8px] uppercase tracking-wider">Aktif Jalan Lapangan</div>
                                    <div className="text-sm font-mono mt-0.5">{listAktif.length} ORG</div>
                                </button>
                                <button type="button" onClick={() => { setLapActiveFilter('ABSEN'); setLapCurrentPage(1); }} className={`p-2 rounded-xl border text-center transition-all ${lapActiveFilter === 'ABSEN' ? 'bg-rose-50 border-rose-200 font-black text-rose-700 shadow-xs ring-1 ring-rose-300' : 'bg-slate-50 border-slate-200/60 text-slate-400 font-bold'}`}>
                                    <div className="text-[8px] uppercase tracking-wider">Tidak Aktif (Belum Absen Lapangan)</div>
                                    <div className="text-sm font-mono mt-0.5">{listAbsen.length} ORG</div>
                                </button>
                            </div>

                            <div className="p-3 bg-white border-b border-slate-200 shrink-0">
                                <div className="relative">
                                    <Search className="absolute left-3 top-2.5 text-slate-400" size={12} />
                                    <input type="text" placeholder={`Cari dari ${currentTabList.length} PPL di tab ini (Nama/Email/Kecamatan)...`} value={lapSearchTerm} onChange={(e) => { setLapSearchTerm(e.target.value); setLapCurrentPage(1); }} className="w-full bg-slate-50 text-xs border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-slate-700 focus:outline-none focus:border-indigo-500" />
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50/50 scrollbar-thin">
                                {currentItems.length === 0 ? (
                                    <div className="text-center text-[10px] text-slate-400 font-bold py-12 bg-white rounded-2xl border border-dashed border-slate-200 shadow-2xs">Tidak ada data PPL yang sesuai dengan kriteria pencarian Anda.</div>
                                ) : (
                                    currentItems.map((ppl, idx) => {
                                        const isPplAktif = lapActiveFilter === 'AKTIF';
                                        return (
                                            <div key={idx} className={`bg-white border rounded-2xl p-3.5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition-all ${isPplAktif ? 'border-slate-200 hover:border-indigo-200' : 'border-rose-100 hover:bg-rose-50/10'}`}>
                                                <div className="flex items-center gap-2.5 overflow-hidden">
                                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black uppercase font-mono shrink-0 ${isPplAktif ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'}`}>{ppl.nama_petugas ? ppl.nama_petugas.charAt(0) : '👥'}</div>
                                                    <div className="overflow-hidden">
                                                        <div className="text-[11px] font-black text-slate-800 uppercase tracking-wide truncate">{ppl.nama_petugas || 'PPL Tanpa Nama'}</div>
                                                        <div className="text-[9px] text-slate-400 font-mono truncate mt-0.5">{ppl.email}</div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 justify-between sm:justify-end shrink-0">
                                                    <span className="text-[9px] font-black uppercase bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-lg border border-slate-200/70 font-mono flex items-center gap-1">
                                                        <MapPin size={10} className="text-slate-400" /> {ppl.kecamatan_tugas || 'Belum Diatur'}
                                                    </span>
                                                    <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-md border tracking-tight ${isPplAktif ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-rose-50 border-rose-200 text-rose-600'}`}>{isPplAktif ? 'Sudah Mulai' : 'Belum Jalan'}</span>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            <div className="bg-white p-3 border-t border-slate-200 flex items-center justify-between shrink-0 text-[10px]">
                                <span className="font-bold text-slate-400 uppercase tracking-wider">Halaman {lapCurrentPage} / {totalPages} <span className="font-medium font-mono text-slate-300">({totalItems} PPL)</span></span>
                                <div className="flex gap-1.5">
                                    <button type="button" disabled={lapCurrentPage === 1} onClick={() => setLapCurrentPage(prev => Math.max(prev - 1, 1))} className="bg-slate-100 hover:bg-slate-200 disabled:opacity-30 disabled:pointer-events-none text-slate-700 font-black px-3 py-1.5 rounded-xl">Sebelumnya</button>
                                    <button type="button" disabled={lapCurrentPage === totalPages} onClick={() => setLapCurrentPage(prev => Math.min(prev + 1, totalPages))} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-30 disabled:pointer-events-none text-white font-black px-3 py-1.5 rounded-xl shadow-md">Berikutnya</button>
                                </div>
                            </div>

                        </div>
                    </div>
                );
            })()}

            {showModalMetrik && (() => {
                const isTipeStagnan = dataModalMetrik.tipeStatus === 'STAGNAN';

                const listSudahJalan = dataModalMetrik.listPetugas.filter(p => p.statusHariIni === 'AKTIF');
                const listBelumJalan = dataModalMetrik.listPetugas.filter(p => p.statusHariIni === 'ABSEN' || p.statusHariIni === 'STAGNAN');

                const baseTabList = isTipeStagnan
                    ? dataModalMetrik.listPetugas
                    : (modalMetrikActiveTab === 'AKTIF' ? listSudahJalan : listBelumJalan);

                const filteredModalList = baseTabList.filter(p => {
                    const query = modalMetrikSearch.toLowerCase();
                    return (p.nama_petugas || '').toLowerCase().includes(query) ||
                        (p.email || '').toLowerCase().includes(query) ||
                        (p.kecamatan_tugas || '').toLowerCase().includes(query);
                });

                const sortedModalList = filteredModalList.sort((a, b) => {
                    const kecA = a.kecamatan_tugas || '999';
                    const kecB = b.kecamatan_tugas || '999';
                    return kecA.localeCompare(kecB, 'id', { numeric: true });
                });

                const totalItems = sortedModalList.length;
                const totalPages = Math.ceil(totalItems / modalMetrikItemsPerPage) || 1;
                const indexOfLastItem = modalMetrikPage * modalMetrikItemsPerPage;
                const indexOfFirstItem = indexOfLastItem - modalMetrikItemsPerPage;
                const currentModalItems = sortedModalList.slice(indexOfFirstItem, indexOfLastItem);

                return (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
                        <div className="bg-slate-50 w-full max-w-xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden max-h-[85vh] flex flex-col animate-scaleIn">

                            <div className="bg-white p-4 border-b border-slate-200 flex items-center justify-between shrink-0">
                                <div className="flex items-center gap-2">
                                    <div className={`w-2.5 h-2.5 rounded-full animate-pulse ${isTipeStagnan ? 'bg-rose-500' : 'bg-indigo-500'}`}></div>
                                    <div>
                                        <h3 className="text-xs font-black text-slate-800 uppercase tracking-wide">{dataModalMetrik.judul}</h3>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">Aktifitas Harian Petugas Berdasarkan Presensi Lapangan</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setShowModalMetrik(false)}
                                    className="text-[10px] font-black bg-slate-100 hover:bg-rose-500 hover:text-white text-slate-500 w-6 h-6 rounded-xl transition-all flex items-center justify-center"
                                >
                                    ✕
                                </button>
                            </div>

                            {!isTipeStagnan && (
                                <div className="grid grid-cols-2 gap-2 p-3 bg-white border-b border-slate-100 shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => { setModalMetrikActiveTab('AKTIF'); setModalMetrikPage(1); }}
                                        className={`p-2 rounded-xl border text-center transition-all ${modalMetrikActiveTab === 'AKTIF' ? 'bg-indigo-50 border-indigo-200 font-black text-indigo-700 shadow-xs ring-1 ring-indigo-300' : 'bg-slate-50 border-slate-200/60 text-slate-400 font-bold'}`}
                                    >
                                        <div className="text-[8px] uppercase tracking-wider">Sudah Jalan Lapangan</div>
                                        <div className="text-sm font-mono mt-0.5">{listSudahJalan.length} ORG</div>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { setModalMetrikActiveTab('BELUM'); setModalMetrikPage(1); }}
                                        className={`p-2 rounded-xl border text-center transition-all ${modalMetrikActiveTab === 'BELUM' ? 'bg-rose-50 border-rose-200 font-black text-rose-700 shadow-xs ring-1 ring-rose-300' : 'bg-slate-50 border-slate-200/60 text-slate-400 font-bold'}`}
                                    >
                                        <div className="text-[8px] uppercase tracking-wider">Belum Jalan Lapangan</div>
                                        <div className="text-sm font-mono mt-0.5">{listBelumJalan.length} ORG</div>
                                    </button>
                                </div>
                            )}

                            <div className="p-3 bg-white border-b border-slate-200 shrink-0">
                                <div className="relative">
                                    <Search className="absolute left-3 top-2.5 text-slate-400" size={12} />
                                    <input
                                        type="text"
                                        placeholder={`Cari nama, email, atau kecamatan dari ${baseTabList.length} petugas...`}
                                        value={modalMetrikSearch}
                                        onChange={(e) => { setModalMetrikSearch(e.target.value); setModalMetrikPage(1); }}
                                        className="w-full bg-slate-50 text-xs border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-slate-700 focus:outline-none focus:border-indigo-500"
                                    />
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50/50 scrollbar-thin">
                                {currentModalItems.length === 0 ? (
                                    <div className="text-center text-[10px] text-slate-400 p-12 bg-white rounded-2xl border border-dashed border-slate-200">
                                        Tidak ada data petugas {dataModalMetrik.role} yang sesuai di tab kriteria ini.
                                    </div>
                                ) : (
                                    currentModalItems.map((petugas, idx) => {
                                        const tidakAktif = petugas.statusHariIni === 'ABSEN' || petugas.statusHariIni === 'STAGNAN';
                                        return (
                                            <div
                                                key={idx}
                                                className={`bg-white border rounded-2xl p-3 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition-colors ${tidakAktif ? 'border-slate-200 hover:border-rose-200' : 'border-slate-200 hover:border-indigo-200'}`}
                                            >
                                                <div className="flex items-center gap-2.5 overflow-hidden">
                                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black uppercase font-mono shrink-0 ${tidakAktif ? 'bg-slate-200 text-slate-500' : 'bg-indigo-600 text-white'}`}>
                                                        {petugas.nama_petugas ? petugas.nama_petugas.charAt(0) : '👤'}
                                                    </div>
                                                    <div className="overflow-hidden">
                                                        <div className="text-[11px] font-black text-slate-800 uppercase tracking-wide truncate">{petugas.nama_petugas || 'Tanpa Nama'}</div>
                                                        <div className="text-[9px] text-slate-400 font-mono truncate mt-0.5">{petugas.email}</div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 justify-between sm:justify-end shrink-0">
                                                    {dataModalMetrik.role === 'Gabungan' && (
                                                        <span className="text-[8px] font-extrabold bg-slate-800 text-white px-1.5 py-0.5 rounded-md font-mono">
                                                            {petugas.posisi_tugas}
                                                        </span>
                                                    )}
                                                    <span className="text-[9px] font-black uppercase bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-lg border border-slate-200/70 font-mono flex items-center gap-1">
                                                        <MapPin size={10} className="text-slate-400" /> {petugas.kecamatan_tugas || 'Belum Diatur'}
                                                    </span>
                                                    <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-md border tracking-tight ${tidakAktif ? 'bg-rose-50 border-rose-200 text-rose-600' : 'bg-emerald-50 border-emerald-200 text-emerald-600'}`}>
                                                        {petugas.statusHariIni === 'STAGNAN' ? `Stagnan ${petugas.hariSifatStagnan}d` : petugas.statusHariIni}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            <div className="bg-white p-3 border-t border-slate-200 flex items-center justify-between shrink-0 text-[10px]">
                                <span className="font-bold text-slate-400 uppercase tracking-wider">Halaman {modalMetrikPage} / {totalPages} <span className="font-medium font-mono text-slate-300">({totalItems} Orang)</span></span>
                                <div className="flex gap-1.5">
                                    <button
                                        type="button"
                                        disabled={modalMetrikPage === 1}
                                        onClick={() => setModalMetrikPage(prev => Math.max(prev - 1, 1))}
                                        className="bg-slate-100 hover:bg-slate-200 disabled:opacity-30 disabled:pointer-events-none text-slate-700 font-black px-3 py-1.5 rounded-xl transition-all"
                                    >
                                        Sebelumnya
                                    </button>
                                    <button
                                        type="button"
                                        disabled={modalMetrikPage === totalPages}
                                        onClick={() => setModalMetrikPage(prev => Math.min(prev + 1, totalPages))}
                                        className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-30 disabled:pointer-events-none text-white font-black px-3 py-1.5 rounded-xl shadow-md transition-all"
                                    >
                                        Berikutnya
                                    </button>
                                </div>
                            </div>

                        </div>
                    </div>
                );
            })()}
        </div>
    );
}