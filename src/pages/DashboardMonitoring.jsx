import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';
import { supabase } from '../supabaseClient'; 
import * as XLSX from 'xlsx';

export default function DashboardMonitoring() {
    // --- STATE MANAGEMENT UTAMA ---
    const [selectedKecTab, setSelectedKecTab] = useState("SEMUA");
    const [selectedKecamatan, setSelectedKecamatan] = useState(null); 
    const [selectedPml, setSelectedPml] = useState("SEMUA"); // State Filter Pengawas Terpilih
    const [viewModeTab, setViewModeTab] = useState("DESA"); // DESA, PETUGAS, SLS
    const [selectedDesaCode, setSelectedDesaCode] = useState(null);
    const [selectedDesaName, setSelectedDesaName] = useState("");
    const [selectedPetugas, setSelectedPetugas] = useState(null);
    const [selectedPetugasEmail, setSelectedPetugasEmail] = useState(null); 

    const [loading, setLoading] = useState(true);
    const [rawData, setRawData] = useState([]);
    const [historyData, setHistoryData] = useState([]); 
    const [pmlList, setPmlList] = useState([]); // State Menyimpan Daftar Pengawas Unik Berbasis Kecamatan
    const [staffLookup, setStaffLookup] = useState({}); // Kamus lookup Email -> Nama Petugas/PML
    const [pclToPmlLookup, setPclToPmlLookup] = useState({}); // Kamus relasi PCL -> PML untuk Grafik Tren
    const [lastSyncedTime, setLastSyncedTime] = useState(null); // State Waktu Sync Global

    // --- STATE UNTUK MODAL DRILL-DOWN KPI HARIAN ---
    const [showKpiModal, setShowKpiModal] = useState(false);
    const [modalCurrentPage, setModalCurrentPage] = useState(1);
    const [lowPerformersList, setLowPerformersList] = useState([]);
    
    // --- STATE INDIKATOR PRODUKTIVITAS HARIAN (4 MATRIKS) ---
    const [metriksKpiHarian, setMetriksKpiHarian] = useState({
        hariKe: 1,
        rata2RealisasiPerPetugas: 0,
        rata2DokPerHariPerPetugas: 0,
        petugasDiBawahRata2: 0
    });

    // --- STATE STRUKTUR DATA MONITORING ---
    const [dataMonitoringWilayah, setDataMonitoringWilayah] = useState({
        kecamatan: [],
        desa: [],
        petugas: [],
        sls: [],
        muatanStatus: { submitted: 0, draft: 0, rejected: 0, revoked: 0, approved: 0, open: 0 }, 
        statusSls: { selesai: 0, sedang: 0, belum: 0, total: 0 }
    });

    // --- STATE DATA ANOMALI CONTROL CENTER ---
    const [criticalPcl, setCriticalPcl] = useState({ macet: [], melambat: [] });
    const [chartTrenData, setChartTrenData] = useState([]);

    // Master Susunan Warna & Label Status Utama (Sinkron Bar & Pie)
    const susunanBarStatus = [
        { key: "submitted", label: "SUBMITTED BY Pencacah", fill: "#3b82f6", radius: undefined },  
        { key: "draft",     label: "DRAFT",                 fill: "#f97316", radius: undefined },  
        { key: "rejected",  label: "REJECTED BY Pengawas",  fill: "#ef4444", radius: undefined },  
        { key: "revoked",   label: "REVOKED BY Pengawas",   fill: "#991b1b", radius: undefined },  
        { key: "approved",  label: "APPROVED BY Pengawas",  fill: "#10b981", radius: undefined },  
        { key: "open",      label: "OPEN",                  fill: "#e2e8f0", radius: [4, 4, 0, 0] } 
    ];

const namaKecamatanTerpilihText = selectedKecTab !== "SEMUA" 
    ? (dataMonitoringWilayah.kecamatan.find(k => k.kodeKec === selectedKecTab)?.nama_asli || selectedKecTab)
    : "";

    // --- FETCH DATA UTAMA, DATA RIWAYAT, & DATA MASTER PETUGAS ---
    useEffect(() => {
        async function loadAllDashboardData() {
            try {
                setLoading(true);

                // 1. Ambil data progress lapangan real-time
// Ambil data progress lapangan real-time (UBAH BAGIAN INI)
const { data: currentProgress, error: progressError } = await supabase
    .from('progress_boyolali')
    .select(`
        idsubsls, kecamatan, kode_desa, nama_desa, kode_sls, nama_rt_dusun, status_progres, updated_at,
        muatan_sls (
            nmsls, kdkec, nmkec, kddesa, nmdesa, petugas_id,
            petugas (nama_petugas, posisi_tugas, id_pml_atasan, kecamatan_tugas)
        )
    `);
                if (progressError) throw progressError;

                // 2. Ambil data riwayat 15 hari terakhir untuk time-series
                const { data: historicalLogs, error: historyError } = await supabase
                    .from('history_progress_petugas')
                    .select('*')
                    .order('tanggal', { ascending: true });
                if (historyError) throw historyError;

                // 3. Ambil Master Petugas untuk konversi Email -> Nama Asli Pengawas
                const { data: masterStaff, error: staffError } = await supabase
                    .from('petugas')
                    .select('email, nama_petugas');
                if (staffError) throw staffError;

                if (masterStaff) {
                    const lookupObj = {};
                    masterStaff.forEach(st => {
                        lookupObj[st.email.toLowerCase().trim()] = st.nama_petugas;
                    });
                    setStaffLookup(lookupObj);
                }

                // 4. Ambil Waktu Sync Terakhir dari tabel sync_status
                const { data: syncData, error: syncError } = await supabase
                    .from('sync_status')
                    .select('last_update')
                    .order('last_update', { ascending: false })
                    .limit(1);
                if (syncError) throw syncError;
                
                if (syncData && syncData.length > 0 && syncData[0].last_update) {
                    const syncTime = new Date(syncData[0].last_update);
                    setLastSyncedTime(syncTime.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) + ' WIB');
                } else {
                    setLastSyncedTime(new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) + ' WIB');
                }

                setRawData(currentProgress || []);
                setHistoryData(historicalLogs || []);
            } catch (err) {
                console.error("Control Center Load Error:", err.message);
            } finally {
                setLoading(false);
            }
        }
        loadAllDashboardData();
    }, []);

    // --- AGREGASI DATA, DETEKSI ANOMALI & EKSTRAKSI FILTER DROPDOWN ---
// --- AGREGASI DATA, DETEKSI ANOMALI & EKSTRAKSI FILTER DROPDOWN (FIXED) ---
useEffect(() => {
    if (rawData.length === 0) return;

    const kecMap = {};
    const desaMap = {};
    const petugasMap = {};
    const slsList = [];

    let fSubmitted = 0, fDraft = 0, fRejected = 0, fRevoked = 0, fApproved = 0, fOpen = 0;
    let fSlsSelesai = 0, fSlsSedang = 0, fSlsBelum = 0, fSlsTotal = 0;

    const pmlSeen = new Set();
    const tmpPmlList = [];
    const tmpPclToPml = {};

    // Loop Pertama: Ambil relasi unik PML & PCL
    rawData.forEach(row => {
        const relMuatan = row.muatan_sls || {};
        const relPetugas = relMuatan.petugas || {};
        const kodeKec = relMuatan.kdkec || "000";
        const rawPmlEmail = relPetugas.id_pml_atasan ? relPetugas.id_pml_atasan.toLowerCase().trim() : null;
        const rawPclEmail = relMuatan.petugas_id ? relMuatan.petugas_id.toLowerCase().trim() : null;

        if (rawPclEmail && rawPmlEmail && rawPmlEmail !== "tanpa petugas") {
            tmpPclToPml[rawPclEmail] = rawPmlEmail;
        }

        if (rawPmlEmail && rawPmlEmail !== "tanpa petugas") {
            if (selectedKecTab === "SEMUA" || kodeKec === selectedKecTab) {
                if (!pmlSeen.has(rawPmlEmail)) {
                    pmlSeen.add(rawPmlEmail);
                    tmpPmlList.push({
                        email: rawPmlEmail,
                        nama: staffLookup[rawPmlEmail] || rawPmlEmail
                    });
                }
            }
        }
    });
    tmpPmlList.sort((a, b) => a.nama.localeCompare(b.nama));
    setPmlList(tmpPmlList);
    setPclToPmlLookup(tmpPclToPml);

    // Loop Kedua: Kompilasi Ringkasan Agregasi Data Murni (Tanpa Return Filter di Tengah)
    rawData.forEach(row => {
        const relMuatan = row.muatan_sls || {};
        const relPetugas = relMuatan.petugas || {};

        const kodeKec = relMuatan.kdkec || "000";
        const namaKec = row.kecamatan || relMuatan.nmkec || "Unknown";
        const kodeDesa = row.kode_desa || relMuatan.kddesa || "000";
        const namaDesa = row.nama_desa || relMuatan.nmdesa || "Unknown";
        
        const emailPetugas = relMuatan.petugas_id || "Tanpa Petugas";
        const namaPetugas = relPetugas.nama_petugas ? `${relPetugas.nama_petugas}` : emailPetugas;
        const emailPmlFormated = relPetugas.id_pml_atasan ? relPetugas.id_pml_atasan.toLowerCase().trim() : "tanpa pengawas";

        const statusProgres = row.status_progres || {};
        
        const s_submitted = parseInt(statusProgres["SUBMITTED BY Pencacah"]) || 0;
        const s_draft     = parseInt(statusProgres["DRAFT"]) || 0;
        const s_rejected  = parseInt(statusProgres["REJECTED BY Pengawas"]) || 0;
        const s_revoked   = parseInt(statusProgres["REVOKED BY Pengawas"]) || 0;
        const s_approved  = parseInt(statusProgres["APPROVED BY Pengawas"]) || 0;
        const s_open      = parseInt(statusProgres["OPEN"]) || 0;

        const totalTarget = s_submitted + s_draft + s_rejected + s_revoked + s_approved + s_open;

        // Penentuan Status SLS
        let statusSlsKategori = "belum";
        if (totalTarget > 0) {
            if (s_open === 0) statusSlsKategori = "selesai";
            else if (s_open < totalTarget) statusSlsKategori = "sedang";
            else statusSlsKategori = "belum";
        }

        const initStrukturData = (kode, namaTampilan, namaAsli) => ({
            kodeKec, kodeDesa, nama: namaTampilan, nama_asli: namaAsli,
            submitted: 0, draft: 0, rejected: 0, revoked: 0, approved: 0, open: 0,
            t: 0, jml_sls: 0, sls_selesai: 0
        });

        // Agregasi Level Kecamatan
        if (!kecMap[kodeKec]) kecMap[kodeKec] = initStrukturData(kodeKec, `${namaKec} [${kodeKec}]`, namaKec);
        kecMap[kodeKec].submitted += s_submitted; kecMap[kodeKec].draft += s_draft;
        kecMap[kodeKec].rejected += s_rejected; kecMap[kodeKec].revoked += s_revoked;
        kecMap[kodeKec].approved += s_approved; kecMap[kodeKec].open += s_open;
        kecMap[kodeKec].t += totalTarget; kecMap[kodeKec].jml_sls += 1;
        if (statusSlsKategori === "selesai") kecMap[kodeKec].sls_selesai += 1;

        // Agregasi Level Desa
        if (!desaMap[kodeDesa]) desaMap[kodeDesa] = initStrukturData(kodeDesa, namaDesa, namaDesa);
        desaMap[kodeDesa].submitted += s_submitted; desaMap[kodeDesa].draft += s_draft;
        desaMap[kodeDesa].rejected += s_rejected; desaMap[kodeDesa].revoked += s_revoked;
        desaMap[kodeDesa].approved += s_approved; desaMap[kodeDesa].open += s_open;
        desaMap[kodeDesa].t += totalTarget; desaMap[kodeDesa].jml_sls += 1;
        if (statusSlsKategori === "selesai") desaMap[kodeDesa].sls_selesai += 1;

        // Agregasi Level Petugas (Kunci Kecamatan Berdasarkan Data Baris Pertama yang Ditemukan)
// Ekstraksi data master petugas dari joinkan tabel
const kecamatanResmiPetugas = relPetugas.kecamatan_tugas || row.kecamatan || relMuatan.nmkec || "Unknown";

if (!petugasMap[emailPetugas]) {
    petugasMap[emailPetugas] = {
        kodeKec: kodeKec, // Kode kecamatan SLS untuk filter grafik cascading
        kodeDesa: kodeDesa,
        nama: namaPetugas,
        nama_asli: namaPetugas,
        email: emailPetugas,
        namaKec: kecamatanResmiPetugas, // 🌟 SEKARANG AKURAT: Diambil dari kecamatan_tugas master petugas
        emailPml: emailPmlFormated,
        submitted: 0, draft: 0, rejected: 0, revoked: 0, approved: 0, open: 0,
        t: 0, jml_sls: 0, sls_selesai: 0
    };
}

// Akumulasi data dokumen (tetap sama)
petugasMap[emailPetugas].submitted += s_submitted;
petugasMap[emailPetugas].draft += s_draft;
petugasMap[emailPetugas].rejected += s_rejected;
petugasMap[emailPetugas].revoked += s_revoked;
petugasMap[emailPetugas].approved += s_approved;
petugasMap[emailPetugas].open += s_open;
petugasMap[emailPetugas].t += totalTarget;
petugasMap[emailPetugas].jml_sls += 1;
if (statusSlsKategori === "selesai") petugasMap[emailPetugas].sls_selesai += 1;

        // Simpan Data SLS Murni
        slsList.push({
            idsubsls: row.idsubsls, kodeKec, kodeDesa, petugas_id: emailPetugas,
            nama: row.nama_rt_dusun || relMuatan.nmsls || row.idsubsls,
            nama_asli: row.nama_rt_dusun || relMuatan.nmsls || row.idsubsls,
            total_target: totalTarget, total_realisasi: totalTarget - s_open,
            submitted: totalTarget > 0 ? Math.round((s_submitted / totalTarget) * 100) : 0,
            draft: totalTarget > 0 ? Math.round((s_draft / totalTarget) * 100) : 0,
            rejected: totalTarget > 0 ? Math.round((s_rejected / totalTarget) * 100) : 0,
            revoked: totalTarget > 0 ? Math.round((s_revoked / totalTarget) * 100) : 0,
            approved: totalTarget > 0 ? Math.round((s_approved / totalTarget) * 100) : 0,
            open: totalTarget > 0 ? Math.round((s_open / totalTarget) * 100) : 100,
            jml_sls: 1, sls_selesai: statusSlsKategori === "selesai" ? 1 : 0
        });

        // Hitung Filter Untuk Metrik Atas Berdasarkan Tampilan Terpilih
        if (selectedKecTab === "SEMUA" || kodeKec === selectedKecTab) {
            // Evaluasi juga berdasarkan filter PML jika dipilih
            if (selectedPml === "SEMUA" || emailPmlFormated === selectedPml.toLowerCase().trim()) {
                fSubmitted += s_submitted; fDraft += s_draft; fRejected += s_rejected;
                fRevoked += s_revoked; fApproved += s_approved; fOpen += s_open; fSlsTotal++;
                if (statusSlsKategori === "selesai") fSlsSelesai++;
                else if (statusSlsKategori === "sedang") fSlsSedang++;
                else fSlsBelum++;
            }
        }
    });

    // --- LOGIKA PERHITUNGAN 4 MATRIKS PRODUKTIVITAS HARIAN ---
    const tanggalAwalSensus = new Date("2026-06-15");
    const tanggalHariIni = new Date();
    const selisihMilidetik = Math.abs(tanggalHariIni - tanggalAwalSensus);
    const kalkulasiHariKe = Math.floor(selisihMilidetik / (1000 * 60 * 60 * 24)) + 1;

    const totalMuatanSelainOpen = fSubmitted + fDraft + fRejected + fRevoked + fApproved;
    const daftarPetugasValid = Object.values(petugasMap).filter(p => p.email !== "Tanpa Petugas" && (selectedKecTab === "SEMUA" || p.kodeKec === selectedKecTab) && (selectedPml === "SEMUA" || p.emailPml === selectedPml.toLowerCase().trim()));
    const jumlahPetugasAktif = daftarPetugasValid.length;

    const hitungRata2RealisasiPerPetugas = jumlahPetugasAktif > 0 ? Math.round(totalMuatanSelainOpen / jumlahPetugasAktif) : 0;
    const hitungRata2DokPerHariPerPetugas = (kalkulasiHariKe > 0 && jumlahPetugasAktif > 0) 
        ? parseFloat((totalMuatanSelainOpen / kalkulasiHariKe / jumlahPetugasAktif).toFixed(1)) 
        : 0;

    let counterPetugasDiBawahRata2 = 0;
    const tmpLowPerformers = []; 

    daftarPetugasValid.forEach(p => {
        const realisasiIndividu = p.submitted + p.draft + p.rejected + p.revoked + p.approved; 
        if (realisasiIndividu < hitungRata2RealisasiPerPetugas) {
            counterPetugasDiBawahRata2++;
            const pmlName = staffLookup[p.emailPml] || p.emailPml;
            tmpLowPerformers.push({
                namaPetugas: p.nama_asli,
                namaPengawas: pmlName === "tanpa pengawas" ? "Tanpa Pengawas" : pmlName,
                namaKecamatan: p.namaKec,
                realisasi: realisasiIndividu
            });
        }
    });

    tmpLowPerformers.sort((a, b) => a.realisasi - b.realisasi);
    setLowPerformersList(tmpLowPerformers);

    setMetriksKpiHarian({
        hariKe: kalkulasiHariKe,
        rata2RealisasiPerPetugas: hitungRata2RealisasiPerPetugas,
        rata2DokPerHariPerPetugas: hitungRata2DokPerHariPerPetugas,
        petugasDiBawahRata2: counterPetugasDiBawahRata2
    });

    const formatKePersen = (obj) => {
        const total = obj.t || 1;
        return {
            ...obj, total_target: obj.t, total_realisasi: obj.t - obj.open,
            submitted: Math.round((obj.submitted / total) * 100),
            draft: Math.round((obj.draft / total) * 100),
            rejected: Math.round((obj.rejected / total) * 100),
            revoked: Math.round((obj.revoked / total) * 100),
            approved: Math.round((obj.approved / total) * 100),
            open: Math.round((obj.open / total) * 100)
        };
    };

    const sortedKecamatan = Object.values(kecMap).map(formatKePersen).sort((a, b) => a.kodeKec.localeCompare(b.kodeKec, undefined, { numeric: true }));
    const sortedDesa = Object.values(desaMap).map(formatKePersen).sort((a, b) => a.kodeDesa.localeCompare(b.kodeDesa, undefined, { numeric: true }));
    const sortedPetugas = Object.values(petugasMap).map(obj => ({ ...obj, total_target: obj.t, total_realisasi: obj.t - obj.open })).sort((a, b) => b.total_realisasi - a.total_realisasi);
    const sortedSls = slsList.sort((a, b) => a.idsubsls.localeCompare(b.idsubsls, undefined, { numeric: true }));

    setDataMonitoringWilayah({
        kecamatan: sortedKecamatan, desa: sortedDesa, petugas: sortedPetugas, sls: sortedSls,
        muatanStatus: { submitted: fSubmitted, draft: fDraft, rejected: fRejected, revoked: fRevoked, approved: fApproved, open: fOpen },
        statusSls: { selesai: fSlsSelesai, sedang: fSlsSedang, belum: fSlsBelum, total: fSlsTotal }
    });

}, [rawData, historyData, selectedKecTab, selectedPml, staffLookup]);

    // --- AGREGASI DATA TIME-SERIES TREN ---
    useEffect(() => {
        if (historyData.length === 0) return;

        const tanggalUnik = [...new Set(historyData.map(h => h.tanggal))].sort();
        
        const dataChartGaris = tanggalUnik.map(tgl => {
            let filteredLogs = historyData.filter(h => h.tanggal === tgl);

            if (selectedKecTab !== "SEMUA") {
                filteredLogs = filteredLogs.filter(h => h.kode_kec === selectedKecTab);
            }
            if (selectedDesaCode) {
                filteredLogs = filteredLogs.filter(h => h.kode_desa === selectedDesaCode);
            }
            if (selectedPetugasEmail) {
                filteredLogs = filteredLogs.filter(h => h.petugas_id === selectedPetugasEmail);
            }
            if (selectedPml !== "SEMUA") {
                filteredLogs = filteredLogs.filter(h => {
                    const emailPclFormated = h.petugas_id ? h.petugas_id.toLowerCase().trim() : "";
                    return pclToPmlLookup[emailPclFormated] === selectedPml.toLowerCase().trim();
                });
            }

            const total = filteredLogs.reduce((sum, item) => sum + (item.total_capaian || 0), 0);
            const dateObj = new Date(tgl);
            const labelTanggal = `${dateObj.getDate()} ${dateObj.toLocaleString('id-ID', { month: 'short' })}`;

            return { tanggalRaw: tgl, label: labelTanggal, "Capaian Kumulatif": total };
        });

        setChartTrenData(dataChartGaris);
    }, [historyData, selectedKecTab, selectedDesaCode, selectedPetugasEmail, selectedPml, pclToPmlLookup]);

    const getChartData = () => {
        if (viewModeTab === "PETUGAS") {
            return selectedKecTab === "SEMUA" 
                ? dataMonitoringWilayah.petugas 
                : dataMonitoringWilayah.petugas.filter(p => p.kodeKec === selectedKecTab);
        }
        if (viewModeTab === "SLS") {
            if (selectedPetugasEmail) {
                return dataMonitoringWilayah.sls.filter(s => s.petugas_id === selectedPetugasEmail);
            }
            return dataMonitoringWilayah.sls.filter(s => s.kodeKec === selectedKecTab && s.kodeDesa === selectedDesaCode);
        }
        return selectedKecTab === "SEMUA" ? dataMonitoringWilayah.kecamatan : dataMonitoringWilayah.desa.filter(d => d.kodeKec === selectedKecTab);
    };

    // --- LOGIKA PAGINASI TABEL MODAL ---
    const itemsPerPage = 20;
    const totalPages = Math.ceil(lowPerformersList.length / itemsPerPage);
    const indexOfLastItem = modalCurrentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentModalItems = lowPerformersList.slice(indexOfFirstItem, indexOfLastItem);

// --- FUNGSI EXPORT EXCEL DINAMIS SESUAI BAR CHART ---
// --- FUNGSI EXPORT EXCEL: SEMUA DATA BERUJUD JUMLAH DOKUMEN MURNI ---
// --- FUNGSI EXPORT EXCEL: JUMLAH MURNI + PERSENTASE CAPAIAN DI AKHIR ---
const handleDownloadSlsExcel = () => {
    const currentChartData = getChartData();
    
    if (!currentChartData || currentChartData.length === 0) {
        alert("Tidak ada data yang bisa diexport saat ini.");
        return;
    }

    const formattedData = currentChartData.map((item, index) => {
        // 1. Ambil nilai target total murni terlebih dahulu
        const totalTargetMurni = item.total_target || item.t || 0;

        // 2. Deklarasi variabel hitungan dokumen murni
        let approvedMurni = 0;
        let submittedMurni = 0;
        let draftMurni = 0;
        let rejectedMurni = 0;
        let revokedMurni = 0;
        let openMurni = 0;

        // JIKA BUKAN MODE PETUGAS/SLS (Kembalikan nilai persen di state ke jumlah dokumen riil)
        if (viewModeTab !== "PETUGAS" && viewModeTab !== "SLS") {
            approvedMurni  = totalTargetMurni > 0 ? Math.round((item.approved * totalTargetMurni) / 100) : 0;
            submittedMurni = totalTargetMurni > 0 ? Math.round((item.submitted * totalTargetMurni) / 100) : 0;
            draftMurni     = totalTargetMurni > 0 ? Math.round((item.draft * totalTargetMurni) / 100) : 0;
            rejectedMurni  = totalTargetMurni > 0 ? Math.round((item.rejected * totalTargetMurni) / 100) : 0;
            revokedMurni   = totalTargetMurni > 0 ? Math.round((item.revoked * totalTargetMurni) / 100) : 0;
            
            const totalRealisasiMurni = approvedMurni + submittedMurni + draftMurni + rejectedMurni + revokedMurni;
            openMurni      = totalTargetMurni - totalRealisasiMurni;
        } else {
            // Jika sudah di level PETUGAS atau SLS, datanya memang sudah bawaan murni
            approvedMurni  = item.approved || 0;
            submittedMurni = item.submitted || 0;
            draftMurni     = item.draft || 0;
            rejectedMurni  = item.rejected || 0;
            revokedMurni   = item.revoked || 0;
            openMurni      = item.open || 0;
        }

        const totalRealisasi = totalTargetMurni - openMurni;

        // Hitung rumus persentase capaian (Total Realisasi / Total Target * 100) dengan 2 desimal
        const persentaseCapaian = totalTargetMurni > 0 
            ? parseFloat(((totalRealisasi / totalTargetMurni) * 100).toFixed(2)) 
            : 0.00;

        // 3. Susun struktur baris Excel
        const row = {
            "No": index + 1,
            "Nama Wilayah / Petugas": item.nama_asli || item.nama,
        };

        if (viewModeTab === "SLS" && item.idsubsls) {
            row["ID Sub SLS"] = item.idsubsls;
        }

        if (item.namaKec) row["Kecamatan"] = item.namaKec;

        // Masukkan data murni dokumen
        row["Approved PML"] = approvedMurni;
        row["Submitted"] = submittedMurni;
        row["Draft"] = draftMurni;
        row["Rejected"] = rejectedMurni;
        row["Revoked"] = revokedMurni;
        row["Open"] = openMurni;
        row["Total Target"] = totalTargetMurni;
        row["Total Realisasi"] = totalRealisasi;
        
        // 🌟 Tambahan kolom persentase di paling belakang
        row["Persentase Capaian (%)"] = persentaseCapaian;

        return row;
    });

    // 4. Proses pembuatan file Excel
    const worksheet = XLSX.utils.json_to_sheet(formattedData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Data Realisasi Lapangan");

    // 5. Penamaan file excel dinamis
    const namaWilayahFile = selectedKecTab === "SEMUA" ? "KAB_BOYOLALI" : `KEC_${selectedKecTab}`;
    const namaFileExcel = `VOLUME_PROGRESS_${viewModeTab}_${namaWilayahFile}_${new Date().toISOString().slice(0,10)}.xlsx`;

    XLSX.writeFile(workbook, namaFileExcel);
};
    
    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen text-slate-500 font-bold text-xs uppercase tracking-widest animate-pulse">
                MENYUSUN DATA LAPORAN KABUPATEN...
            </div>
        );
    }

// --- PREPARASI DATA TABEL TOP & BOTTOM PERFORMERS ---
// Saring data agar Top/Bottom performers akurat mengikuti level Kode Kecamatan saat ini
const validPetugasData = dataMonitoringWilayah.petugas.filter(p => 
    p.email !== "Tanpa Petugas" && 
    p.total_target > 0 && // Pastikan memiliki target riil agar tidak muncul data 0
    (selectedKecTab === "SEMUA" || p.kodeKec === selectedKecTab) // 🌟 Ganti menggunakan perbandingan KODE KECAMATAN
);

// Tentukan limit berdasarkan scope wilayah saat ini
const limitPetugas = selectedKecTab === "SEMUA" ? 20 : 10;

// Ambil Top Performers (Urutan asli dari state sudah Descending berdasarkan total_realisasi)
const topPerformers = validPetugasData.slice(0, limitPetugas);

// Ambil Bottom Performers (Urutan dibalik secara Ascending dari realisasi terkecil)
const bottomPerformers = [...validPetugasData]
    .sort((a, b) => a.total_realisasi - b.total_realisasi)
    .slice(0, limitPetugas);

    const dataPieStatus = [
        { name: "SUBMITTED BY Pencacah", value: dataMonitoringWilayah.muatanStatus.submitted, color: "#3b82f6" },
        { name: "DRAFT",                 value: dataMonitoringWilayah.muatanStatus.draft,     color: "#f97316" },
        { name: "REJECTED BY Pengawas",  value: dataMonitoringWilayah.muatanStatus.rejected,  color: "#ef4444" },
        { name: "REVOKED BY Pengawas",   value: dataMonitoringWilayah.muatanStatus.revoked,   color: "#991b1b" },
        { name: "APPROVED BY Pengawas",  value: dataMonitoringWilayah.muatanStatus.approved,  color: "#10b981" },
        { name: "OPEN",                  value: dataMonitoringWilayah.muatanStatus.open,      color: "#e2e8f0" }
    ].filter(item => item.value > 0); 

    const totalSeluruhMuatan = dataPieStatus.reduce((sum, item) => sum + item.value, 0);

    const isPetugasMode = viewModeTab === "PETUGAS";
    const unitSatuanYAxis = isPetugasMode ? "" : "%";
    const formatSuffixTooltip = isPetugasMode ? " Dokumen" : "%";

    return (
        <div className="p-6 bg-slate-100 min-h-screen space-y-6 relative">
            
            {/* 🌟 BARIS UTAMA FILTRASI KECAMATAN DROPDOWN (KODE URUT), DROPDOWN PENGAWAS & WAKTU SYNC 🌟 */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full md:w-auto">
                    
                    {/* Dropdown 1: Kecamatan */}
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider whitespace-nowrap">Kecamatan:</label>
                        <select 
                            value={selectedKecTab}
                            onChange={(e) => {
                                const val = e.target.value;
                                setSelectedKecTab(val);
                                setSelectedKecamatan(val === "SEMUA" ? null : val);
                                setSelectedPml("SEMUA"); 
                                setSelectedDesaCode(null);
                                setSelectedDesaName("");
                                setSelectedPetugas(null);
                                setSelectedPetugasEmail(null);
                                setViewModeTab("DESA");
                            }}
                            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full sm:w-56 cursor-pointer"
                        >
                            <option value="SEMUA">📊 KABUPATEN BOYOLALI (ALL)</option>
                            {dataMonitoringWilayah.kecamatan.map((kec) => (
                                <option key={kec.kodeKec} value={kec.kodeKec}>
                                    {kec.kodeKec} - {kec.nama_asli}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Dropdown 2: Nama Pengawas (PML) */}
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider whitespace-nowrap">Pengawas (PML):</label>
                        <select 
                            value={selectedPml}
                            onChange={(e) => {
                                const val = e.target.value;
                                setSelectedPml(val);
                                setSelectedDesaCode(null);
                                setSelectedDesaName("");
                                setSelectedPetugas(null);
                                setSelectedPetugasEmail(null);
                                
                                if (val !== "SEMUA") {
                                    setViewModeTab("PETUGAS");
                                } else {
                                    setViewModeTab("DESA");
                                }
                            }}
                            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full sm:w-64 cursor-pointer"
                        >
                            <option value="SEMUA">👥 SEMUA PENGAWAS (ALL)</option>
                            {pmlList.map((pml) => (
                                <option key={pml.email} value={pml.email}>
                                    {pml.nama}
                                </option>
                            ))}
                        </select>
                    </div>

                </div>

                <div className="bg-slate-50 border border-slate-200/60 px-3 py-1.5 rounded-xl text-right flex items-center gap-2 self-end md:self-auto">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-wide">
                        Data Diambil dari Fasih SM. Waktu Sync Terakhir: <span className="font-mono text-slate-800 font-black">{lastSyncedTime}</span>
                    </span>
                </div>
            </div>

            {/* 🚀 BARIS PANELS: RESPONSIVE GRID 4 KOLOM PRODUKTIVITAS HARIAN */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 bg-slate-900 text-white p-5 rounded-3xl shadow-sm">
                <div className="flex items-center gap-4 md:border-r border-slate-800 pr-2">
                    <span className="text-3xl">📅</span>
                    <div>
                        <div className="text-[9px] uppercase font-black text-slate-400 tracking-wider">Hari Kegiatan Lapangan</div>
                        <div className="text-sm font-black font-mono mt-0.5">HARI KE-{metriksKpiHarian.hariKe} <span className="text-xs font-sans text-slate-400 font-normal">(Mulai 15 Juni 2026)</span></div>
                    </div>
                </div>
                <div className="flex items-center gap-4 md:border-r border-slate-800 pr-2">
                    <span className="text-3xl">📊</span>
                    <div>
                        <div className="text-[9px] uppercase font-black text-slate-400 tracking-wider">Rata-Rata Kirim per Petugas</div>
                        <div className="text-sm font-black font-mono text-indigo-400 mt-0.5">{metriksKpiHarian.rata2RealisasiPerPetugas.toLocaleString('id-ID')} <span className="text-[10px] font-sans text-white font-medium">Assignment</span></div>
                    </div>
                </div>
                <div className="flex items-center gap-4 md:border-r border-slate-800 pr-2">
                    <span className="text-3xl">🚀</span>
                    <div>
                        <div className="text-[9px] uppercase font-black text-slate-400 tracking-wider">Rata-Rata Kirim / Hari / Petugas</div>
                        <div className="text-sm font-black font-mono text-cyan-400 mt-0.5">{metriksKpiHarian.rata2DokPerHariPerPetugas.toLocaleString('id-ID')} <span className="text-[10px] font-sans text-white font-medium">Assignment / Hari</span></div>
                    </div>
                </div>
                
                {/* KPI KARTU 4: Clickable Drill-Down */}
                <div 
                    onClick={() => {
                        if (metriksKpiHarian.petugasDiBawahRata2 > 0) {
                            setModalCurrentPage(1);
                            setShowKpiModal(true);
                        }
                    }}
                    className={`flex items-center gap-4 p-2 rounded-2xl transition-all duration-200 select-none ${metriksKpiHarian.petugasDiBawahRata2 > 0 ? 'cursor-pointer hover:bg-slate-800 active:scale-[0.98] group' : 'opacity-80'}`}
                    title={metriksKpiHarian.petugasDiBawahRata2 > 0 ? "Klik untuk melihat detail nama petugas" : ""}
                >
                    <span className="text-3xl transition-transform group-hover:scale-110 duration-200">📉</span>
                    <div>
                        <div className="text-[9px] uppercase font-black text-slate-400 tracking-wider group-hover:text-amber-300 transition-colors">Jumlah Kirim Di Bawah Rata-Rata</div>
                        <div className="text-sm font-black font-mono text-amber-400 mt-0.5 flex items-center gap-1.5">
                            {metriksKpiHarian.petugasDiBawahRata2} 
                            <span className="text-xs font-sans text-white font-normal group-hover:underline decoration-amber-400 decoration-2">Petugas (klik untuk detail)</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* 🚀 BARIS DASHBOARD CONTROL CENTER SUMMARY CARD */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white border-l-4 border-rose-500 p-4 rounded-2xl shadow-xs">
                    <div className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Petugas Tidak Aktif (3 Hari Terakhir Tidak Kirim)</div>
                    <div className="text-2xl font-mono font-black text-rose-600 mt-1">{criticalPcl.macet.length} <span className="text-xs text-slate-400 font-sans font-bold">Orang</span></div>
                    <p className="text-[8px] text-slate-400 mt-1 font-bold">Capaian stagnan (tidak kirim assignment baru selama 3 hari)</p>
                </div>
                <div className="bg-white border-l-4 border-amber-500 p-4 rounded-2xl shadow-xs">
                    <div className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Petugas Melambat</div>
                    <div className="text-2xl font-mono font-black text-amber-600 mt-1">{criticalPcl.melambat.length} <span className="text-xs text-slate-400 font-sans font-bold">Orang</span></div>
                    <p className="text-[8px] text-slate-400 mt-1 font-bold">Produktivitas rendah (3 hari kirim kurang dari 10 Assignment)</p>
                </div>
                <div className="bg-white border-l-4 border-blue-500 p-4 rounded-2xl shadow-xs">
                    <div className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Assignment Perlu di Review (Submitted/Proses)</div>
                    <div className="text-2xl font-mono font-black text-blue-600 mt-1">
                        {(dataMonitoringWilayah.muatanStatus.submitted + dataMonitoringWilayah.muatanStatus.draft + dataMonitoringWilayah.muatanStatus.rejected + dataMonitoringWilayah.muatanStatus.revoked).toLocaleString('id-ID')} <span className="text-xs text-slate-400 font-sans font-bold">Assignment</span>
                    </div>
                    <p className="text-[8px] text-slate-400 mt-1 font-bold">Status Draft / Submitted / Rejected / Revoked</p>
                </div>
                <div className="bg-white border-l-4 border-emerald-500 p-4 rounded-2xl shadow-xs">
                    <div className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Approve Pengawas</div>
                    <div className="text-2xl font-mono font-black text-emerald-600 mt-1">{dataMonitoringWilayah.muatanStatus.approved.toLocaleString('id-ID')} <span className="text-xs text-slate-400 font-sans font-bold">Assignment</span></div>
                    <p className="text-[8px] text-slate-400 mt-1 font-bold">Assignment yang telah diapprove pengawas</p>
                </div>
            </div>

            {/* BARIS UTAMA: GRAFIK BATANG & REKAP BULAT */}
            <div className="bg-white p-5 border border-slate-200 rounded-3xl shadow-sm">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                            {selectedPetugasEmail 
                                ? `Capaian Lapangan Petugas: ${selectedPetugas} - Per SLS`
                                : selectedPml !== "SEMUA"
                                    ? `Capaian Tim Pengawas: ${staffLookup[selectedPml] || selectedPml} (Per Petugas - Jumlah Murni)`
                                    : selectedKecTab === "SEMUA"
                                        ? "Capaian Realisasi Lapangan Kabupaten (Per Kecamatan)"
                                        : `Capaian Realisasi Lapangan Kec. ${namaKecamatanTerpilihText} (${viewModeTab === "DESA" ? "Per Desa" : "Per Petugas (Jumlah Murni)"})`}
                        </h3>
                    </div>
                    <div className="flex items-center gap-3">
                        {selectedKecTab !== "SEMUA" && !selectedPetugasEmail && selectedPml === "SEMUA" && (
                            <div className="bg-slate-100 p-1 rounded-xl flex gap-1 border border-slate-200/60 shadow-inner">
                                <button onClick={() => { setViewModeTab("DESA"); setSelectedDesaCode(null); }} className={`text-[9px] font-black px-3 py-1.5 rounded-lg transition-all uppercase tracking-wide ${viewModeTab === "DESA" ? "bg-white text-slate-800 shadow-sm" : "text-slate-400 hover:text-slate-600 hover:bg-slate-200/50"}`}>📍 Per Desa</button>
                                <button onClick={() => setViewModeTab("PETUGAS")} className={`text-[9px] font-black px-3 py-1.5 rounded-lg transition-all uppercase tracking-wide ${viewModeTab === "PETUGAS" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400 hover:text-slate-600 hover:bg-slate-200/50"}`}>🏃‍♂️ Per Petugas</button>
                            </div>
                        )}
                        {(selectedKecTab !== "SEMUA" || selectedPml !== "SEMUA") && (
                            <button
                                onClick={() => {
                                    if (viewModeTab === "SLS") {
                                        if (selectedPetugasEmail) {
                                            setViewModeTab("PETUGAS");
                                            setSelectedPetugasEmail(null);
                                            setSelectedPetugas(null);
                                        } else {
                                            setViewModeTab("DESA");
                                            setSelectedDesaCode(null);
                                        }
                                    } else {
                                        setSelectedKecTab("SEMUA");
                                        setSelectedKecamatan(null);
                                        setSelectedPml("SEMUA");
                                        setSelectedPetugas(null);
                                        setSelectedPetugasEmail(null);
                                        setViewModeTab("DESA");
                                    }
                                }}
                                className="bg-slate-800 hover:bg-slate-900 text-white text-[9px] font-black px-4 py-1.5 rounded-xl transition-all uppercase tracking-wider shadow-sm flex items-center gap-1"
                            >
                                ← Kembali
                            </button>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
                    <div className="lg:col-span-3 w-full overflow-x-auto overflow-y-hidden scrollbar-thin">
                        <div className="h-[420px] w-full min-w-[500px] md:min-w-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={getChartData()}
                                    margin={{ bottom: 40, left: -15, right: 10, top: 10 }}
                                    barCategoryGap="25%"
                                >
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="nama" stroke="#94a3b8" fontSize={8} tickLine={false} angle={-45} textAnchor="end" interval={0} height={50} tick={{ fontWeight: 700 }} />
                                    <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} unit={unitSatuanYAxis} domain={isPetugasMode ? [0, 'auto'] : [0, 100]} />
                                    
                                    <Tooltip
                                        cursor={{ fill: '#f8fafc', opacity: 0.5 }}
                                        content={({ active, payload }) => {
                                            if (active && payload && payload.length) {
                                                const data = payload[0].payload;
                                                return (
                                                    <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xl text-[11px] space-y-1.5 font-sans min-w-[210px] z-50">
                                                        <div className="font-black text-slate-800 uppercase tracking-wide border-b border-slate-100 pb-1.5 mb-1 flex items-center gap-1">
                                                            {viewModeTab === "PETUGAS" ? "🏃‍♂️" : viewModeTab === "SLS" ? "🏠" : "📍"} {data.nama_asli}
                                                        </div>
                                                        <div className="space-y-1 font-medium text-slate-500">
                                                            <div className="flex justify-between border-b border-slate-50 pb-1 mb-1">
                                                                <span>Total Target:</span>
                                                                <strong className="text-slate-800 font-mono">{data.total_target?.toLocaleString('id-ID')} Muatan</strong>
                                                            </div>
                                                            <div className="flex justify-between items-center"><span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#10b981]"></span> Approved:</span><strong className="text-emerald-600 font-mono">{data.approved}{formatSuffixTooltip}</strong></div>
                                                            <div className="flex justify-between items-center"><span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#3b82f6]"></span> Submitted:</span><strong className="text-blue-600 font-mono">{data.submitted}{formatSuffixTooltip}</strong></div>
                                                            <div className="flex justify-between items-center"><span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#f97316]"></span> Draft:</span><strong className="text-orange-600 font-mono">{data.draft}{formatSuffixTooltip}</strong></div>
                                                            <div className="flex justify-between items-center"><span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#ef4444]"></span> Rejected:</span><strong className="text-red-600 font-mono">{data.rejected}{formatSuffixTooltip}</strong></div>
                                                            <div className="flex justify-between items-center"><span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#991b1b]"></span> Revoked:</span><strong className="text-red-950 font-mono">{data.revoked}{formatSuffixTooltip}</strong></div>
                                                            <div className="flex justify-between items-center"><span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#94a3b8]"></span> Open:</span><strong className="text-slate-500 font-mono">{data.open}{formatSuffixTooltip}</strong></div>
                                                        </div>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        }}
                                    />

                                    {susunanBarStatus.map((b) => (
                                        <Bar
                                            key={b.key} dataKey={b.key} stackId="a" fill={b.fill} maxBarSize={30} radius={b.radius}
                                            style={{ cursor: (viewModeTab !== 'SLS') ? 'pointer' : 'default' }}
                                            onClick={(clickedItem) => {
                                                if (!clickedItem) return;
                                                if (selectedKecTab === "SEMUA" && viewModeTab !== "PETUGAS") {
                                                    const matchKode = clickedItem.nama ? clickedItem.nama.match(/\d+/) : null;
                                                    if (matchKode && matchKode[0]) {
                                                        setSelectedKecTab(matchKode[0]);
                                                        setSelectedKecamatan(matchKode[0]);
                                                        setSelectedPetugas(null);
                                                        setSelectedPetugasEmail(null);
                                                        setViewModeTab("DESA");
                                                    }
                                                }
                                                else if (viewModeTab === "DESA" && clickedItem.kodeDesa) {
                                                    setSelectedDesaCode(clickedItem.kodeDesa);
                                                    setSelectedDesaName(clickedItem.nama_asli);
                                                    setViewModeTab("SLS");
                                                }
                                                else if (viewModeTab === "PETUGAS" && clickedItem.email) {
                                                    setSelectedPetugasEmail(clickedItem.email);
                                                    setSelectedPetugas(clickedItem.nama_asli);
                                                    setViewModeTab("SLS");
                                                }
                                            }}
                                        >
                                            {b.key === "open" && (
                                                <LabelList
                                                    position="insideBottom" offset={8}
                                                    style={{ fill: '#1e293b', fontSize: '10px', fontWeight: '900', fontFamily: 'monospace' }}
                                                    valueAccessor={(entry) => {
                                                        if (!entry) return "";
                                                        const rData = entry.payload || entry;
                                                        
                                                        if (viewModeTab === "PETUGAS") {
                                                            return rData.total_realisasi > 0 ? `${rData.total_realisasi.toLocaleString('id-ID')}` : "0";
                                                        } else {
                                                            const totalProgres = 100 - (parseFloat(rData.open) || 0);
                                                            return totalProgres > 0 ? `${totalProgres.toFixed(0)}%` : "0%";
                                                        }
                                                    }}
                                                />
                                            )}
                                        </Bar>
                                    ))}
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* 🌟 REKAP KANAN: PIE CHART MURNI 6 STATUS */}
                    <div className="lg:col-span-1 space-y-4 border-l border-slate-100 pl-2 lg:pl-4">
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center lg:text-left">Status Assignment (%)</div>
                        <div className="h-44 w-full relative">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart margin={{ top: 0, right: 0, bottom: 5, left: 0 }}>
                                    <Pie
                                        data={dataPieStatus}
                                        cx="50%" cy="45%" innerRadius={42} outerRadius={55} paddingAngle={2} dataKey="value" stroke="none"
                                    >
                                        {dataPieStatus.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <text x="50%" y="45%" textAnchor="middle" dominantBaseline="middle" className="fill-slate-800 font-mono font-black text-[12px]">
                                        {totalSeluruhMuatan.toLocaleString('id-ID')}
                                    </text>
                                    <Tooltip 
                                        content={({ active, payload }) => {
                                            if (active && payload && payload.length) {
                                                const pData = payload[0];
                                                const persentase = ((pData.value / totalSeluruhMuatan) * 100).toFixed(1);
                                                return (
                                                    <div className="bg-slate-950 text-white px-2 py-1.5 rounded-lg text-[10px] font-sans shadow-xl">
                                                        <span className="font-bold">{pData.name}</span>: <span className="font-mono text-indigo-300">{pData.value.toLocaleString('id-ID')} ({persentase}%)</span>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Status SLS Induk Area */}
                        <div className="space-y-2 mt-4">
                            {[
                                { label: 'SLS Selesai Didata', count: dataMonitoringWilayah.statusSls.selesai, color: 'bg-emerald-500' },
                                { label: 'SLS Sedang Didata', count: dataMonitoringWilayah.statusSls.sedang, color: 'bg-indigo-500' },
                                { label: 'SLS Belum Mulai', count: dataMonitoringWilayah.statusSls.belum, color: 'bg-slate-300' }
                            ].map((item) => (
                                <div key={item.label} className="flex items-center justify-between bg-slate-50/70 px-3 py-2 rounded-xl border border-slate-100 text-[10px]">
                                    <span className="font-bold text-slate-500 uppercase flex items-center gap-1.5">
                                        <span className={`w-1.5 h-1.5 rounded-full ${item.color}`}></span>
                                        {item.label}
                                    </span>
                                    <span className="font-mono font-black text-slate-700">{item.count} SLS</span>
                                </div>
                            ))}
                            <button 
    onClick={handleDownloadSlsExcel} 
    className="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white py-2 rounded-xl text-[10px] font-black uppercase tracking-wider shadow-md transition-all duration-150 mt-2 flex items-center justify-center gap-1.5"
    title="Unduh data volume realisasi saat ini dalam bentuk berkas Excel"
>
    <span>📥</span> Export Data Realisasi
</button>
                        </div>
                    </div>
                </div>
            </div>

            {/* 🚀 BARIS TENGAH: DIAGRAM TREN TIME-SERIES */}
            <div className="bg-white p-5 border border-slate-200 rounded-3xl shadow-sm">
                <div className="mb-4">
                    <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                        📈 Grafik Penambahan Kirim Assignment per Hari (2 Minggu Terakhir)
                    </h4>
                    <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">
                        Wilayah: {selectedKecTab === "SEMUA" ? "Satu Kabupaten Boyolali" : selectedPetugasEmail ? `PCL ${selectedPetugas}` : selectedDesaCode ? `Desa ${selectedDesaName}` : `Kecamatan ${namaKecamatanTerpilihText}`}
                    </p>
                </div>
                <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartTrenData} margin={{ left: -20, right: 10, bottom: 5, top: 10 }}>
                            <defs>
                                <linearGradient id="colorCapaian" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2}/>
                                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="label" stroke="#94a3b8" fontSize={9} tickLine={false} tick={{ fontWeight: 600 }} />
                            <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} />
                            <Tooltip content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                    return (
                                        <div className="bg-slate-900 text-white p-2.5 rounded-xl text-[11px] font-mono shadow-xl border border-slate-800">
                                            <div className="font-sans font-bold border-b border-slate-700 pb-1 mb-1 text-slate-400">{payload[0].payload.tanggalRaw}</div>
                                            <div>Akumulasi: <strong className="text-indigo-400">{payload[0].value.toLocaleString('id-ID')}</strong> Assignment</div>
                                        </div>
                                    );
                                }
                                return null;
                            }}/>
                            <Area type="monotone" dataKey="Capaian Kumulatif" stroke="#6366f1" strokeWidth={2.5} fillOpacity={1} fill="url(#colorCapaian)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

{/* 🚀 BARIS BAWAH: TABEL TOP & BOTTOM PCL */}
<div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

    {/* Panel Kiri: Top Performers */}
    <div className="bg-white p-4 border border-slate-200 rounded-3xl shadow-sm flex flex-col h-[450px]">
        <div className="border-b border-slate-100 pb-3 mb-3 flex justify-between items-center">
            <span className="text-[11px] font-black text-emerald-600 uppercase tracking-wider flex items-center gap-1.5">
                🏆 Top {limitPetugas} Realisasi Terbanyak
            </span>
            <span className="bg-emerald-50 text-emerald-600 text-[9px] font-mono font-black px-2 py-0.5 rounded-full">
                {selectedKecTab === "SEMUA" ? "TINGKAT KABUPATEN" : "TINGKAT KECAMATAN"}
            </span>
        </div>
        <div className="overflow-y-auto overflow-x-auto flex-1 scrollbar-thin pr-1">
            <table className="w-full text-left border-collapse min-w-[650px]">
                <thead className="sticky top-0 bg-white z-10 shadow-sm outline outline-1 outline-slate-100">
                    <tr className="text-[9px] font-black text-slate-400 uppercase tracking-wider bg-slate-50">
                        <th className="p-2.5 text-center w-8">No</th>
                        <th className="p-2.5">Nama PCL</th>
                        <th className="p-2.5">Nama PML</th>
                        <th className="p-2.5">Kecamatan</th>
                        <th className="p-2.5 text-right">Terkirim</th>
                        <th className="p-2.5 text-right">Target</th>
                        <th className="p-2.5 text-right pr-4">%</th>
                    </tr>
                </thead>
                <tbody className="text-[10px] text-slate-600 font-medium divide-y divide-slate-100">
                    {topPerformers.map((p, idx) => {
                        const pmlName = p.emailPml === "tanpa pengawas" ? "Tanpa Pengawas" : (staffLookup[p.emailPml] || p.emailPml);
                        const persentase = p.total_target > 0 ? ((p.total_realisasi / p.total_target) * 100).toFixed(1) : "0.0";
                        return (
                            <tr key={p.email} className="hover:bg-emerald-50/50 transition-colors">
                                <td className="p-2 text-center font-mono font-bold text-slate-400">{idx + 1}</td>
                                <td className="p-2 font-bold text-slate-800 whitespace-nowrap">{p.nama_asli}</td>
                                <td className="p-2 whitespace-nowrap truncate max-w-[130px]" title={pmlName}>{pmlName}</td>
                                <td className="p-2 font-bold text-slate-500 whitespace-nowrap">{p.namaKec}</td>
                                <td className="p-2 text-right font-mono font-black text-emerald-600">{p.total_realisasi.toLocaleString('id-ID')}</td>
                                <td className="p-2 text-right font-mono text-slate-400">{p.total_target.toLocaleString('id-ID')}</td>
                                <td className="p-2 text-right pr-4 font-mono font-bold text-slate-800">{persentase}%</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    </div>

    {/* Panel Kanan: Bottom Performers */}
    <div className="bg-white p-4 border border-slate-200 rounded-3xl shadow-sm flex flex-col h-[450px]">
        <div className="border-b border-slate-100 pb-3 mb-3 flex justify-between items-center">
            <span className="text-[11px] font-black text-rose-600 uppercase tracking-wider flex items-center gap-1.5">
                ⚠️ Bottom {limitPetugas} Realisasi Paling Sedikit
            </span>
            <span className="bg-rose-50 text-rose-600 text-[9px] font-mono font-black px-2 py-0.5 rounded-full">
                {selectedKecTab === "SEMUA" ? "TINGKAT KABUPATEN" : "TINGKAT KECAMATAN"}
            </span>
        </div>
        <div className="overflow-y-auto overflow-x-auto flex-1 scrollbar-thin pr-1">
            <table className="w-full text-left border-collapse min-w-[650px]">
                <thead className="sticky top-0 bg-white z-10 shadow-sm outline outline-1 outline-slate-100">
                    <tr className="text-[9px] font-black text-slate-400 uppercase tracking-wider bg-slate-50">
                        <th className="p-2.5 text-center w-8">No</th>
                        <th className="p-2.5">Nama PCL</th>
                        <th className="p-2.5">Nama PML</th>
                        <th className="p-2.5">Kecamatan</th>
                        <th className="p-2.5 text-right">Terkirim</th>
                        <th className="p-2.5 text-right">Target</th>
                        <th className="p-2.5 text-right pr-4">%</th>
                    </tr>
                </thead>
                <tbody className="text-[10px] text-slate-600 font-medium divide-y divide-slate-100">
                    {bottomPerformers.map((p, idx) => {
                        const pmlName = p.emailPml === "tanpa pengawas" ? "Tanpa Pengawas" : (staffLookup[p.emailPml] || p.emailPml);
                        const persentase = p.total_target > 0 ? ((p.total_realisasi / p.total_target) * 100).toFixed(1) : "0.0";
                        return (
                            <tr key={p.email} className="hover:bg-rose-50/50 transition-colors">
                                <td className="p-2 text-center font-mono font-bold text-slate-400">{idx + 1}</td>
                                <td className="p-2 font-bold text-slate-800 whitespace-nowrap">{p.nama_asli}</td>
                                <td className="p-2 whitespace-nowrap truncate max-w-[130px]" title={pmlName}>{pmlName}</td>
                                <td className="p-2 font-bold text-slate-500 whitespace-nowrap">{p.namaKec}</td>
                                <td className="p-2 text-right font-mono font-black text-rose-600">{p.total_realisasi.toLocaleString('id-ID')}</td>
                                <td className="p-2 text-right font-mono text-slate-400">{p.total_target.toLocaleString('id-ID')}</td>
                                <td className="p-2 text-right pr-4 font-mono font-bold text-slate-800">{persentase}%</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    </div>

</div>

            {/* 🌟 MODAL DRILL-DOWN EXCLUSIVE: JUMLAH KIRIM DI BAWAH RATA-RATA DENGAN PAGINASI 20 🌟 */}
            {showKpiModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-[100] p-4 animate-fade-in">
                    <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden transform transition-all duration-300 scale-100">
                        
                        {/* Header Modal */}
                        <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50">
                            <div>
                                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                                    📉 Detail Petugas Di Bawah Rata-Rata Realisasi
                                </h3>
                                <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">
                                    Standar Rata-Rata Saat Ini: <span className="text-indigo-600 font-mono">{metriksKpiHarian.rata2RealisasiPerPetugas} Dokumen</span> (Cakupan: {selectedKecTab === "SEMUA" ? "Kabupaten" : `Kec. ${namaKecamatanTerpilihText}`})
                                </p>
                            </div>
                            <button 
                                onClick={() => setShowKpiModal(false)}
                                className="bg-slate-200 hover:bg-slate-300 text-slate-600 font-black text-xs px-2.5 py-1.5 rounded-xl transition-all uppercase tracking-wide"
                            >
                                ✕ Tutup
                            </button>
                        </div>

                        {/* Konten Tabel Utama */}
                        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
                            <div className="border border-slate-200 rounded-2xl overflow-hidden">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-slate-800 text-white text-[9px] font-black uppercase tracking-wider">
                                            <th className="p-3 text-center w-12">No</th>
                                            <th className="p-3">Nama Petugas (PCL)</th>
                                            <th className="p-3">Pengawas (PML)</th>
                                            <th className="p-3">Kecamatan</th>
                                            <th className="p-3 text-right pr-6">Total Realisasi</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200 text-[11px] font-medium text-slate-600">
                                        {currentModalItems.length === 0 ? (
                                            <tr>
                                                <td colSpan="5" className="p-8 text-center text-slate-400 font-bold uppercase tracking-wide">
                                                    Tidak ada data petugas berkinerja rendah
                                                </td>
                                            </tr>
                                        ) : (
                                            currentModalItems.map((item, idx) => (
                                                <tr key={idx} className="hover:bg-slate-50 transition-colors odd:bg-white even:bg-slate-50/30">
                                                    <td className="p-3 text-center font-mono font-bold text-slate-400">
                                                        {indexOfFirstItem + idx + 1}
                                                    </td>
                                                    <td className="p-3 font-black text-slate-800">
                                                        {item.namaPetugas}
                                                    </td>
                                                    <td className="p-3 text-slate-500 font-semibold">
                                                        {item.namaPengawas}
                                                    </td>
                                                    <td className="p-3">
                                                        <span className="bg-slate-100 border border-slate-200 text-slate-700 px-2 py-0.5 rounded-md font-bold text-[9px] uppercase tracking-wide">
                                                            {item.namaKecamatan}
                                                        </span>
                                                    </td>
                                                    <td className="p-3 text-right pr-6 font-mono font-black text-amber-600">
                                                        {item.realisasi.toLocaleString('id-ID')} <span className="text-[9px] font-sans font-normal text-slate-400">Dok</span>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Footer & Pengendali Paginasi */}
                        <div className="p-4 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-3 bg-slate-50">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                                Menampilkan <span className="font-mono text-slate-700">{lowPerformersList.length > 0 ? indexOfFirstItem + 1 : 0}</span> - <span className="font-mono text-slate-700">{Math.min(indexOfLastItem, lowPerformersList.length)}</span> dari <span className="font-mono text-indigo-600">{lowPerformersList.length}</span> Petugas
                            </div>
                            
                            {totalPages > 1 && (
                                <div className="flex items-center gap-1.5">
                                    <button 
                                        disabled={modalCurrentPage === 1}
                                        onClick={() => setModalCurrentPage(prev => Math.max(prev - 1, 1))}
                                        className="bg-white border border-slate-200 text-slate-700 px-3 py-1.5 rounded-xl font-black text-[9px] uppercase tracking-wider shadow-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 transition-all"
                                    >
                                        ◀ Prev
                                    </button>
                                    
                                    <div className="bg-white border border-slate-200 px-3 py-1.5 rounded-xl text-[10px] font-mono font-black text-slate-700 min-w-[70px] text-center shadow-inner">
                                        {modalCurrentPage} / {totalPages}
                                    </div>

                                    <button 
                                        disabled={modalCurrentPage === totalPages}
                                        onClick={() => setModalCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                        className="bg-white border border-slate-200 text-slate-700 px-3 py-1.5 rounded-xl font-black text-[9px] uppercase tracking-wider shadow-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 transition-all"
                                    >
                                        Next ▶
                                    </button>
                                </div>
                            )}
                        </div>

                    </div>
                </div>
            )}

        </div>
    );
}