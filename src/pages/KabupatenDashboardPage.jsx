import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import {
    BarChart, Bar, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Sector, LabelList
} from 'recharts';
import {
    ShieldAlert, Search, ArrowRight, User, Calendar, X, AlertTriangle, CheckCircle2, Clock, MapPin, UserX
} from 'lucide-react';

export default function DashboardPusat() {
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState('PCL'); // 'PCL' atau 'PML'
    const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'stagnan', 'aktif'

    // 🛡️ Kunci Sinkronisasi: State memegang 3 digit KODE KECAMATAN murni (e.g., "010")
    const [selectedKecamatan, setSelectedKecamatan] = useState(null);
    const [selectedKecTab, setSelectedKecTab] = useState("SEMUA");
const [viewModeTab, setViewModeTab] = useState("DESA"); // Pilihan: "DESA" atau "PETUGAS"
    const [daftarKecamatan, setDaftarKecamatan] = useState([]); // Menampung objek { kode: "010", label: "010 SELO" }
// Tambahkan di bawah baris state Anda (sekitar baris 20)
useEffect(() => {
    if (selectedKecTab === "SEMUA") {
        setViewModeTab("DESA");
    }
}, [selectedKecTab]);
    // Core Data States
    const [globalMetrics, setGlobalMetrics] = useState({ totalPcl: 0, pclAktifHariIni: 0, totalPml: 0, pmlAktifHariIni: 0, totalStagnan: 0 });
    const [filteredMetrics, setFilteredMetrics] = useState({ totalPcl: 0, pclAktifHariIni: 0, totalPml: 0, pmlAktifHariIni: 0, totalStagnan: 0 });
    const [masterPclList, setMasterPclList] = useState([]);
    const [masterPmlList, setMasterPmlList] = useState([]);
    const [kecamatanChartData, setKecamatanChartData] = useState([]);
    const [selectedPetugas, setSelectedPetugas] = useState(null);
    const [trendChartData, setTrendChartData] = useState([]);

    // Raw Data States
    const [rawPetugas, setRawPetugas] = useState([]);
    const [rawLogsPcl, setRawLogsPcl] = useState([]);
    const [rawRealisasiPml, setRawRealisasiPml] = useState([]);
    const [rawMasterSls, setRawMasterSls] = useState([]);

    useEffect(() => { fetchOperationalData(); }, []);

    // Helper Taktis: Mengekstrak 3 digit kode di depan kolom kecamatan_tugas petugas (e.g., "010 SELO" -> "010")
    const ekstrakKodeKecPetugas = (stringKec) => {
        if (!stringKec) return "";
        const match = String(stringKec).trim().match(/^\d+/);
        return match ? match[0] : "";
    };

    // 1. ENGINE AGREGASI SENSUS (MEMBENTUK STRUKTUR KECAMATAN & DESA)
const dataMonitoringWilayah = useMemo(() => {
    // Jika Anda ingin mengintip datanya di console browser untuk memastikan, kodenya ada di sini:
    const rekapKecamatan = {};
    const rekapDesa = {};
    const rekapPetugas = {}; // Tempat penampungan agregasi per PCL

    // 1. Loop Pertama: Membangun Agregasi Struktur Wilayah & Petugas
    rawMasterSls.forEach(sls => {
        const kodeKec = sls.kdkec ? String(sls.kdkec).trim() : "";
        const kodeDesa = sls.kddesa ? String(sls.kddesa).trim() : "";
        
        // 🛠️ SEKARANG SUDAH SESUAI DENGAN KOLOM DATABASE ANDA:
const idPetugas = sls.petugas_id ? String(sls.petugas_id).trim() : ""; 

// 🎯 Ambil nama dari objek berelasi (PostgREST Supabase Join)
const namaDariJoin = sls.petugas?.nama_petugas || sls.petugas_id?.nama_petugas;

// Jika objek join ada, gunakan nama asli. Jika tidak ada, baru potong email sebagai cadangan.
const namaMentah = namaDariJoin || (idPetugas ? idPetugas.split('@')[0] : "Tanpa Petugas");

// 🔥 PAKSA MENJADI UPPERCASE SEMUA
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

        // Agregasi Tingkat Kecamatan
        if (!rekapKecamatan[kodeKec]) {
            rekapKecamatan[kodeKec] = {
                kode: kodeKec, nama_asli: namaKec, nama: `[${kodeKec}] ${namaKec}`,
                total_target: 0, total_realisasi: 0, jml_sls: 0, sls_selesai: 0,
                muatan_selesat: 0, muatan_sedang: 0, muatan_belum: 0
            };
        }
        rekapKecamatan[kodeKec].total_target += targetDinamis;
        rekapKecamatan[kodeKec].total_realisasi += realisasi;
        rekapKecamatan[kodeKec].jml_sls += 1;
        rekapKecamatan[kodeKec].muatan_selesat += muatanSelesai;
        rekapKecamatan[kodeKec].muatan_sedang += muatanSedang;
        rekapKecamatan[kodeKec].muatan_belum += muatanBelum;
        if (isSelesai) rekapKecamatan[kodeKec].sls_selesai += 1;

        // Agregasi Tingkat Desa
        const keyDesa = `${kodeKec}-${kodeDesa}`;
        if (!rekapDesa[keyDesa]) {
            rekapDesa[keyDesa] = {
                kode: kodeDesa, kodeKec: kodeKec, nama_asli: namaDesa, nama: `[${kodeDesa}] ${namaDesa}`,
                total_target: 0, total_realisasi: 0, jml_sls: 0, sls_selesai: 0,
                muatan_selesat: 0, muatan_sedang: 0, muatan_belum: 0
            };
        }
        rekapDesa[keyDesa].total_target += targetDinamis;
        rekapDesa[keyDesa].total_realisasi += realisasi;
        rekapDesa[keyDesa].jml_sls += 1;
        rekapDesa[keyDesa].muatan_selesat += muatanSelesai;
        rekapDesa[keyDesa].muatan_sedang += muatanSedang;
        rekapDesa[keyDesa].muatan_belum += muatanBelum;
        if (isSelesai) rekapDesa[keyDesa].sls_selesai += 1;

        // 🏃‍♂️ AGREGASI TINGKAT PETUGAS (Menggunakan kombinasi kecamatan agar unik)
        if (idPetugas) {
            const keyPetugas = `${kodeKec}-${idPetugas}`; 
            if (!rekapPetugas[keyPetugas]) {
                rekapPetugas[keyPetugas] = {
                    kode: idPetugas, 
                    kodeKec: kodeKec, 
                    nama_asli: namaPetugas, 
                    nama: namaPetugas, // Dibaca oleh XAxis Chart
                    total_target: 0, 
                    total_realisasi: 0, 
                    jml_sls: 0, 
                    sls_selesai: 0,
                    muatan_selesat: 0, 
                    muatan_sedang: 0, 
                    muatan_belum: 0
                };
            }
            rekapPetugas[keyPetugas].total_target += targetDinamis;
            rekapPetugas[keyPetugas].total_realisasi += realisasi;
            rekapPetugas[keyPetugas].jml_sls += 1;
            rekapPetugas[keyPetugas].muatan_selesat += muatanSelesai;
            rekapPetugas[keyPetugas].muatan_sedang += muatanSedang;
            rekapPetugas[keyPetugas].muatan_belum += muatanBelum;
            if (isSelesai) rekapPetugas[keyPetugas].sls_selesai += 1;
        }
    });

    // 2. Loop Kedua: Statistik Ringkasan Terfilter (Tetap Sesuai Target Filter)
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

    // 3. Helper Konversi Ke Persentase
    const calculateStatus = (item) => {
        const totalTargetWilayah = item.total_target || 1;
        const selesai = Math.round((item.muatan_selesat / totalTargetWilayah) * 100);
        const sedang = Math.round((item.muatan_sedang / totalTargetWilayah) * 100);
        const belum = Math.max(0, 100 - selesai - sedang);
        const persen = totalTargetWilayah > 0 ? Math.min(Math.round((item.total_realisasi / totalTargetWilayah) * 100), 100) : 0;

        return { selesai, sedang, belum, persen };
    };

    const kecamatanList = Object.values(rekapKecamatan).map(item => ({ ...item, ...calculateStatus(item) }))
        .sort((a, b) => a.kode.localeCompare(b.kode, 'id', { numeric: true }));

    const desaList = Object.values(rekapDesa).map(item => ({ ...item, ...calculateStatus(item) }))
        .sort((a, b) => a.kode.localeCompare(b.kode, 'id', { numeric: true }));

    const petugasList = Object.values(rekapPetugas).map(item => ({ ...item, ...calculateStatus(item) }))
        .sort((a, b) => b.persen - a.persen); // Diurutkan berdasarkan performa muatan tertinggi

    return {
        kecamatan: kecamatanList,
        desa: desaList,
        petugas: petugasList,
        statusSls: rekapStatusSls,
        muatanStatus: muatanStatus
    };
}, [rawMasterSls, selectedKecTab]);

    // Menemukan teks nama asli kecamatan terpilih berdasarkan kodenya saat ini (untuk display label)
    const namaKecamatanTerpilihText = useMemo(() => {
        if (!selectedKecamatan) return null;
        const match = dataMonitoringWilayah.kecamatan.find(k => k.kode === selectedKecamatan);
        return match ? match.nama_asli : null;
    }, [selectedKecamatan, dataMonitoringWilayah]);

    // 2. REKALKULASI METRIK & TREN LINE CHART (BERDASARKAN KODE KECAMATAN 3 DIGIT)
    useEffect(() => {
        const now = new Date();

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
                const d = new Date();
                d.setDate(now.getDate() - i);

                const dateString = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

                const pclAktifTgl = logPclMap.get(dateString)?.size || 0;
                const pclPct = listPcl.length > 0 ? Math.round((pclAktifTgl / listPcl.length) * 100) : 0;

                const pmlAktifTgl = logPmlMap.get(dateString)?.size || 0;
                const pmlPct = listPml.length > 0 ? Math.round((pmlAktifTgl / listPml.length) * 100) : 0;

                trendDataRaw.push({
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
            setFilteredMetrics(globalMetrics);
            setTrendChartData(hitungTrenHarian(masterPclList, masterPmlList, seluruhLogPcl, seluruhLogPml));
            return;
        }

        // Filter menggunakan ekstraksi 3 digit kode dari kecamatan_tugas petugas
        const pclKec = masterPclList.filter(p => ekstrakKodeKecPetugas(p.kecamatan_tugas) === selectedKecamatan);
        const pmlKec = masterPmlList.filter(p => ekstrakKodeKecPetugas(p.kecamatan_tugas) === selectedKecamatan);

        const pclAktif = pclKec.filter(p => p.statusHariIni === 'AKTIF').length;
        const pmlAktif = pmlKec.filter(p => p.statusHariIni === 'AKTIF').length;
        const stagnan = [...pclKec, ...pmlKec].filter(p => p.isStagnan).length;

        setFilteredMetrics({
            totalPcl: pclKec.length,
            pclAktifHariIni: pclAktif,
            totalPml: pmlKec.length,
            pmlAktifHariIni: pmlAktif,
            totalStagnan: stagnan
        });

        const logPclKec = seluruhLogPcl.filter(l => pclKec.some(p => p.email === l.petugas_email));
        const logPmlKec = seluruhLogPml.filter(l => pmlKec.some(p => p.email === l.pml_email));

        setTrendChartData(hitungTrenHarian(pclKec, pmlKec, logPclKec, logPmlKec));

    }, [selectedKecamatan, globalMetrics, masterPclList, masterPmlList]);

    // 3. AMBIL DATA OPERASIONAL DARI SUPABASE
    const fetchOperationalData = async () => {
        setLoading(true);
        const now = new Date();
        const tglHariIni = now.toISOString().split('T')[0];

        const [petugasRes, logsPclRes, logsPmlRes, masterSlsRes, realisasiPmlRes] = await Promise.all([
            supabase.from('petugas').select('email, nama_petugas, posisi_tugas, status, kecamatan_tugas').eq('status', 'Diterima'),
            supabase.from('log_checkin_pcl').select('idsubsls, tanggal, petugas_email'),
            supabase.from('log_checkin_pml').select('pml_email, tanggal, idsubsls'),
            supabase.from('muatan_sls').select('idsubsls, kdkec, nmkec, kddesa, nmdesa, jml_muatan, realisasi_pencacahan, is_selesai, petugas_id, petugas(nama_petugas)'),
            supabase.from('log_realisasi_pml').select('tanggal, pml_email')
        ]);

        if (petugasRes.error || logsPclRes.error || logsPmlRes.error || masterSlsRes.error || realisasiPmlRes.error) {
            console.error("Gagal mengambil data operasional atau realisasi");
            setLoading(false);
            return;
        }

        const allPetugas = petugasRes.data;
        const logsPcl = logsPclRes.data;
        const logsPml = logsPmlRes.data;
        const masterSls = masterSlsRes.data;
        const realisasiPml = realisasiPmlRes.data;

        setRawPetugas(allPetugas);
        setRawLogsPcl(logsPcl);
        setRawRealisasiPml(realisasiPml);
        setRawMasterSls(masterSls);

        const slsMap = new Map(masterSls.map(s => [s.idsubsls, s]));

        // Sinkronisasi data dropdown list berdasarkan isian tabel petugas yang unik & valid kodenya
        const rawDaftarKec = Array.from(new Set(allPetugas.map(p => p.kecamatan_tugas).filter(Boolean)));
        const sortedKecTeks = rawDaftarKec.sort((a, b) => a.localeCompare(b, 'id', { numeric: true }));

        // Bentuk objek berpasangan agar value dropdown menggunakan kodenya saja
        const dropdownObjList = sortedKecTeks.map(str => ({
            kode: ekstrakKodeKecPetugas(str),
            label: str
        })).filter(item => item.kode !== "");
        setDaftarKecamatan(dropdownObjList);

        const allPcl = allPetugas.filter(p => p.posisi_tugas === 'PCL');
        const allPml = allPetugas.filter(p => p.posisi_tugas === 'PML');

        let pclAktifCount = 0;
        let pmlAktifCount = 0;
        let totalStagnanCount = 0;

        const detailedPcl = allPcl.map(pcl => {
            const pclLogs = logsPcl.filter(l => l.petugas_email === pcl.email);
            const checkinHariIni = pclLogs.some(l => l.tanggal === tglHariIni);
            if (checkinHariIni) pclAktifCount++;

            const urutLog = [...pclLogs].sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));
            const terakhirActivity = urutLog.length > 0 ? new Date(urutLog[0].tanggal) : null;
            const hariSelesai = terakhirActivity ? Math.floor((now - terakhirActivity) / (1000 * 60 * 60 * 24)) : 999;
            const isStagnan = hariSelesai >= 3;
            if (isStagnan) totalStagnanCount++;

            const jangkauanSls = Array.from(new Set(pclLogs.map(l => l.idsubsls))).map(id => {
                return slsMap.get(id) || { nmsls: 'Unknown SLS', nmkec: '-' };
            });

            return {
                ...pcl,
                terakhirAktivitas: terakhirActivity ? terakhirActivity.toLocaleDateString('id-ID') : 'Belum Lapangan',
                hariSifatStagnan: hariSelesai,
                isStagnan,
                statusHariIni: checkinHariIni ? 'AKTIF' : (isStagnan ? 'STAGNAN' : 'ABSEN'),
                totalSlsDisentuh: jangkauanSls.length,
                daftarSls: jangkauanSls,
                totalInput: pclLogs.length,
                arrayTanggalAktif: pclLogs.map(l => parseInt(l.tanggal.split('-')[2], 10)),
                rawLogs: pclLogs
            };
        });

        const detailedPml = allPml.map(pml => {
            const pmlLogs = logsPml.filter(l => l.pml_email === pml.email);
            const checkinHariIni = pmlLogs.some(l => l.tanggal === tglHariIni);
            if (checkinHariIni) pmlAktifCount++;

            const urutLog = [...pmlLogs].sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));
            const terakhirActivity = urutLog.length > 0 ? new Date(urutLog[0].tanggal) : null;
            const hariSelesai = terakhirActivity ? Math.floor((now - terakhirActivity) / (1000 * 60 * 60 * 24)) : 999;
            const isStagnan = hariSelesai >= 3;
            if (isStagnan) totalStagnanCount++;

            const jangkauanSls = Array.from(new Set(pmlLogs.map(l => l.idsubsls))).map(id => {
                return slsMap.get(id) || { nmsls: 'Unknown SLS', nmkec: '-' };
            });

            return {
                ...pml,
                terakhirAktivitas: terakhirActivity ? terakhirActivity.toLocaleDateString('id-ID') : 'Belum Lapangan',
                hariSifatStagnan: hariSelesai,
                isStagnan,
                statusHariIni: checkinHariIni ? 'AKTIF' : (isStagnan ? 'STAGNAN' : 'ABSEN'),
                totalSlsDisentuh: jangkauanSls.length,
                daftarSls: jangkauanSls,
                totalInput: pmlLogs.length,
                arrayTanggalAktif: pmlLogs.map(l => parseInt(l.tanggal.split('-')[2], 10)),
                rawLogs: pmlLogs
            };
        });

        setGlobalMetrics({
            totalPcl: allPcl.length,
            pclAktifHariIni: pclAktifCount,
            totalPml: allPml.length,
            pmlAktifHariIni: pmlAktifCount,
            totalStagnan: totalStagnanCount
        });

        setMasterPclList(detailedPcl.sort((a, b) => (a.kecamatan_tugas || '').localeCompare(b.kecamatan_tugas || '', 'id', { numeric: true })));
        setMasterPmlList(detailedPml.sort((a, b) => (a.kecamatan_tugas || '').localeCompare(b.kecamatan_tugas || '', 'id', { numeric: true })));
        setLoading(false);
    };

    // 4. GENERATE DATA SUNTIKAN UNTUK RASIO KEAKTIFAN UTAMAA (GRAFIK KIRI)
    useEffect(() => {
        if (daftarKecamatan.length === 0) return;
        const chartAgregasi = daftarKecamatan.map(item => {
            const pclKec = masterPclList.filter(p => ekstrakKodeKecPetugas(p.kecamatan_tugas) === item.kode);
            const pmlKec = masterPmlList.filter(p => ekstrakKodeKecPetugas(p.kecamatan_tugas) === item.kode);

            return {
                name: item.label, // Tetap gunakan label "010 SELO" agar grafik terbaca rapi
                kode: item.kode,  // Sisipkan properti kode murni demi keperluan event klik Recharts
                'PCL Aktif (%)': pclKec.length > 0 ? Math.round((pclKec.filter(p => p.statusHariIni === 'AKTIF').length / pclKec.length) * 100) : 0,
                'PML Aktif (%)': pmlKec.length > 0 ? Math.round((pmlKec.filter(p => p.statusHariIni === 'AKTIF').length / pmlKec.length) * 100) : 0
            };
        });
        setKecamatanChartData(chartAgregasi);
    }, [daftarKecamatan, masterPclList, masterPmlList]);

    // 5. MEMPROSES DATA FILTERING SIKLUS 2-1-2-1
const progresSiklusTerfilter = useMemo(() => {
    const petugasTerfilter = selectedKecamatan
        ? rawPetugas.filter(p => ekstrakKodeKecPetugas(p.kecamatan_tugas) === selectedKecamatan)
        : rawPetugas;

    const pclKecamatan = petugasTerfilter.filter(p => p.posisi_tugas === 'PCL');
    const pmlKecamatan = petugasTerfilter.filter(p => p.posisi_tugas === 'PML');

    const emailPclSet = new Set(pclKecamatan.map(p => p.email));
    const emailPmlSet = new Set(pmlKecamatan.map(p => p.email));

    const hasilSiklus = [];
    for (let d = 15; d <= 20; d++) {
        const dateString = `2026-06-${d.toString().padStart(2, '0')}`;
        const targetHariIni = [15, 16, 18, 19].includes(d) ? 'PENDATAAN' : 'EVALUASI';

        let petugasAktif = 0;
        let petugasAbsen = 0;
        let totalTargetSiklus = 0;
        let persentase = 0;

        if (targetHariIni === 'PENDATAAN') {
            totalTargetSiklus = pclKecamatan.length;
            petugasAktif = new Set(
                rawLogsPcl
                    .filter(l => l.tanggal === dateString && emailPclSet.has(l.petugas_email))
                    .map(l => l.petugas_email)
            ).size;
            petugasAbsen = totalTargetSiklus - petugasAktif;
            
            // 🛠️ PERBAIKAN: Hapus Math.round agar menghasilkan desimal murni
            persentase = totalTargetSiklus > 0 ? (petugasAktif / totalTargetSiklus) * 100 : 0;
        } else {
            totalTargetSiklus = pmlKecamatan.length;
            petugasAktif = new Set(
                rawRealisasiPml
                    .filter(r => r.tanggal === dateString && emailPmlSet.has(r.pml_email))
                    .map(r => r.pml_email)
            ).size;
            petugasAbsen = totalTargetSiklus - petugasAktif;
            
            // 🛠️ PERBAIKAN: Hapus Math.round agar menghasilkan desimal murni
            persentase = totalTargetSiklus > 0 ? (petugasAktif / totalTargetSiklus) * 100 : 0;
        }

        hasilSiklus.push({
            tanggal: `${d} Juni 2026`,
            target: targetHariIni,
            aktif: petugasAktif,
            absen: petugasAbsen,
            total: totalTargetSiklus,
            persentase: persentase // Menyimpan data desimal lengkap (cth: 75.3333333333)
        });
    }
    return hasilSiklus;
}, [selectedKecamatan, rawPetugas, rawLogsPcl, rawRealisasiPml]);

    // 6. FILTER PETUGAS UNTUK BADAN TABEL BAWAH
    const filteredList = useMemo(() => {
        const listDataAktif = activeTab === 'PCL' ? masterPclList : masterPmlList;
        return listDataAktif.filter(p => {
            const matchSearch = (p.nama_petugas || '').toLowerCase().includes(searchTerm.toLowerCase()) || p.email.toLowerCase().includes(searchTerm.toLowerCase());
            const matchKecamatan = selectedKecamatan ? ekstrakKodeKecPetugas(p.kecamatan_tugas) === selectedKecamatan : true;

            if (filterStatus === 'stagnan') return matchSearch && matchKecamatan && p.isStagnan;
            if (filterStatus === 'aktif') return matchSearch && matchKecamatan && p.statusHariIni === 'AKTIF';
            return matchSearch && matchKecamatan;
        });
    }, [activeTab, masterPclList, masterPmlList, searchTerm, selectedKecamatan, filterStatus]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-slate-50 text-slate-500 text-xs font-bold tracking-wider">
                <div className="animate-pulse">MENYUSUN DATA LAPORAN KABUPATEN...</div>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-6 bg-slate-50 min-h-screen text-slate-800 font-sans antialiased">

            {/* HEADER */}
            <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-2 border-b border-slate-200 pb-4">
                <div>
                    <h1 className="text-sm font-black tracking-wider text-slate-800 uppercase flex items-center gap-2">
                        <ShieldAlert className="text-indigo-600" size={16} /> Dashboard Lapangan Sensus Ekonomi 2026
                    </h1>
                    <p className="text-[11px] text-slate-400 font-medium">Monitoring Pemantauan Lapangan Sensus Ekonomi 2026 BPS Kabupaten Boyolali</p>
                </div>
                <button onClick={fetchOperationalData} className="text-[10px] bg-white border border-slate-200 px-3 py-1.5 rounded-xl text-indigo-600 font-black hover:bg-slate-100 transition shadow-sm">
                    REFRESH DATA REALTIME
                </button>
            </div>

            {/* MONITORING METRICS BOARD */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">PPL yang Jalan Lapangan Hari Ini {namaKecamatanTerpilihText && `(${namaKecamatanTerpilihText})`}</div>
                    <div className="flex items-baseline justify-between mt-1">
                        <div className="text-xl font-black text-slate-800">
                            {filteredMetrics.pclAktifHariIni}
                            <span className="text-xs font-normal text-slate-400">/{filteredMetrics.totalPcl} PPL</span>
                        </div>
                        <div className="text-sm font-black text-indigo-600">
                            {filteredMetrics.totalPcl > 0 ? Math.round((filteredMetrics.pclAktifHariIni / filteredMetrics.totalPcl) * 100) : 0}%
                        </div>
                    </div>
                    <div className="w-full bg-slate-100 h-1 mt-2 rounded-full overflow-hidden">
                        <div className="bg-indigo-600 h-full transition-all duration-300" style={{ width: `${filteredMetrics.totalPcl > 0 ? (filteredMetrics.pclAktifHariIni / filteredMetrics.totalPcl) * 100 : 0}%` }}></div>
                    </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="text-[10px] font-bold text-slate-400 tracking-tight uppercase">PML yang Jalan Lapangan Hari Ini {namaKecamatanTerpilihText && `(${namaKecamatanTerpilihText})`}</div>
                    <div className="flex items-baseline justify-between mt-1">
                        <div className="text-xl font-black text-indigo-600">
                            {filteredMetrics.pmlAktifHariIni}
                            <span className="text-xs font-normal text-slate-400">/{filteredMetrics.totalPml} PML</span>
                        </div>
                        <div className="text-sm font-black text-indigo-600">
                            {filteredMetrics.totalPml > 0 ? Math.round((filteredMetrics.pmlAktifHariIni / filteredMetrics.totalPml) * 100) : 0}%
                        </div>
                    </div>
                    <div className="w-full bg-slate-100 h-1 mt-2 rounded-full overflow-hidden">
                        <div className="bg-indigo-600 h-full transition-all duration-300" style={{ width: `${filteredMetrics.totalPml > 0 ? (filteredMetrics.pmlAktifHariIni / filteredMetrics.totalPml) * 100 : 0}%` }}></div>
                    </div>
                </div>

                <div className="bg-rose-50 p-4 rounded-2xl border border-rose-100 shadow-sm">
                    <div className="text-[10px] font-bold text-rose-600 uppercase tracking-tight">Total Petugas Tidak Aktif</div>
                    <div className="flex items-baseline justify-between mt-1">
                        <div className="text-xl font-black text-rose-600">
                            {filteredMetrics.totalStagnan}
                            <span className="text-xs font-normal text-rose-400"> Petugas</span>
                        </div>
                        <div className="text-xs font-bold text-rose-500">
                            {((filteredMetrics.totalPcl + filteredMetrics.totalPml) > 0) ? Math.round((filteredMetrics.totalStagnan / (filteredMetrics.totalPcl + filteredMetrics.totalPml)) * 100) : 0}%
                        </div>
                    </div>
                    <div className="text-[9px] text-rose-400 font-bold mt-1">Tidak Aktif ke Lapangan &gt;= 3 hari.</div>
                </div>

                {/* 👔 DROPDOWN UTAMA: MENGGUNAKAN VALUE KODE 3 DIGIT MURNI */}
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div className="w-full">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-1">Filter Wilayah</div>
                        <select
                            className="w-full text-xs font-black text-indigo-600 uppercase bg-indigo-50 px-2 py-1.5 rounded-lg border border-indigo-100 focus:outline-none cursor-pointer"
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
                                <option key={kec.kode} value={kec.kode}> {kec.label}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* SECTION JADWAL KHUSUS SIKLUS 2-1-2-1 */}
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm mb-6">
                <h3 className="text-xs font-black uppercase text-slate-800 mb-4">
                    Monitoring Pelaksanaan 2-1-2-1 {namaKecamatanTerpilihText ? `Kec. ${namaKecamatanTerpilihText}` : '(Kabupaten)'}
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                    {progresSiklusTerfilter.map((item, idx) => {
                        const isLapangan = item.target === 'PENDATAAN';
                        return (
                            <div key={idx} className={`p-3 rounded-2xl border flex flex-col justify-between ${isLapangan ? 'bg-indigo-50 border-indigo-100' : 'bg-emerald-50 border-emerald-100'}`}>
                                <div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-[9px] font-bold text-slate-400 uppercase">{item.tanggal}</span>
                                        <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded-md ${isLapangan ? 'bg-indigo-200/50 text-indigo-700' : 'bg-emerald-200/60 text-emerald-700'}`}>
                                            {item.target}
                                        </span>
                                    </div>
                                    <div className="mt-2">
                                        <div className={`text-xl font-black ${item.persentase > 70 ? (isLapangan ? 'text-indigo-600' : 'text-emerald-600') : 'text-rose-500'}`}>
                                            {Number(item.persentase).toFixed(2)}%
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-3 space-y-1 text-[10px] border-t pt-2 border-slate-200/40">
                                    {isLapangan ? (
                                        <>
                                            <div className="text-slate-600 font-medium flex items-center gap-1.5">
                                                <MapPin size={12} className="text-emerald-500" />
                                                <span>Jalan Lapangan: <strong className="text-slate-800">{item.aktif} Petugas</strong></span>
                                            </div>
                                            <div className="text-rose-600 font-medium flex items-center gap-1.5">
                                                <UserX size={12} className="text-rose-500" />
                                                <span>Tidak Aktif: <strong>{item.absen} Petugas</strong></span>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="text-slate-600 font-medium flex items-center gap-1.5">
                                                <CheckCircle2 size={12} className="text-emerald-500" />
                                                <span>Sudah Evaluasi: <strong className="text-slate-800">{item.aktif} TIM</strong></span>
                                            </div>
                                            <div className="text-slate-400 font-medium flex items-center gap-1.5">
                                                <Clock size={12} className="text-slate-400" />
                                                <span>Belum Evaluasi: <strong className="text-slate-800">{item.absen} TIM</strong></span>
                                            </div>
                                        </>
                                    )}
                                </div>

                                <div className="w-full bg-white h-1.5 rounded-full mt-2 overflow-hidden border border-slate-100">
                                    <div
                                        className={`h-full transition-all duration-500 ${isLapangan ? 'bg-indigo-600' : 'bg-emerald-600'}`}
                                        style={{ width: `${item.persentase}%` }}
                                    ></div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* DIAGRAM BATANG MONITORING AGREGAT WILAYAH REALISASI */}
            {/* DIAGRAM BATANG & PANEL INFO STATUS SLS (3/4 : 1/4) */}
<div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm mb-6">
    {/* Judul & Kontrol */}
    <div className="flex justify-between items-center mb-6">
        <div>
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                {selectedKecTab === "SEMUA" 
                    ? "Capaian Realisasi Lapangan Kabupaten (Per Kecamatan)" 
                    : `Capaian Realisasi Lapangan Kec. ${namaKecamatanTerpilihText} (Per ${viewModeTab})`}
            </h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">
                Visualisasi Progress Muatan Yang Sudah Didata Lapangan Berdasarkan {selectedKecTab === "SEMUA" ? "Kecamatan" : (viewModeTab === "DESA" ? "Desa" : "Petugas")}
            </p>
        </div>

        <div className="flex items-center gap-3">
            {/* SWITCH TOGGLE: Hanya muncul jika sudah masuk ke level kecamatan */}
            {selectedKecTab !== "SEMUA" && (
                <div className="bg-slate-100 p-1 rounded-xl flex gap-1 border border-slate-200/60">
                    <button
                        onClick={() => setViewModeTab("DESA")}
                        className={`text-[9px] font-black px-2.5 py-1 rounded-lg transition-all uppercase tracking-wide ${viewModeTab === "DESA" ? "bg-white text-slate-800 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
                    >
                        📍 Per Desa
                    </button>
                    <button
                        onClick={() => setViewModeTab("PETUGAS")}
                        className={`text-[9px] font-black px-2.5 py-1 rounded-lg transition-all uppercase tracking-wide ${viewModeTab === "PETUGAS" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
                    >
                        🏃‍♂️ Per Petugas
                    </button>
                </div>
            )}

            {selectedKecTab !== "SEMUA" && (
                <button
                    onClick={() => { setSelectedKecTab("SEMUA"); setSelectedKecamatan(null); }}
                    className="bg-slate-800 hover:bg-slate-900 text-white text-[9px] font-black px-3 py-1.5 rounded-xl transition-all uppercase tracking-wider"
                >
                    ← Kembali
                </button>
            )}
        </div>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        {/* BAGIAN 1: DIAGRAM BATANG (Lebar 3/4) */}
        <div className="lg:col-span-3 w-full overflow-x-auto overflow-y-hidden scrollbar-thin">
            <div className="h-72 w-full min-w-[500px] md:min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                        data={
                            selectedKecTab === "SEMUA" 
                                ? dataMonitoringWilayah.kecamatan 
                                : viewModeTab === "DESA"
                                    ? dataMonitoringWilayah.desa.filter(d => d.kodeKec === selectedKecTab)
                                    : dataMonitoringWilayah.petugas.filter(p => p.kodeKec === selectedKecTab)
                        }
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
                                        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xl text-[11px] space-y-1.5 font-sans min-w-[170px]">
                                            <div className="font-black text-slate-800 uppercase tracking-wide border-b border-slate-100 pb-1.5 mb-1 flex items-center gap-1">
                                                {viewModeTab === "PETUGAS" && selectedKecTab !== "SEMUA" ? "🏃‍♂️" : "📍"} {data.nama_asli}
                                            </div>
                                            
                                            <div className="space-y-1 font-medium text-slate-500">
                                                <div className="flex justify-between">
                                                    <span>Realisasi Muatan:</span> 
                                                    <strong className="text-emerald-600 font-mono">{data.total_realisasi.toLocaleString('id-ID')} / {data.total_target.toLocaleString('id-ID')}</strong>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span>Selesai:</span> 
                                                    <strong className="text-emerald-600 font-mono">{data.selesai}%</strong>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span>Sedang:</span> 
                                                    <strong className="text-indigo-600 font-mono">{data.sedang}%</strong>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span>Belum:</span> 
                                                    <strong className="text-slate-600 font-mono">{data.belum}%</strong>
                                                </div>
                                            </div>

                                            <div className="border-t border-slate-100 pt-1.5 mt-1.5 text-slate-400 font-bold text-[9px] uppercase flex justify-between">
                                                <span>SLS Selesai:</span>
                                                <span>{data.sls_selesai} / {data.jml_sls} SLS</span>
                                            </div>
                                        </div>
                                    );
                                }
                                return null;
                            }}
                        />

                        <Bar dataKey="selesai" stackId="a" fill="#10b981" maxBarSize={30} radius={[0, 0, 0, 0]} />
                        <Bar dataKey="sedang" stackId="a" fill="#6366f1" maxBarSize={30} radius={[0, 0, 0, 0]} />
                        <Bar dataKey="belum" stackId="a" fill="#cacaca" maxBarSize={30} radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>

        {/* BAGIAN 2: PANEL INFORMASI INTEGRASI (Lebar 1/4) */}
        <div className="lg:col-span-1 space-y-4 border-l border-slate-100 pl-2 lg:pl-4">
    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
        Volume Progres Assignment Lapangan
    </div>

    {/* Diagram Lingkaran - Ditambahkan kelas 'group' untuk kontrol z-index dinamis */}
    <div className="h-40 w-full relative group">
        <ResponsiveContainer width="100%" height="100%">
            <PieChart>
                <Pie
                    data={[
                        { name: 'Selesai', value: dataMonitoringWilayah.muatanStatus.selesai },
                        { name: 'Proses', value: dataMonitoringWilayah.muatanStatus.proses },
                        { name: 'Belum', value: dataMonitoringWilayah.muatanStatus.belum },
                    ]}
                    cx="50%" cy="50%"
                    innerRadius={41} outerRadius={59}
                    paddingAngle={4}
                    dataKey="value"
                >
                    <Cell fill="#10b981" />
                    <Cell fill="#6366f1" />
                    <Cell fill="#cacaca" />
                </Pie>
                
                {/* 🎯 SOLUSI 1: Menonaktifkan pointer events SVG bawaan agar posisi kursor stabil */}
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
                                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xl text-[11px] space-y-2 font-sans min-w-[190px]">
                                    <div className="font-black text-slate-800 uppercase tracking-wide border-b border-slate-100 pb-1.5 mb-1 flex items-center gap-1">
                                        📊 Rekapitulasi Assignment
                                    </div>
                                    
                                    <div className="space-y-1 font-medium text-slate-500">
                                        <div className="flex justify-between items-center gap-4">
                                            <div className="flex items-center gap-1.5">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                                <span>Selesai:</span>
                                            </div>
                                            <strong className="text-emerald-600 font-mono">
                                                {muatan.selesai.toLocaleString('id-ID')} <span className="text-[9px] text-slate-400 font-normal">({pctSelesai}%)</span>
                                            </strong>
                                        </div>

                                        <div className="flex justify-between items-center gap-4">
                                            <div className="flex items-center gap-1.5">
                                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                                                <span>Proses:</span>
                                            </div>
                                            <strong className="text-indigo-600 font-mono">
                                                {muatan.proses.toLocaleString('id-ID')} <span className="text-[9px] text-slate-400 font-normal">({pctProses}%)</span>
                                            </strong>
                                        </div>

                                        <div className="flex justify-between items-center gap-4">
                                            <div className="flex items-center gap-1.5">
                                                <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                                                <span>Belum Mulai:</span>
                                            </div>
                                            <strong className="text-slate-600 font-mono">
                                                {muatan.belum.toLocaleString('id-ID')} <span className="text-[9px] text-slate-400 font-normal">({pctBelum}%)</span>
                                            </strong>
                                        </div>
                                    </div>

                                    <div className="border-t border-slate-100 pt-1.5 mt-1.5 text-slate-700 font-black text-[10px] uppercase flex justify-between font-mono">
                                        <span>Total Assignment:</span>
                                        <span>{totalTarget.toLocaleString('id-ID')}</span>
                                    </div>
                                </div>
                            );
                        }
                        return null;
                    }}
                />
            </PieChart>
        </ResponsiveContainer>
        
        {/* 🎯 SOLUSI 2: Ditambahkan z-10, pointer-events-none, dan transisi opasitas group-hover */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none z-10 transition-opacity duration-200 group-hover:opacity-10 shadow-none">
            <span className="text-[14px] font-black text-slate-800 font-mono">
                {(dataMonitoringWilayah.muatanStatus.selesai + dataMonitoringWilayah.muatanStatus.proses + dataMonitoringWilayah.muatanStatus.belum).toLocaleString('id-ID')}
            </span>
            <span className="text-[8px] text-slate-400 uppercase font-bold tracking-wider mt-0.5">
                Total Target
            </span>
        </div>
    </div>
                

            {/* Daftar Status Kartu Bawah: Rekap Progress Jumlah SLS + Keterangan Persentase */}
<div className="space-y-1.5">
    {[
        { label: 'SLS Selesai Didata', count: dataMonitoringWilayah.statusSls.selesai, color: 'bg-emerald-500' },
        { label: 'SLS Sedang Didata', count: dataMonitoringWilayah.statusSls.sedang, color: 'bg-indigo-500' },
        { label: 'SLS Belum Mulai', count: dataMonitoringWilayah.statusSls.belum, color: 'bg-slate-400' }
    ].map((item) => {
        const totalSls = dataMonitoringWilayah.statusSls.total || 1;
        const pctSls = ((item.count / totalSls) * 100).toFixed(1);

        return (
            <div key={item.label} className="flex items-center justify-between bg-slate-50/70 px-2.5 py-1.5 rounded-xl border border-slate-100 text-[10px]">
                {/* Bagian Kiri: Indikator Warna & Label */}
                <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${item.color}`}></div>
                    <span className="font-bold text-slate-500 uppercase tracking-wide">
                        {item.label}
                    </span>
                </div>
                
                {/* Bagian Kanan: Sejajar Sempurna menggunakan Kolom Lebar Tetap */}
                <div className="flex items-center font-mono font-black text-slate-700">
                    {/* 🔥 Kontrol Lebar Angka SLS agar Separator Sejajar */}
                    <div className="w-14 text-right pr-2">
                        {item.count} <span className="text-[8px] text-slate-400 font-bold uppercase">SLS</span>
                    </div>
                    
                    {/* Separator Pipa */}
                    <span className="text-slate-300 font-normal">|</span>
                    
                    {/* Kontrol Lebar Persentase */}
                    <div className="w-12 text-right text-indigo-600 text-[9px] pl-2">
                        {pctSls}%
                    </div>
                </div>
            </div>
        );
    })}
</div>
        </div>
    </div>
</div>

            {/* SECTION GRAFIK: GRID BERDAMPINGAN */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">

                {/* GRAFIK 1: KECAMATAN (KIRI) */}
                <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between overflow-hidden">
                    <div className="flex justify-between items-center mb-4">
                        <div>
                            <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider">Petugas Aktif Hari Ini per Kecamatan</h3>
                            <p className="text-[10px] text-slate-400 font-bold mt-0.5">Informasi persentase petugas aktif hari ini per kecamatan</p>
                        </div>
                        {selectedKecamatan && (
                            <button onClick={() => { setSelectedKecamatan(null); setSelectedKecTab("SEMUA"); setSelectedPetugas(null); }} className="text-[9px] uppercase font-black bg-rose-50 text-rose-600 px-2.5 py-1 rounded-lg border border-rose-100 flex items-center gap-1 transition hover:bg-rose-100">
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
                                        portal={null}
                                        position={{ y: 10 }}
                                        contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '11px' }}
                                    />
                                    <Legend wrapperStyle={{ fontSize: '9px' }} verticalAlign="top" align="right" />
                                    <Bar dataKey="PCL Aktif (%)" fill="#6366f1" radius={[3, 3, 0, 0]} barSize={10} cursor="pointer" />
                                    <Bar dataKey="PML Aktif (%)" fill="#10b981" radius={[3, 3, 0, 0]} barSize={10} cursor="pointer" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                {/* GRAFIK 2: DIAGRAM GARIS TREN 2 MINGGU (KANAN) */}
                <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
                    <div className="flex justify-between items-center mb-4">
                        <div>
                            <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider">
                                Tren Keaktifan Petugas {namaKecamatanTerpilihText ? `Kec. ${namaKecamatanTerpilihText}` : '(Kabupaten)'}
                            </h3>
                            <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                                {selectedKecamatan ? 'Monitoring keaktifan petugas di wilayah Kec. ' + namaKecamatanTerpilihText + 'selama 2 minggu terakhir' : 'Monitoring keaktifan petugas di seluruh kecamatan selama 2 minggu terakhir'}
                            </p>
                        </div>
                        {selectedKecamatan && (
                            <span className="text-[8px] font-black uppercase bg-indigo-50 text-indigo-600 px-2 py-1 rounded-md border border-indigo-100/60">
                                Terfilter Spasial
                            </span>
                        )}
                    </div>

                    <div className="h-60 w-full mt-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={trendChartData} margin={{ bottom: 5, left: -10, right: 10 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="tanggalLabel" stroke="#94a3b8" fontSize={9} tickLine={false} tick={{ fontWeight: 600 }} />
                                <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} unit="%" domain={[0, 100]} />
                                <Tooltip contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '11px' }} />
                                <Legend wrapperStyle={{ fontSize: '9px' }} verticalAlign="top" align="right" />
                                <Line type="monotone" dataKey="PCL Aktif (%)" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                                <Line type="monotone" dataKey="PML Aktif (%)" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* UNIFIED CONTROL TOOLBAR */}
            <div className="p-3 bg-white border border-slate-200 rounded-2xl flex flex-col lg:flex-row gap-3 justify-between items-center mb-4 shadow-sm">
                <div className="flex bg-indigo-50 p-1 rounded-xl border border-indigo-100/60 w-full lg:w-auto">
                    {['PCL', 'PML'].map((role) => (
                        <button key={role} onClick={() => { setActiveTab(role); setSelectedPetugas(null); }}
                            className={`text-xs uppercase font-black px-5 py-2 rounded-lg tracking-wider flex-1 lg:flex-none transition ${activeTab === role ? 'bg-indigo-600 text-white shadow-sm' : 'text-indigo-400 hover:text-indigo-600'}`}>
                            {role === 'PCL' ? '👥 Petugas PCL' : '👔 Petugas PML'}
                        </button>
                    ))}
                </div>

                <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto items-center flex-1 lg:justify-end">
                    <div className="relative w-full sm:w-64">
                        <Search className="absolute left-3 top-3 text-slate-400" size={13} />
                        <input type="text" placeholder={`Cari nama / email ${activeTab}...`} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-slate-50 text-xs border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-slate-700 focus:outline-none focus:border-indigo-500" />
                    </div>
                    <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 w-full sm:w-auto">
                        {['all', 'stagnan', 'aktif'].map((st) => (
                            <button key={st} onClick={() => setFilterStatus(st)} className={`text-[10px] uppercase font-black px-4 py-1.5 rounded-lg flex-1 sm:flex-none transition ${filterStatus === st ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400'}`}>
                                {st === 'all' ? 'Semua Status' : st}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* INTEGRASI LAYOUT INDUK */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">

                {/* TIM BODY TABLE */}
                <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm w-full">
                    <div className="overflow-x-auto w-full">
                        <table className="w-full text-left border-collapse table-auto">
                            <thead>
                                <tr className="border-b border-slate-200 bg-slate-50 text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                                    <th className="p-3">Profil Petugas ({activeTab})</th>
                                    <th className="p-3">Kecamatan Tugas</th>
                                    <th className="p-3">Status Lapangan</th>
                                    <th className="p-3">Update Terakhir</th>
                                    <th className="p-3 text-right">Aksi</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                                {filteredList.length === 0 ? (
                                    <tr>
                                        <td colSpan="5" className="p-8 text-center text-slate-400 text-xs font-bold uppercase bg-white">Tidak ada data petugas di kriteria ini.</td>
                                    </tr>
                                ) : (
                                    filteredList.map((petugas) => {
                                        const tidakAktif = petugas.statusHariIni === 'ABSEN' || petugas.statusHariIni === 'STAGNAN';
                                        return (
                                            <tr
                                                key={petugas.email}
                                                className={`transition cursor-pointer ${selectedPetugas?.email === petugas.email
                                                        ? 'bg-indigo-50/80 font-bold border-l-2 border-indigo-600'
                                                        : tidakAktif ? 'bg-slate-100/60 hover:bg-slate-100' : 'bg-white hover:bg-slate-50'
                                                    }`}
                                                onClick={() => setSelectedPetugas(petugas)}
                                            >
                                                <td className="p-3">
                                                    <div className={`text-xs ${tidakAktif ? 'text-slate-500 font-semibold' : 'font-bold text-slate-800'}`}>{petugas.nama_petugas || 'Tanpa Nama'}</div>
                                                    <div className="text-[10px] text-slate-400 font-mono tracking-tight">{petugas.email}</div>
                                                </td>
                                                <td className="p-3 font-bold text-indigo-600">📍 {petugas.kecamatan_tugas || '-'}</td>
                                                <td className="p-3">
                                                    <span className={`inline-block text-[9px] font-black tracking-wide px-2 py-0.5 rounded ${petugas.statusHariIni === 'AKTIF' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                                                            petugas.statusHariIni === 'STAGNAN' ? 'bg-rose-50 text-rose-600 border border-rose-100 animate-pulse' :
                                                                'bg-slate-200 text-slate-500'
                                                        }`}>{petugas.statusHariIni}</span>
                                                </td>
                                                <td className="p-3">
                                                    <div className={tidakAktif ? 'text-slate-400' : 'text-slate-600'}>{petugas.terakhirAktivitas}</div>
                                                    {petugas.isStagnan && <div className="text-[9px] text-rose-500 font-bold">Tidak Aktif {petugas.hariSifatStagnan} Hari</div>}
                                                </td>
                                                <td className="p-3 text-right">
                                                    <button className="text-[10px] text-indigo-600 bg-indigo-50 hover:bg-indigo-100 font-bold px-2.5 py-1 rounded-lg inline-flex items-center gap-1 transition">Detail <ArrowRight size={10} /></button>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* DETIL PANEL SIDEBAR KANAN */}
                <div className="bg-white rounded-3xl border border-slate-200 p-5 sticky top-4 shadow-sm lg:col-span-1">
                    {selectedPetugas ? (
                        <div>
                            <div className="flex items-start gap-3 border-b border-slate-100 pb-3 mb-4">
                                <div className="p-2.5 bg-indigo-50 rounded-2xl border border-indigo-100 text-indigo-600"><User size={18} /></div>
                                <div className="overflow-hidden">
                                    <span className="text-[9px] font-extrabold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full uppercase tracking-wider">{selectedPetugas.posisi_tugas}</span>
                                    <div className="text-xs font-black text-slate-800 uppercase tracking-wide truncate mt-1">{selectedPetugas.nama_petugas}</div>
                                    <div className="text-[10px] text-slate-400 font-mono truncate">{selectedPetugas.email}</div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-center">
                                        <span className="text-[9px] text-slate-400 uppercase block font-bold">Total Submit Log</span>
                                        <span className="text-xs font-black text-slate-700 mt-0.5 block">🗄️ {selectedPetugas.totalInput} Kali</span>
                                    </div>
                                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-center">
                                        <span className="text-[9px] text-slate-400 uppercase block font-bold">Cakupan Wilayah</span>
                                        <span className="text-xs font-black text-slate-700 mt-0.5 block">🗺️ {selectedPetugas.totalSlsDisentuh} SLS</span>
                                    </div>
                                </div>

                                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                                    <span className="text-[9px] text-slate-400 uppercase block font-bold mb-2 flex items-center gap-1">
                                        <Calendar size={11} className="text-indigo-500" /> Histori Presensi Lapangan
                                    </span>

                                    <div className="grid grid-cols-7 gap-1 text-center text-[8px] font-black text-slate-400 uppercase border-b border-slate-200 pb-1 mb-1.5">
                                        <div>S</div><div>S</div><div>R</div><div>K</div><div>J</div><div>S</div><div>M</div>
                                    </div>

                                    <div className="grid grid-cols-7 gap-1 text-center">
                                        {[...Array(4)].map((_, i) => <div key={`b-${i}`} className="h-5"></div>)}

                                        {[...Array(31)].map((_, i) => {
                                            const dateNum = i + 1;
                                            const isPetugasAktif = selectedPetugas.arrayTanggalAktif?.includes(dateNum);

                                            let dateBg = "bg-white text-slate-600 border border-slate-100";
                                            if (isPetugasAktif) {
                                                dateBg = "bg-emerald-500 text-white font-black shadow-sm shadow-emerald-200";
                                            } else if (dateNum === new Date().getDate()) {
                                                dateBg = "bg-slate-200 text-slate-800 border border-slate-300 font-bold";
                                            }

                                            return (
                                                <div
                                                    key={dateNum}
                                                    title={isPetugasAktif ? `Petugas Aktif Lapangan` : `Tidak Ada Log`}
                                                    className={`h-5 w-5 mx-auto rounded-md text-[9px] flex items-center justify-center transition-all select-none ${dateBg}`}
                                                >
                                                    {dateNum}
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="flex items-center gap-3 mt-2 pt-1.5 border-t border-slate-200/60 text-[8px] text-slate-400 font-bold uppercase">
                                        <div className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-emerald-500 block"></span> Pemantauan Aktif</div>
                                        <div className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-white border border-slate-200 block"></span> Kosong/Absen</div>
                                    </div>
                                </div>

                                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                    <span className="text-[9px] text-slate-400 uppercase block font-bold mb-1">Kecamatan Penugasan</span>
                                    <span className="text-xs font-black text-indigo-600 block">📍 Kecamatan {selectedPetugas.kecamatan_tugas || '-'}</span>
                                </div>

                                <div>
                                    <span className="text-[9px] text-slate-400 uppercase font-bold tracking-wider block mb-1.5">Daftar SLS Terkait Log ({selectedPetugas.totalSlsDisentuh})</span>
                                    <div className="max-h-32 overflow-y-auto space-y-1 bg-slate-50 p-2 rounded-xl border border-slate-100">
                                        {selectedPetugas.daftarSls.length === 0 ? (
                                            <div className="text-[10px] text-slate-400 p-2 text-center font-bold">Belum ada jejak SLS di sistem.</div>
                                        ) : (
                                            selectedPetugas.daftarSls.map((sls, idx) => (
                                                <div key={idx} className="text-[10px] bg-white border border-slate-100 p-2 rounded-lg flex flex-col shadow-sm">
                                                    <span className="font-bold text-indigo-600">{sls?.nmsls || 'Unknown SLS'}</span>
                                                    <span className="text-[9px] text-slate-400 mt-0.5">Desa {sls?.nmdesa || '-'}</span>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>

                                <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl text-[10px] text-slate-500 flex items-center gap-1.5">
                                    <Calendar size={12} className="text-slate-400" />
                                    <span>Log Terakhir Terdeteksi: <strong className="text-slate-700">{selectedPetugas.terakhirAktivitas}</strong></span>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-20 text-slate-400 flex flex-col items-center justify-center gap-2">
                            <AlertTriangle size={24} className="text-slate-300" />
                            <p className="text-[10px] uppercase font-bold tracking-wider">Belum Ada Petugas Terpilih</p>
                            <p className="text-[9px] text-slate-400 max-w-[180px] leading-relaxed">Klik salah satu baris petugas di tabel kiri atau pilih batang kecamatan di atas untuk memfilter data operasional.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}