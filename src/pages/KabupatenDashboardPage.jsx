import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import {
    BarChart, Bar, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie
} from 'recharts';
import {
    ShieldAlert, Search, ArrowRight, User, Calendar, X, AlertTriangle, CheckCircle2, Clock, MapPin, UserX, RefreshCw
} from 'lucide-react';

// 🛡️ Helper Taktis: Ekstraksi 3 digit kode kecamatan_tugas
const ekstrakKodeKecPetugas = (stringKec) => {
    if (!stringKec) return "";
    const match = String(stringKec).trim().match(/^\d+/);
    return match ? match[0] : "";
};

// 📅 Komponen MiniCalendar yang sudah dioptimasi
const MiniCalendar = React.memo(({ arrayTanggalAktif }) => {
    const jktDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
    const tglHariIni = `${jktDate.getFullYear()}-${String(jktDate.getMonth() + 1).padStart(2, '0')}-${String(jktDate.getDate()).padStart(2, '0')}`;

    const tujuhHariTerakhir = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(jktDate);
        d.setDate(jktDate.getDate() - (6 - i));
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    });

    const aktifSet = useMemo(() => {
        return new Set(arrayTanggalAktif.map(tgl => {
            if (typeof tgl === 'number') {
                // Konversi angka hari kembali ke format string YYYY-MM-DD (Asumsi Juni 2026 sesuai konteks siklus)
                return `2026-06-${String(tgl).padStart(2, '0')}`;
            }
            return tgl;
        }));
    }, [arrayTanggalAktif]);

    return (
        <div className="flex gap-1">
            {tujuhHariTerakhir.map((fullDate, idx) => {
                const dayNum = parseInt(fullDate.split('-')[2], 10);
                const isActive = aktifSet.has(fullDate);
                const isHariIni = fullDate === tglHariIni;

                let styleClass = "bg-slate-50 text-slate-300 border-slate-100";

                if (isActive) {
                    styleClass = "bg-emerald-500 text-white border-emerald-600 shadow-sm";
                } else if (isHariIni) {
                    styleClass = "bg-rose-500 text-white border-rose-600 animate-pulse ring-1 ring-rose-300";
                }

                return (
                    <div
                        key={idx}
                        className={`w-5 h-5 flex items-center justify-center rounded-md text-[9px] font-black border transition-all ${styleClass}`}
                    >
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
    
    // State Pencarian Teks dengan Debounce lokal
    const [searchInputValue, setSearchInputValue] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    
    const [activeTab, setActiveTab] = useState('PCL'); 
    const [filterStatus, setFilterStatus] = useState('all'); 

    // 🛡️ Kunci Sinkronisasi Spasial & Tampilan
    const [selectedKecamatan, setSelectedKecamatan] = useState(null);
    const [selectedKecTab, setSelectedKecTab] = useState("SEMUA");
    const [viewModeTab, setViewModeTab] = useState("DESA"); 
    const [daftarKecamatan, setDaftarKecamatan] = useState([]);

    // Detail Evaluasi Modal States
    const [showDetailEvaluasi, setShowDetailEvaluasi] = useState(false);
    const [dataEvaluasiTerpilih, setDataEvaluasiTerpilih] = useState({ tanggal: '', listLaporan: [] });
    const [loadingDetailEval, setLoadingDetailEval] = useState(false);
    const [evalSearchTerm, setEvalSearchTerm] = useState('');
    const [evalActiveFilter, setEvalActiveFilter] = useState('SUDAH'); 
    const [evalCurrentPage, setEvalCurrentPage] = useState(1);
    const itemsPerPage = 5;

    // State Kontrol untuk Pop-up Lapangan PPL
    const [showDetailLapangan, setShowDetailLapangan] = useState(false);
    const [dataLapanganTerpilih, setDataLapanganTerpilih] = useState({ tanggalLabel: '', tanggalDb: '', listPetugasAktif: [] });
    const [lapSearchTerm, setLapSearchTerm] = useState('');
    const [lapActiveFilter, setLapActiveFilter] = useState('AKTIF'); 
    const [lapCurrentPage, setLapCurrentPage] = useState(1);
    const lapItemsPerPage = 10;

    const [selectedFilterDate, setSelectedFilterDate] = useState(() => {
        const jktDate = new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" });
        const dateObj = new Date(jktDate);
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    });

    // Core Data States
    const [globalMetrics, setGlobalMetrics] = useState({ totalPcl: 0, pclAktifHariIni: 0, totalPml: 0, pmlAktifHariIni: 0, totalStagnan: 0 });
    const [masterPclList, setMasterPclList] = useState([]);
    const [masterPmlList, setMasterPmlList] = useState([]);
    const [selectedPetugas, setSelectedPetugas] = useState(null);

    // Raw Storage
    const [rawPetugas, setRawPetugas] = useState([]);
    const [rawLogsPcl, setRawLogsPcl] = useState([]);
    const [rawRealisasiPml, setRawRealisasiPml] = useState([]);
    const [rawMasterSls, setRawMasterSls] = useState([]);

    // 💡 EFFECT UNTUK DEBOUNCING PENCARIAN UTAMA (Mengurangi beban render berlebih)
    useEffect(() => {
        const delayDebounceFn = setTimeout(() => {
            setSearchTerm(searchInputValue);
        }, 300);
        return () => clearTimeout(delayDebounceFn);
    }, [searchInputValue]);

    useEffect(() => {
        if (selectedKecTab === "SEMUA") {
            setViewModeTab("DESA");
        }
    }, [selectedKecTab]);

    // 💡 OPTIMALISASI: FETCH DATA OPERASIONAL BERBASIS SERVER-SIDE FILTERING (H-14 Rentang Waktu)
    const fetchOperationalData = useCallback(async () => {
        setIsRefreshing(true);
        if (rawPetugas.length === 0) setLoading(true);

        // Ambil penanda waktu Jakarta hari ini
        const jktDateString = new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" });
        const now = new Date(jktDateString);
        const tglHariIni = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        // Hitung batas bawah tanggal (H-14 dari tanggal filter aktif demi efisiensi data transfer)
        const batasBawahTanggal = new Date(selectedFilterDate);
        batasBawahTanggal.setDate(batasBawahTanggal.getDate() - 14);
        const batasBawahStr = `${batasBawahTanggal.getFullYear()}-${String(batasBawahTanggal.getMonth() + 1).padStart(2, '0')}-${String(batasBawahTanggal.getDate()).padStart(2, '0')}`;

        const [petugasRes, logsPclRes, logsPmlRes, masterSlsRes, realisasiPmlRes] = await Promise.all([
            supabase.from('petugas').select('email, nama_petugas, posisi_tugas, status, kecamatan_tugas').eq('status', 'Diterima'),
            supabase.from('log_checkin_pcl').select('idsubsls, tanggal, petugas_email').gte('tanggal', batasBawahStr),
            supabase.from('log_checkin_pml').select('pml_email, tanggal, idsubsls').gte('tanggal', batasBawahStr),
            supabase.from('muatan_sls').select('idsubsls, kdkec, nmkec, kddesa, nmdesa, jml_muatan, realisasi_pencacahan, is_selesai, petugas_id, petugas(nama_petugas)'),
            supabase.from('log_realisasi_pml').select('tanggal, pml_email').gte('tanggal', batasBawahStr)
        ]);

        if (petugasRes.error || logsPclRes.error || logsPmlRes.error || masterSlsRes.error || realisasiPmlRes.error) {
            console.error("Gagal mengambil data operasional atau realisasi terfilter server");
            setLoading(false);
            setIsRefreshing(false);
            return;
        }

        const allPetugas = petugasRes.data;
        const logsPcl = logsPclRes.data || [];
        const logsPml = logsPmlRes.data || [];
        const masterSls = masterSlsRes.data || [];
        const realisasiPml = realisasiPmlRes.data || [];

        setRawPetugas(allPetugas);
        setRawLogsPcl(logsPcl);
        setRawRealisasiPml(realisasiPml);
        setRawMasterSls(masterSls);

        const slsMap = new Map(masterSls.map(s => [s.idsubsls, s]));
        const rawDaftarKec = Array.from(new Set(allPetugas.map(p => p.kecamatan_tugas).filter(Boolean)));
        const dropdownObjList = rawDaftarKec.sort((a, b) => a.localeCompare(b, 'id', { numeric: true })).map(str => ({
            kode: ekstrakKodeKecPetugas(str),
            label: str
        })).filter(item => item.kode !== "");

        setDaftarKecamatan(dropdownObjList);

        const allPcl = allPetugas.filter(p => p.posisi_tugas === 'PCL');
        const allPml = allPetugas.filter(p => p.posisi_tugas === 'PML');

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

        const detailedPcl = allPcl.map(pcl => {
            const pclLogs = logsPclMap.get(pcl.email) || [];
            const checkinHariIni = pclLogs.some(l => l.tanggal === tglHariIni);
            if (checkinHariIni) pclAktifCount++;

            const urutLog = [...pclLogs].sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));
            const terakhirActivity = urutLog.length > 0 ? new Date(urutLog[0].tanggal) : null;

            const hariSelesai = terakhirActivity ? Math.floor((now - terakhirActivity) / (1000 * 60 * 60 * 24)) : 999;
            const isStagnan = hariSelesai >= 3;
            if (isStagnan) totalStagnanCount++;

            const uniqueSlsIds = Array.from(new Set(pclLogs.map(l => l.idsubsls)));

            return {
                ...pcl,
                terakhirAktivitas: terakhirActivity ? terakhirActivity.toLocaleDateString('id-ID') : 'Belum Lapangan',
                hariSifatStagnan: hariSelesai,
                isStagnan,
                statusHariIni: checkinHariIni ? 'AKTIF' : (isStagnan ? 'STAGNAN' : 'ABSEN'),
                totalSlsDisentuh: uniqueSlsIds.length,
                daftarSls: uniqueSlsIds.map(id => slsMap.get(id) || { nmsls: 'Unknown SLS', nmdesa: '-' }),
                totalInput: pclLogs.length,
                arrayTanggalAktif: pclLogs.map(l => parseInt(l.tanggal.split('-')[2], 10)),
                rawLogs: pclLogs
            };
        });

        const detailedPml = allPml.map(pml => {
            const pmlLogs = logsPmlMap.get(pml.email) || [];
            const checkinHariIni = pmlLogs.some(l => l.tanggal === tglHariIni);
            if (checkinHariIni) pmlAktifCount++;

            const urutLog = [...pmlLogs].sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));
            const terakhirActivity = urutLog.length > 0 ? new Date(urutLog[0].tanggal) : null;

            const hariSelesai = terakhirActivity ? Math.floor((now - terakhirActivity) / (1000 * 60 * 60 * 24)) : 999;
            const isStagnan = hariSelesai >= 3;
            if (isStagnan) totalStagnanCount++;

            const uniqueSlsIds = Array.from(new Set(pmlLogs.map(l => l.idsubsls)));

            return {
                ...pml,
                terakhirAktivitas: terakhirActivity ? terakhirActivity.toLocaleDateString('id-ID') : 'Belum Lapangan',
                hariSifatStagnan: hariSelesai,
                isStagnan,
                statusHariIni: checkinHariIni ? 'AKTIF' : (isStagnan ? 'STAGNAN' : 'ABSEN'),
                totalSlsDisentuh: uniqueSlsIds.length,
                daftarSls: uniqueSlsIds.map(id => slsMap.get(id) || { nmsls: 'Unknown SLS', nmdesa: '-' }),
                totalInput: pmlLogs.length,
                arrayTanggalAktif: pmlLogs.map(l => parseInt(l.tanggal.split('-')[2], 10)),
                rawLogs: pmlLogs
            };
        });

        setGlobalMetrics({ totalPcl: allPcl.length, pclAktifHariIni: pclAktifCount, totalPml: allPml.length, pmlAktifHariIni: pmlAktifCount, totalStagnan: totalStagnanCount });
        setMasterPclList(detailedPcl);
        setMasterPmlList(detailedPml);

        setLoading(false);
        setIsRefreshing(false);
    }, [selectedFilterDate]);

    useEffect(() => {
        fetchOperationalData();
    }, [fetchOperationalData]);

    // 1. ENGINE AGREGASI SENSUS (Dioptimasi)
    const dataMonitoringWilayah = useMemo(() => {
        const rekapKecamatan = {};
        const rekapDesa = {};
        const rekapPetugas = {};

        rawMasterSls.forEach(sls => {
            const kodeKec = sls.kdkec ? String(sls.kdkec).trim() : "";
            const kodeDesa = sls.kddesa ? String(sls.kddesa).trim() : "";

            const idPetugas = sls.petugas_id ? String(sls.petugas_id).trim() : "";
            const namaDariJoin = sls.petugas?.nama_petugas || sls.petugas_id?.nama_petugas;
            const namaMentah = namaDariJoin || (idPetugas ? idPetugas.split('@')[0] : "Tanpa Petugas");
            const namaPetugas = String(namaMentah).toUpperCase();

            if (!kodeKec || !kodeDesa) return;

            const namaKec = sls.nmkec || `Kec. ${kodeKec}`;
            const namaDesa = sls.nmdesa || `Desa ${kodeDesa}`;

            const muatanAwal = parseInt(sls.jml_muatan) || 0;
            const realisasi = parseInt(sls.realisasi_pencacahan) || 0;
            const isSelesai = sls.is_selesai === true;

            const targetDinamis = (isSelesai || realisasi > muatanAwal) ? realisasi : muatanAwal;

            let muatanSelesai = 0;
            let muatanSedang = 0;
            let muatanBelum = 0;

            if (isSelesai) {
                muatanSelesai = realisasi;
            } else if (realisasi > 0) {
                muatanSedang = realisasi;
                muatanBelum = Math.max(0, targetDinamis - realisasi);
            } else {
                muatanBelum = targetDinamis;
            }

            if (!rekapKecamatan[kodeKec]) {
                rekapKecamatan[kodeKec] = {
                    kode: kodeKec, nama_asli: namaKec, nama: `[${kodeKec}] ${namaKec}`,
                    total_target: 0, total_realisasi: 0, jml_sls: 0, sls_selesai: 0,
                    muatan_selesai: 0, muatan_sedang: 0, muatan_belum: 0
                };
            }
            rekapKecamatan[kodeKec].total_target += targetDinamis;
            rekapKecamatan[kodeKec].total_realisasi += realisasi;
            rekapKecamatan[kodeKec].jml_sls += 1;
            rekapKecamatan[kodeKec].muatan_selesai += muatanSelesai;
            rekapKecamatan[kodeKec].muatan_sedang += muatanSedang;
            rekapKecamatan[kodeKec].muatan_belum += muatanBelum;
            if (isSelesai) rekapKecamatan[kodeKec].sls_selesai += 1;

            const keyDesa = `${kodeKec}-${kodeDesa}`;
            if (!rekapDesa[keyDesa]) {
                rekapDesa[keyDesa] = {
                    kode: kodeDesa, kodeKec: kodeKec, nama_asli: namaDesa, nama: `[${kodeDesa}] ${namaDesa}`,
                    total_target: 0, total_realisasi: 0, jml_sls: 0, sls_selesai: 0,
                    muatan_selesai: 0, muatan_sedang: 0, muatan_belum: 0
                };
            }
            rekapDesa[keyDesa].total_target += targetDinamis;
            rekapDesa[keyDesa].total_realisasi += realisasi;
            rekapDesa[keyDesa].jml_sls += 1;
            rekapDesa[keyDesa].muatan_selesai += muatanSelesai;
            rekapDesa[keyDesa].muatan_sedang += muatanSedang;
            rekapDesa[keyDesa].muatan_belum += muatanBelum;
            if (isSelesai) rekapDesa[keyDesa].sls_selesai += 1;

            if (idPetugas) {
                const keyPetugas = `${kodeKec}-${idPetugas}`;
                if (!rekapPetugas[keyPetugas]) {
                    rekapPetugas[keyPetugas] = {
                        kode: idPetugas, kodeKec: kodeKec, nama_asli: namaPetugas, nama: namaPetugas,
                        total_target: 0, total_realisasi: 0, jml_sls: 0, sls_selesai: 0,
                        muatan_selesai: 0, muatan_sedang: 0, muatan_belum: 0
                    };
                }
                rekapPetugas[keyPetugas].total_target += targetDinamis;
                rekapPetugas[keyPetugas].total_realisasi += realisasi;
                rekapPetugas[keyPetugas].jml_sls += 1;
                rekapPetugas[keyPetugas].muatan_selesai += muatanSelesai;
                rekapPetugas[keyPetugas].muatan_sedang += muatanSedang;
                rekapPetugas[keyPetugas].muatan_belum += muatanBelum;
                if (isSelesai) rekapPetugas[keyPetugas].sls_selesai += 1;
            }
        });

        const targetSlsTerfilter = selectedKecTab === "SEMUA"
            ? rawMasterSls
            : rawMasterSls.filter(sls => String(sls.kdkec).trim() === selectedKecTab);

        const rekapStatusSls = { selesai: 0, sedang: 0, belum: 0, total: targetSlsTerfilter.length };
        const muatanStatus = { selesai: 0, proses: 0, belum: 0 };

        targetSlsTerfilter.forEach(sls => {
            const muatanAwal = parseInt(sls.jml_muatan) || 0;
            const realisasi = parseInt(sls.realisasi_pencacahan) || 0;
            const isSelesai = sls.is_selesai === true;
            const targetDinamis = (isSelesai || realisasi > muatanAwal) ? realisasi : muatanAwal;

            if (isSelesai) rekapStatusSls.selesai++;
            else if (realisasi > 0) rekapStatusSls.sedang++;
            else rekapStatusSls.belum++;

            if (isSelesai) {
                muatanStatus.selesai += realisasi;
            } else if (realisasi > 0) {
                muatanStatus.proses += realisasi;
                muatanStatus.belum += Math.max(0, targetDinamis - realisasi);
            } else {
                muatanStatus.belum += targetDinamis;
            }
        });

        const calculateStatus = (item) => {
            const totalTargetWilayah = item.total_target || 1;
            const selesai = Math.round((item.muatan_selesai / totalTargetWilayah) * 100);
            const sedang = Math.round((item.muatan_sedang / totalTargetWilayah) * 100);
            const belum = Math.max(0, 100 - selesai - sedang);
            const persen = totalTargetWilayah > 0 ? Math.min(Math.round((item.total_realisasi / totalTargetWilayah) * 100), 100) : 0;
            return { selesai, sedang, belum, persen };
        };

        return {
            kecamatan: Object.values(rekapKecamatan).map(item => ({ ...item, ...calculateStatus(item) })).sort((a, b) => a.kode.localeCompare(b.kode, 'id', { numeric: true })),
            desa: Object.values(rekapDesa).map(item => ({ ...item, ...calculateStatus(item) })).sort((a, b) => a.kode.localeCompare(b.kode, 'id', { numeric: true })),
            petugas: Object.values(rekapPetugas).map(item => ({ ...item, ...calculateStatus(item) })).sort((a, b) => b.persen - a.persen),
            statusSls: rekapStatusSls,
            muatanStatus: muatanStatus
        };
    }, [rawMasterSls, selectedKecTab]);

    const namaKecamatanTerpilihText = useMemo(() => {
        if (!selectedKecamatan) return null;
        const match = dataMonitoringWilayah.kecamatan.find(k => k.kode === selectedKecamatan);
        return match ? match.nama_asli : null;
    }, [selectedKecamatan, dataMonitoringWilayah]);

    // 2. TIMELINE GENERATOR & HISTORIS 14 HARI
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

        const pclAktif = pclKec.filter(p => (p.rawLogs || []).some(l => l.tanggal === selectedFilterDate)).length;
        const pmlAktif = pmlKec.filter(p => (p.rawLogs || []).some(l => l.tanggal === selectedFilterDate)).length;
        const stagnan = [...pclKec, ...pmlKec].filter(p => p.isStagnan).length;

        const logPclKec = seluruhLogPcl.filter(l => pclKec.some(p => p.email === l.petugas_email));
        const logPmlKec = seluruhLogPml.filter(l => pmlKec.some(p => p.email === l.pml_email));

        return {
            filteredMetrics: {
                totalPcl: pclKec.length,
                pclAktifHariIni: pclAktif,
                totalPml: pmlKec.length,
                pmlAktifHariIni: pmlAktif,
                totalStagnan: stagnan
            },
            trendChartData: hitungTrenHarian(pclKec, pmlKec, logPclKec, logPmlKec)
        };
    }, [selectedKecamatan, globalMetrics, masterPclList, masterPmlList, selectedFilterDate]);

    const filteredMetrics = trendAndMetricsData.filteredMetrics;
    const trendChartData = trendAndMetricsData.trendChartData;

    // 4. KECAMATAN AKTIF HARI INI GRAPH DATA GENERATOR
const kecamatanChartData = useMemo(() => {
    if (daftarKecamatan.length === 0) return [];
    return daftarKecamatan.map(item => {
        // Saring master list petugas berdasarkan kode kecamatan saat ini
        const pclKec = masterPclList.filter(p => ekstrakKodeKecPetugas(p.kecamatan_tugas) === item.kode);
        const pmlKec = masterPmlList.filter(p => ekstrakKodeKecPetugas(p.kecamatan_tugas) === item.kode);

        // 1. Hitung jumlah RIIL petugas yang aktif pada tanggal terpilih
        const pclAktifRiil = pclKec.filter(p => (p.rawLogs || []).some(l => l.tanggal === selectedFilterDate)).length;
        const pmlAktifRiil = pmlKec.filter(p => (p.rawLogs || []).some(l => l.tanggal === selectedFilterDate)).length;

        return {
            name: item.label,
            kode: item.kode,
            // Properti untuk tinggi BAR grafik (tetap persentase)
            'PCL Aktif (%)': pclKec.length > 0 ? Math.round((pclAktifRiil / pclKec.length) * 100) : 0,
            'PML Aktif (%)': pmlKec.length > 0 ? Math.round((pmlAktifRiil / pmlKec.length) * 100) : 0,
            
            // 🔥 TAMBAHAN DATA UTK TOOLTIP RIIL (Jumlah Orang)
            pclAktif: pclAktifRiil,
            pclTotal: pclKec.length,
            pmlAktif: pmlAktifRiil,
            pmlTotal: pmlKec.length
        };
    });
}, [daftarKecamatan, masterPclList, masterPmlList, selectedFilterDate]);

    // 5. MONITORING SIKLUS BATCH
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

    // 6. RE-EVALUASI FILTER LIST UTAMA (Mendukung Debounced Search Term)
    const filteredList = useMemo(() => {
        const listDataAktif = activeTab === 'PCL' ? masterPclList : masterPmlList;
        const jktDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
        const tglSistemSekarang = `${jktDate.getFullYear()}-${String(jktDate.getMonth() + 1).padStart(2, '0')}-${String(jktDate.getDate()).padStart(2, '0')}`;

        const processedList = listDataAktif.map(petugas => {
            const logs = petugas.rawLogs || [];
            const isAktifPadaTanggal = logs.some(l => l.tanggal === selectedFilterDate);

            let statusDinamis = isAktifPadaTanggal ? 'AKTIF' : 'ABSEN';

            if (!isAktifPadaTanggal && petugas.isStagnan && selectedFilterDate === tglSistemSekarang) {
                statusDinamis = 'STAGNAN';
            }

            return { ...petugas, statusHariIni: statusDinamis };
        });

        const filtered = processedList.filter(p => {
            const matchSearch = (p.nama_petugas || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                p.email.toLowerCase().includes(searchTerm.toLowerCase());
            const matchKecamatan = selectedKecamatan ? ekstrakKodeKecPetugas(p.kecamatan_tugas) === selectedKecamatan : true;

            if (filterStatus === 'stagnan') return matchSearch && matchKecamatan && p.isStagnan;
            if (filterStatus === 'aktif') return matchSearch && matchKecamatan && p.statusHariIni === 'AKTIF';
            return matchSearch && matchKecamatan;
        });

        return filtered.sort((a, b) => {
            const kecA = a.kecamatan_tugas || "";
            const kecB = b.kecamatan_tugas || "";
            return kecA.localeCompare(kecB, 'id', { numeric: true });
        });

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

    const handleBukaDetailEvaluasi = async (tanggalLabel) => {
        setLoadingDetailEval(true);
        setShowDetailEvaluasi(true);
        setEvalCurrentPage(1); 
        setEvalSearchTerm(''); 
        
        const part = tanggalLabel.split(' ');
        const day = part[0].padStart(2, '0');
        const dbDateFormatted = `2026-06-${day}`;
        
        setDataEvaluasiTerpilih({ tanggal: tanggalLabel, listLaporan: [] });

        try {
            const { data, error } = await supabase
                .from('log_realisasi_pml')
                .select(`
                    pml_email,
                    kendala_lapangan,
                    solusi_lapangan,
                    foto_evaluasi,
                    petugas!pml_email (
                        nama_petugas,
                        kecamatan_tugas
                    )
                `)
                .eq('tanggal', dbDateFormatted);

            if (error) throw error;

            const dataFormatted = (data || []).map(log => ({
                pml_email: log.pml_email,
                kendala_lapangan: log.kendala_lapangan,
                solusi_lapangan: log.solusi_lapangan,
                foto_evaluasi: log.foto_evaluasi,
                nama_petugas: log.petugas?.nama_petugas || 'TANPA NAMA',
                kecamatan_tugas: log.petugas?.kecamatan_tugas || '999 KOSONG' 
            }));

            const dataSorted = dataFormatted.sort((a, b) => {
                return a.kecamatan_tugas.localeCompare(b.kecamatan_tugas, 'id', { numeric: true });
            });

            setDataEvaluasiTerpilih({
                tanggal: tanggalLabel,
                listLaporan: dataSorted
            });

        } catch (err) {
            console.error("Gagal mengambil detail evaluasi join petugas:", err.message);
        } finally {
            setLoadingDetailEval(false);
        }
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

            {/* HEADER */}
            <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-b border-slate-200 pb-4">
                <div>
                    <h1 className="text-sm font-black tracking-wider text-slate-800 uppercase flex items-center gap-2">
                        <ShieldAlert className="text-indigo-600" size={18} /> Dashboard Lapangan Sensus Ekonomi 2026
                    </h1>
                    <p className="text-[11px] text-slate-400 font-medium mt-0.5">Monitoring Pemantauan Lapangan Sensus Ekonomi 2026 BPS Kabupaten Boyolali</p>
                </div>
                <button
                    onClick={fetchOperationalData}
                    disabled={isRefreshing}
                    className="flex items-center justify-center gap-2 text-[10px] bg-white border border-slate-200 px-4 py-2 rounded-xl text-indigo-600 font-black hover:bg-slate-50 hover:shadow-md transition-all active:scale-95 disabled:opacity-50 shadow-sm"
                >
                    <RefreshCw size={12} className={isRefreshing ? "animate-spin" : ""} />
                    {isRefreshing ? 'MEMPERBARUI...' : 'REFRESH DATA'}
                </button>
            </div>

            {/* METRICS PANEL BOARD */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                <div className="bg-gradient-to-br from-white to-slate-50 p-4 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-1">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">PPL Jalan Lapangan</div>
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
                        <div className="bg-gradient-to-r from-indigo-500 to-indigo-600 h-full transition-all duration-500 ease-out" style={{ width: `${filteredMetrics.totalPcl > 0 ? (filteredMetrics.pclAktifHariIni / filteredMetrics.totalPcl) * 100 : 0}%` }}></div>
                    </div>
                </div>

                <div className="bg-gradient-to-br from-white to-slate-50 p-4 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
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
                        <div className="bg-gradient-to-r from-indigo-500 to-indigo-600 h-full transition-all duration-500 ease-out" style={{ width: `${filteredMetrics.totalPml > 0 ? (filteredMetrics.pmlAktifHariIni / filteredMetrics.totalPml) * 100 : 0}%` }}></div>
                    </div>
                </div>

                <div className="bg-gradient-to-br from-rose-50/50 to-rose-50 p-4 rounded-2xl border border-rose-100 shadow-sm hover:shadow-md transition-shadow">
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

            {/* SIKLUS MONITORING GRID */}
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm mb-6">
                <h3 className="text-xs font-black uppercase text-slate-800 mb-4 flex items-center gap-2">
                    <Calendar size={14} className="text-slate-400" />
                    Monitoring Pelaksanaan 2-1-2-1 {namaKecamatanTerpilihText ? `Kec. ${namaKecamatanTerpilihText}` : '(Kabupaten)'}
                </h3>
                
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                    {progresSiklusTerfilter.map((item, idx) => {
                        const isLapangan = item.target === 'PENDATAAN';
                        return (
                            <div 
                                key={idx} 
                                onClick={() => isLapangan ? handleBukaDetailLapangan(item.tanggal) : handleBukaDetailEvaluasi(item.tanggal)}
                                className={`p-3 rounded-2xl border flex flex-col justify-between transition-all duration-200 cursor-pointer active:scale-98 ${
                                    isLapangan 
                                        ? 'bg-indigo-50/50 border-indigo-100 hover:bg-indigo-100/60' 
                                        : 'bg-emerald-50/50 border-emerald-100 hover:bg-emerald-100/60'
                                }`}
                            >
                                <div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-[9px] font-bold text-slate-500 uppercase">{item.tanggal}</span>
                                        <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded-md ${
                                            isLapangan ? 'bg-indigo-200/50 text-indigo-700' : 'bg-emerald-200/60 text-emerald-700'
                                        }`}>
                                            {item.target} 🔍
                                        </span>
                                    </div>
                                    <div className="mt-2">
                                        <div className={`text-sm font-black font-mono ${item.persentase > 70 ? (isLapangan ? 'text-indigo-600' : 'text-emerald-600') : 'text-rose-500'}`}>
                                            {Number(item.persentase).toFixed(2)}%
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-3 space-y-1.5 text-[10px] border-t pt-2 border-slate-200/40">
                                    {isLapangan ? (
                                        <>
                                            <div className="text-slate-600 font-medium flex items-center justify-between gap-1.5">
                                                <div className="flex items-center gap-1"><MapPin size={10} className="text-emerald-500" /> Petugas Jalan Lapangan:</div>
                                                <strong className="text-slate-800">{item.aktif} Org</strong>
                                            </div>
                                            <div className="text-rose-600 font-medium flex items-center justify-between gap-1.5">
                                                <div className="flex items-center gap-1"><UserX size={10} className="text-rose-500" /> Petugas Tidak Aktif:</div>
                                                <strong>{item.absen} Org</strong>
                                            </div>
                                            <div className="text-[8px] text-indigo-600/80 font-bold text-center pt-1 italic tracking-wide">
                                                (Klik untuk lihat petugas aktif)
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="text-slate-600 font-medium flex items-center justify-between gap-1.5">
                                                <div className="flex items-center gap-1"><CheckCircle2 size={10} className="text-emerald-500" /> Tim Sudah Kirim Evaluasi:</div>
                                                <strong className="text-slate-800">{item.aktif} TIM</strong>
                                            </div>
                                            <div className="text-slate-500 font-medium flex items-center justify-between gap-1.5">
                                                <div className="flex items-center gap-1"><Clock size={10} className="text-slate-400" /> Tim Belum Kirim Evaluasi:</div>
                                                <strong className="text-slate-800">{item.absen} TIM</strong>
                                            </div>
                                            <div className="text-[8px] text-emerald-600/80 font-bold text-center pt-1 italic tracking-wide">
                                                (Klik untuk lihat hasil evaluasi)
                                            </div>
                                        </>
                                    )}
                                </div>
                                <div className="w-full bg-white h-1.5 rounded-full mt-2.5 overflow-hidden border border-slate-100 shadow-inner">
                                    <div className={`h-full transition-all duration-500 ${isLapangan ? 'bg-indigo-500' : 'bg-emerald-500'}`} style={{ width: `${item.persentase}%` }}></div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ASSIGNMENT REALISASI CHART PANEL */}
            <div className="bg-white p-5 border border-slate-200 rounded-3xl shadow-sm mb-6">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                            {selectedKecTab === "SEMUA" ? "Capaian Realisasi Lapangan Kabupaten (Per Kecamatan)" : `Capaian Realisasi Lapangan Kec. ${namaKecamatanTerpilihText} (Per ${viewModeTab})`}
                        </h3>
                        <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">
                            Visualisasi Progress Muatan Yang Sudah Didata Lapangan Berdasarkan {selectedKecTab === "SEMUA" ? "Kecamatan" : (viewModeTab === "DESA" ? "Desa" : "Petugas")}
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        {selectedKecTab !== "SEMUA" && (
                            <div className="bg-slate-100 p-1 rounded-xl flex gap-1 border border-slate-200/60 shadow-inner">
                                <button onClick={() => setViewModeTab("DESA")} className={`text-[9px] font-black px-3 py-1.5 rounded-lg transition-all uppercase tracking-wide ${viewModeTab === "DESA" ? "bg-white text-slate-800 shadow-sm" : "text-slate-400 hover:text-slate-600 hover:bg-slate-200/50"}`}>📍 Per Desa</button>
                                <button onClick={() => setViewModeTab("PETUGAS")} className={`text-[9px] font-black px-3 py-1.5 rounded-lg transition-all uppercase tracking-wide ${viewModeTab === "PETUGAS" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400 hover:text-slate-600 hover:bg-slate-200/50"}`}>🏃‍♂️ Per Petugas</button>
                            </div>
                        )}
                        {selectedKecTab !== "SEMUA" && (
                            <button onClick={() => { setSelectedKecTab("SEMUA"); setSelectedKecamatan(null); }} className="bg-slate-800 hover:bg-slate-900 text-white text-[9px] font-black px-4 py-1.5 rounded-xl transition-all uppercase tracking-wider shadow-sm flex items-center gap-1">
                                ← Kembali
                            </button>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
                    <div className="lg:col-span-3 w-full overflow-x-auto overflow-y-hidden scrollbar-thin">
                        <div className="h-72 w-full min-w-[500px] md:min-w-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={selectedKecTab === "SEMUA" ? dataMonitoringWilayah.kecamatan : viewModeTab === "DESA" ? dataMonitoringWilayah.desa.filter(d => d.kodeKec === selectedKecTab) : dataMonitoringWilayah.petugas.filter(p => p.kodeKec === selectedKecTab)}
                                    margin={{ bottom: 40, left: -15, right: 10, top: 10 }}
                                    barCategoryGap="25%"
                                    onClick={(state) => {
                                        if (selectedKecTab === "SEMUA" && state && state.activeLabel) {
                                            const matchKode = state.activeLabel.match(/\d+/);
                                            if (matchKode && matchKode[0]) {
                                                setSelectedKecTab(matchKode[0]);
                                                setSelectedKecamatan(matchKode[0]);
                                                setSelectedPetugas(null);
                                            }
                                        }
                                    }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="nama" stroke="#94a3b8" fontSize={8} tickLine={false} angle={-45} textAnchor="end" interval={0} height={50} tick={{ fontWeight: 700 }} />
                                    <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} unit="%" domain={[0, 100]} />
                                    <Tooltip
                                        cursor={{ fill: '#f8fafc', opacity: 0.5 }}
                                        content={({ active, payload }) => {
                                            if (active && payload && payload.length) {
                                                const data = payload[0].payload;
                                                return (
                                                    <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xl text-[11px] space-y-1.5 font-sans min-w-[170px] z-50">
                                                        <div className="font-black text-slate-800 uppercase tracking-wide border-b border-slate-100 pb-1.5 mb-1 flex items-center gap-1">
                                                            {viewModeTab === "PETUGAS" && selectedKecTab !== "SEMUA" ? "🏃‍♂️" : "📍"} {data.nama_asli}
                                                        </div>
                                                        <div className="space-y-1 font-medium text-slate-500">
                                                            <div className="flex justify-between"><span>Realisasi:</span><strong className="text-emerald-600 font-mono">{data.total_realisasi.toLocaleString('id-ID')} / {data.total_target.toLocaleString('id-ID')}</strong></div>
                                                            <div className="flex justify-between"><span>Selesai:</span><strong className="text-emerald-600 font-mono">{data.selesai}%</strong></div>
                                                            <div className="flex justify-between"><span>Sedang:</span><strong className="text-indigo-600 font-mono">{data.sedang}%</strong></div>
                                                            <div className="flex justify-between"><span>Belum:</span><strong className="text-slate-400 font-mono">{data.belum}%</strong></div>
                                                        </div>
                                                        <div className="border-t border-slate-100 pt-1.5 mt-1.5 text-slate-400 font-bold text-[9px] uppercase flex justify-between"><span>SLS Selesai:</span><span>{data.sls_selesai} / {data.jml_sls} SLS</span></div>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        }}
                                    />
                                    <Bar dataKey="selesai" stackId="a" fill="#10b981" maxBarSize={30} />
                                    <Bar dataKey="sedang" stackId="a" fill="#6366f1" maxBarSize={30} />
                                    <Bar dataKey="belum" stackId="a" fill="#e2e8f0" maxBarSize={30} radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="lg:col-span-1 space-y-4 border-l border-slate-100 pl-2 lg:pl-4">
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center lg:text-left">Progres Lapangan</div>
                        <div className="h-40 w-full relative group">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={[{ name: 'Selesai', value: dataMonitoringWilayah.muatanStatus.selesai }, { name: 'Proses', value: dataMonitoringWilayah.muatanStatus.proses }, { name: 'Belum', value: dataMonitoringWilayah.muatanStatus.belum }]} cx="50%" cy="50%" innerRadius={45} outerRadius={60} paddingAngle={3} dataKey="value" stroke="none">
                                        <Cell fill="#10b981" /><Cell fill="#6366f1" /><Cell fill="#e2e8f0" />
                                    </Pie>
                                    <Tooltip
                                        wrapperStyle={{ zIndex: 50, pointerEvents: 'none' }}
                                        content={({ active }) => {
                                            if (active) {
                                                const muatan = dataMonitoringWilayah.muatanStatus;
                                                const totalTarget = muatan.selesai + muatan.proses + muatan.belum;
                                                const pctSelesai = totalTarget > 0 ? ((muatan.selesai / totalTarget) * 100).toFixed(2) : "0.00";
                                                const pctProses = totalTarget > 0 ? ((muatan.proses / totalTarget) * 100).toFixed(2) : "0.00";
                                                const pctBelum = totalTarget > 0 ? ((muatan.belum / totalTarget) * 100).toFixed(2) : "0.00";
                                                return (
                                                    <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xl text-[11px] space-y-2 font-sans min-w-[190px]">
                                                        <div className="font-black text-slate-800 uppercase tracking-wide border-b border-slate-100 pb-1.5 mb-1 flex items-center gap-1">📊 Rekap Assignment</div>
                                                        <div className="space-y-1 font-medium text-slate-500">
                                                            <div className="flex justify-between items-center">
                                                                <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span><span>Selesai:</span></div>
                                                                <strong className="text-emerald-600 font-mono">{muatan.selesai.toLocaleString('id-ID')} <span className="text-[9px] text-slate-400 font-normal">({pctSelesai}%)</span></strong>
                                                            </div>
                                                            <div className="flex justify-between items-center">
                                                                <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span><span>Proses:</span></div>
                                                                <strong className="text-indigo-600 font-mono">{muatan.proses.toLocaleString('id-ID')} <span className="text-[9px] text-slate-400 font-normal">({pctProses}%)</span></strong>
                                                            </div>
                                                            <div className="flex justify-between items-center">
                                                                <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span><span>Belum:</span></div>
                                                                <strong className="text-slate-500 font-mono">{muatan.belum.toLocaleString('id-ID')} <span className="text-[9px] text-slate-400 font-normal">({pctBelum}%)</span></strong>
                                                            </div>
                                                        </div>
                                                        <div className="border-t border-slate-100 pt-1.5 mt-1.5 text-slate-700 font-black text-[10px] uppercase flex justify-between font-mono"><span>Total:</span><span>{totalTarget.toLocaleString('id-ID')}</span></div>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none z-10 transition-opacity duration-200 group-hover:opacity-20">
                                <span className="text-[14px] font-black text-slate-800 font-mono">{(dataMonitoringWilayah.muatanStatus.selesai + dataMonitoringWilayah.muatanStatus.proses + dataMonitoringWilayah.muatanStatus.belum).toLocaleString('id-ID')}</span>
                                <span className="text-[8px] text-slate-400 uppercase font-bold tracking-wider mt-0.5">Total Target</span>
                            </div>
                        </div>

                        <div className="space-y-2 mt-4">
                            {[
                                { label: 'SLS Selesai Didata', count: dataMonitoringWilayah.statusSls.selesai, color: 'bg-emerald-500' },
                                { label: 'SLS Sedang Didata', count: dataMonitoringWilayah.statusSls.sedang, color: 'bg-indigo-500' },
                                { label: 'SLS Belum Mulai', count: dataMonitoringWilayah.statusSls.belum, color: 'bg-slate-300' }
                            ].map((item) => {
                                const totalSls = dataMonitoringWilayah.statusSls.total || 1;
                                const pctSls = ((item.count / totalSls) * 100).toFixed(1);
                                return (
                                    <div key={item.label} className="flex items-center justify-between bg-slate-50/70 px-3 py-2 rounded-xl border border-slate-100 text-[10px] hover:bg-slate-100 transition-colors">
                                        <div className="flex items-center gap-2">
                                            <div className={`w-1.5 h-1.5 rounded-full ${item.color}`}></div>
                                            <span className="font-bold text-slate-500 uppercase tracking-wide">{item.label}</span>
                                        </div>
                                        <div className="flex items-center font-mono font-black text-slate-700">
                                            <div className="w-14 text-right pr-2">{item.count} <span className="text-[8px] text-slate-400 font-bold uppercase">SLS</span></div>
                                            <span className="text-slate-300 font-normal">|</span>
                                            <div className="w-12 text-right text-slate-600 text-[9px] pl-2">{pctSls}%</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            {/* SECTION GRAFIK TREN KEAKTIFAN */}
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
    
    {/* 🔥 PROSES PENGGANTIAN: Di sinilah tag Tooltip baru diletakkan */}
    <Tooltip 
        cursor={{ fill: '#f8fafc', opacity: 0.4 }} 
        content={({ active, payload }) => {
            if (active && payload && payload.length) {
                const data = payload[0].payload;
                return (
                    <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xl text-[11px] space-y-1.5 font-sans min-w-[160px] z-50">
                        {/* Judul Nama Kecamatan */}
                        <div className="font-black text-slate-800 uppercase tracking-wide border-b border-slate-100 pb-1 flex items-center gap-1 font-mono">
                            📍 {data.name}
                        </div>
                        
                        {/* Keterangan Jumlah Orang Riil */}
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

                        {/* Rasio Info Persentase Kecil di bawah */}
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
                                data={trendChartData}
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

            {/* UNIFIED CONTROL TOOLBAR */}
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
                        {/* 💡 SINKRONISASI KE STATE INPUT DENGAN DEBOUNCE EFFECT */}
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

            {/* LOWER BODY: LAYOUT TABEL & SIDEBAR DETAIL */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
                <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm w-full">
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
                                {filteredList.length === 0 ? (
                                    <tr>
                                        <td colSpan="5" className="p-12 text-center text-slate-400 bg-white">
                                            <div className="flex flex-col items-center justify-center gap-2">
                                                <UserX size={32} className="text-slate-200" />
                                                <span className="text-[11px] font-bold uppercase tracking-wider">Tidak ada data petugas pada kriteria & tanggal ini.</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredList.map((petugas) => {
                                        const tidakAktif = petugas.statusHariIni === 'ABSEN' || petugas.statusHariIni === 'STAGNAN';
                                        return (
                                            <tr key={petugas.email} className={`transition-colors cursor-pointer ${selectedPetugas?.email === petugas.email ? 'bg-indigo-50/60 border-l-4 border-l-indigo-600' : tidakAktif ? 'bg-slate-50/50 hover:bg-slate-100/70 border-l-4 border-l-transparent' : 'bg-white hover:bg-slate-50 border-l-4 border-l-transparent'}`} onClick={() => setSelectedPetugas(petugas)}>
                                                <td className="p-3 pl-4">
                                                    <div className={`text-xs ${tidakAktif ? 'text-slate-500 font-semibold' : 'font-black text-slate-800'}`}>{petugas.nama_petugas || 'Tanpa Nama'}</div>
                                                    <div className="text-[10px] text-slate-400 font-mono tracking-tight mt-0.5">{petugas.email}</div>
                                                </td>
                                                <td className="p-3 font-bold text-slate-600 flex items-center gap-1 mt-1.5"><MapPin size={12} className="text-slate-400" /> {petugas.kecamatan_tugas || '-'}</td>
                                                <td className="p-3">
                                                    <span className={`inline-block text-[9px] font-black tracking-wider px-2 py-1 rounded-md ${petugas.statusHariIni === 'AKTIF' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : petugas.statusHariIni === 'STAGNAN' ? 'bg-rose-100 text-rose-700 border border-rose-200 animate-pulse' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>{petugas.statusHariIni}</span>
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
                                                    <button className="text-[10px] text-indigo-600 bg-indigo-50 hover:bg-indigo-600 hover:text-white font-bold px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 transition-colors">Detail <ArrowRight size={10} /></button>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* SIDEBAR PANEL KANAN */}
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
                                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                                    <span className="text-[10px] text-slate-500 uppercase block font-black mb-3 flex items-center gap-1.5 border-b border-slate-100 pb-2"><Calendar size={13} className="text-indigo-500" /> Presensi Lapangan Juni 2026</span>
                                    <div className="grid grid-cols-7 gap-1.5 text-center text-[9px] font-black text-slate-400 uppercase mb-2">
                                        <div>S</div><div>S</div><div>R</div><div>K</div><div>J</div><div>S</div><div>M</div>
                                    </div>
                                    <div className="grid grid-cols-7 gap-1.5 text-center">
                                        {[...Array(4)].map((_, i) => <div key={`b-${i}`} className="h-6"></div>)}
                                        {[...Array(31)].map((_, i) => {
                                            const dateNum = i + 1;
                                            const isPetugasAktif = selectedPetugas.rawLogs?.some(l => parseInt(l.tanggal.split('-')[2], 10) === dateNum);
                                            let dateBg = "bg-slate-50 text-slate-400 border border-slate-100 hover:bg-slate-100";
                                            if (isPetugasAktif) dateBg = "bg-gradient-to-br from-emerald-400 to-emerald-500 text-white font-black shadow-md shadow-emerald-200 border-none";
                                            return <div key={dateNum} className={`h-6 w-full mx-auto rounded-lg text-[10px] flex items-center justify-center transition-all select-none cursor-default ${dateBg}`}>{dateNum}</div>;
                                        })}
                                    </div>
                                </div>
                                <div className="bg-indigo-50/50 p-3 rounded-xl border border-indigo-100/50 flex items-center gap-3">
                                    <div className="p-1.5 bg-white rounded-lg shadow-sm text-indigo-500"><MapPin size={14} /></div>
                                    <div>
                                        <span className="text-[9px] text-slate-400 uppercase block font-bold mb-0.5">Kecamatan Penugasan</span>
                                        <span className="text-xs font-black text-slate-700">Kecamatan {selectedPetugas.kecamatan_tugas || '-'}</span>
                                    </div>
                                </div>
                                <div>
                                    <span className="text-[10px] text-slate-500 uppercase font-black tracking-wider block mb-2 flex items-center gap-1.5 border-b border-slate-100 pb-2"><ShieldAlert size={12} className="text-slate-400" /> Daftar SLS Dikerjakan</span>
                                    <div className="max-h-40 overflow-y-auto space-y-1.5 bg-slate-50/50 p-1.5 rounded-xl border border-slate-100 scrollbar-thin">
                                        {selectedPetugas.daftarSls.length === 0 ? (
                                            <div className="text-[10px] text-slate-400 p-4 text-center font-bold">Belum ada jejak SLS di sistem.</div>
                                        ) : (
                                            selectedPetugas.daftarSls.map((sls, idx) => (
                                                <div key={idx} className="text-[10px] bg-white border border-slate-200 p-2.5 rounded-lg flex flex-col shadow-sm hover:shadow-md transition-shadow">
                                                    <span className="font-bold text-indigo-700">{sls?.nmsls || 'Unknown SLS'}</span>
                                                    <span className="text-[9px] font-bold text-slate-400 mt-0.5">Desa {sls?.nmdesa || '-'}</span>
                                                </div>
                                            ))
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

            {/* ✅ WINDOW BOX EVALUASI DENGAN SERVER SIDE INTEGRATION */}
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

            {/* ✅ WINDOW BOX PEMANTAUAN PETUGAS LAPANGAN (PPL) */}
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
        </div>
    );
}