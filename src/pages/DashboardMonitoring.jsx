import React, { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, PieChart, Pie, Cell, AreaChart, Area, Legend, ReferenceLine } from 'recharts';
import { supabase } from '../supabaseClient'; 
import * as XLSX from 'xlsx';


// Komponen dipisah ke luar agar tidak di-recreate oleh React setiap kali hover
const CustomLabelTren = (props) => {
    const { x, y, value, strokeColor, isDimmed } = props;
    if (!value || value === 0 || isDimmed) return null; 

    return (
        <text 
            x={x} 
            y={y - 8} 
            fill={strokeColor} 
            fontSize={9} 
            fontWeight={900} 
            textAnchor="middle"
            className="font-mono pointer-events-none" 
            style={{ textShadow: '1px 1px 2px white, -1px -1px 2px white, 1px -1px 2px white, -1px 1px 2px white' }}
        >
            +{Number(value).toLocaleString('id-ID')}
        </text>
    );
};

const susunanBarStatus = [
    { key: "submitted", label: "SUBMITTED BY Pencacah", fill: "#3b82f6", radius: undefined },
    //{key: "submitted_resp", label: "SUBMITTED BY Respondent", fill: "#4042db", radius: undefined },  
    { key: "draft",     label: "DRAFT",                 fill: "#f97316", radius: undefined },  
    { key: "rejected",  label: "REJECTED BY Pengawas",  fill: "#ef4444", radius: undefined },  
    { key: "revoked",   label: "REVOKED BY Pengawas",   fill: "#991b1b", radius: undefined },
    
    //{ key: "edited",    label: "EDITED BY Pengawas",    fill: "#758a2c", radius: undefined },  
    { key: "approved",  label: "APPROVED BY Pengawas",  fill: "#10b981", radius: undefined },  
    { key: "open",      label: "OPEN",                  fill: "#e2e8f0", radius: [4, 4, 0, 0] } 
];

export default function DashboardMonitoring() {
    // ==========================================
    // 1. STATE MANAGEMENT UTAMA (useState)
    // ==========================================
    const [selectedKecTab, setSelectedKecTab] = useState("SEMUA");
    const [selectedKecamatan, setSelectedKecamatan] = useState(null); 
    const [selectedPml, setSelectedPml] = useState("SEMUA"); 
    const [viewModeTab, setViewModeTab] = useState("DESA"); 
    const [selectedDesaCode, setSelectedDesaCode] = useState(null);
    const [selectedDesaName, setSelectedDesaName] = useState("");
    const [selectedPetugas, setSelectedPetugas] = useState(null);
    const [selectedPetugasEmail, setSelectedPetugasEmail] = useState(null); 

    const [loading, setLoading] = useState(true);
    const [rawData, setRawData] = useState([]);
    const [historyData, setHistoryData] = useState([]); 
    const [pmlList, setPmlList] = useState([]); 
    const [staffLookup, setStaffLookup] = useState({}); 
    const [pclToPmlLookup, setPclToPmlLookup] = useState({}); 
    const [lastSyncedTime, setLastSyncedTime] = useState(null); 

    const [showKpiModal, setShowKpiModal] = useState(false);
    const [modalCurrentPage, setModalCurrentPage] = useState(1);
    const [lowPerformersList, setLowPerformersList] = useState([]);

    const [criticalModalConfig, setCriticalModalConfig] = useState({ show: false, type: "", title: "", data: [] });
    const [criticalCurrentPage, setCriticalCurrentPage] = useState(1);

    const [metriksKpiHarian, setMetriksKpiHarian] = useState({
        hariKe: 1,
        rata2RealisasiPerPetugas: 0,
        rata2DokPerHariPerPetugas: 0,
        petugasDiBawahRata2: 0
    });

    const [dataMonitoringWilayah, setDataMonitoringWilayah] = useState({
        kecamatan: [],
        desa: [],
        petugas: [],
        sls: [],
        muatanStatus: { submitted: 0, draft: 0, rejected: 0, revoked: 0, approved: 0, open: 0 }, 
        statusSls: { selesai: 0, sedang: 0, belum: 0, total: 0 }
    });

    const [criticalPcl, setCriticalPcl] = useState({ macet: [], melambat: [] });
    const [chartTrenData, setChartTrenData] = useState([]);
    const [trendKeys, setTrendKeys] = useState([]);
    const [hoveredTrend, setHoveredTrend] = useState(null);

    const namaKecamatanTerpilihText = selectedKecTab !== "SEMUA" 
        ? (dataMonitoringWilayah.kecamatan.find(k => k.kodeKec === selectedKecTab)?.nama_asli || selectedKecTab)
        : "";

    // ==========================================
    // 2. DATA EFFECTS MANAGEMENT (useEffect)
    // ==========================================
useEffect(() => {
    async function loadAllDashboardData() {
        try {
            setLoading(true);

const { data: currentProgress, error: progressError } = await supabase
    .from('progress_boyolali')
    .select(`
        idsubsls, kecamatan, kode_desa, nama_desa, kode_sls, nama_rt_dusun, updated_at,
        total, open, draft, submitted_pencacah, approved_pengawas, 
        rejected_pengawas, revoked_pengawas, edited_pengawas, submitted_respondent,
        muatan_sls (
            nmsls, kdkec, nmkec, kddesa, nmdesa, petugas_id,
            petugas (nama_petugas, posisi_tugas, id_pml_atasan, kecamatan_tugas)
        )
    `);
if (progressError) throw progressError;

            // 🌟 OPTIMISASI EGRESS 1: Filter tanggal langsung di Server Supabase (Hanya 14 Hari terakhir)
            const duaMingguLalu = new Date();
            duaMingguLalu.setDate(duaMingguLalu.getDate() - 15); // Ambil aman 15 hari
            const strFilterTanggal = duaMingguLalu.toISOString().split('T')[0];

            // 🌟 OPTIMISASI EGRESS 2: Ambil kolom yang dibutuhkan saja, HINDARI select('*')
            const { data: historicalLogs, error: historyError } = await supabase
                .from('history_progress_petugas')
                .select('tanggal, petugas_id, total_capaian, kode_kec, kode_desa') 
                .gte('tanggal', strFilterTanggal) // <--- Server-side filtering mengurangi baris drastis
                .order('tanggal', { ascending: true });
            if (historyError) throw historyError;

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

// ==========================================
    // 2. DATA EFFECTS MANAGEMENT (useEffect) - UPDATE PERBAIKAN BUG CRITICAL PCL
    // ==========================================
// ==========================================
    // 2. DATA EFFECTS MANAGEMENT (useEffect) - PERBAIKAN TOTAL BERDASARKAN PROGRESS DELTA (H-1 - H-3)
    // ==========================================
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
            
            const s_submitted          = parseInt(row.submitted_pencacah) || 0;
            const s_draft              = parseInt(row.draft) || 0;
            const s_rejected           = parseInt(row.rejected_pengawas) || 0;
            const s_revoked            = parseInt(row.revoked_pengawas) || 0;
            const s_approved           = parseInt(row.approved_pengawas) || 0;
            const s_edited             = parseInt(row.edited_pengawas) || 0;
            const s_submitted_resp     = parseInt(row.submitted_respondent) || 0;
            const s_open               = parseInt(row.open) || 0;

            // Total target dihitung dari akumulasi semua status, atau bisa langsung menggunakan row.total
            const totalTarget = parseInt(row.total) || (s_submitted + s_draft + s_rejected + s_revoked + s_approved + s_edited + s_submitted_resp + s_open);

            let statusSlsKategori = "belum";
            if (totalTarget > 0) {
                if (s_open === 0) statusSlsKategori = "selesai";
                else if (s_open < totalTarget) statusSlsKategori = "sedang";
                else statusSlsKategori = "belum";
            }

const initStrukturData = (kode, namaTampilan, namaAsli) => ({
                kodeKec, kodeDesa, nama: namaTampilan, nama_asli: namaAsli,
                submitted: 0, draft: 0, rejected: 0, revoked: 0, approved: 0, 
                edited: 0, submitted_resp: 0, open: 0, // <-- Tambahan kolom baru
                t: 0, jml_sls: 0, sls_selesai: 0
            });

// =================================================================
            // PROSES AKUMULASI DATA WILAYAH & PETUGAS (FIX KOLOM SEPARATED NUMERIC)
            // =================================================================
            
            // 1. Akumulasi per Kecamatan
            if (!kecMap[kodeKec]) kecMap[kodeKec] = initStrukturData(kodeKec, `${namaKec} [${kodeKec}]`, namaKec);
            kecMap[kodeKec].submitted      += s_submitted; 
            kecMap[kodeKec].draft          += s_draft;
            kecMap[kodeKec].rejected       += s_rejected; 
            kecMap[kodeKec].revoked        += s_revoked;
            kecMap[kodeKec].approved       += s_approved; 
            kecMap[kodeKec].edited         += s_edited;          // Kolom Baru
            kecMap[kodeKec].submitted_resp += s_submitted_resp;  // Kolom Baru
            kecMap[kodeKec].open           += s_open;
            kecMap[kodeKec].t              += totalTarget; 
            kecMap[kodeKec].jml_sls        += 1;
            if (statusSlsKategori === "selesai") kecMap[kodeKec].sls_selesai += 1;

            // 2. Akumulasi per Desa
            if (!desaMap[kodeDesa]) desaMap[kodeDesa] = initStrukturData(kodeDesa, namaDesa, namaDesa);
            desaMap[kodeDesa].submitted      += s_submitted; 
            desaMap[kodeDesa].draft          += s_draft;
            desaMap[kodeDesa].rejected       += s_rejected; 
            desaMap[kodeDesa].revoked        += s_revoked;
            desaMap[kodeDesa].approved       += s_approved; 
            desaMap[kodeDesa].edited         += s_edited;          // Kolom Baru
            desaMap[kodeDesa].submitted_resp += s_submitted_resp;  // Kolom Baru
            desaMap[kodeDesa].open           += s_open;
            desaMap[kodeDesa].t              += totalTarget; 
            desaMap[kodeDesa].jml_sls        += 1;
            if (statusSlsKategori === "selesai") desaMap[kodeDesa].sls_selesai += 1;

            const kecamatanResmiPetugas = relPetugas.kecamatan_tugas || row.kecamatan || relMuatan.nmkec || "Unknown";

            // 3. Akumulasi per Petugas (PCL)
            if (!petugasMap[emailPetugas]) {
                petugasMap[emailPetugas] = {
                    kodeKec: kodeKec, 
                    kodeDesa: kodeDesa,
                    nama: namaPetugas,
                    nama_asli: namaPetugas,
                    email: emailPetugas,
                    namaKec: kecamatanResmiPetugas, 
                    emailPml: emailPmlFormated,
                    submitted: 0, draft: 0, rejected: 0, revoked: 0, approved: 0, 
                    edited: 0, submitted_resp: 0, open: 0, // Kolom Baru dimasukkan di inisialisasi
                    t: 0, jml_sls: 0, sls_selesai: 0
                };
            }

            petugasMap[emailPetugas].submitted      += s_submitted;
            petugasMap[emailPetugas].draft          += s_draft;
            petugasMap[emailPetugas].rejected       += s_rejected;
            petugasMap[emailPetugas].revoked        += s_revoked;
            petugasMap[emailPetugas].approved       += s_approved;
            petugasMap[emailPetugas].edited         += s_edited;          // Kolom Baru
            petugasMap[emailPetugas].submitted_resp += s_submitted_resp;  // Kolom Baru
            petugasMap[emailPetugas].open           += s_open;
            petugasMap[emailPetugas].t              += totalTarget;
            petugasMap[emailPetugas].jml_sls        += 1;
            if (statusSlsKategori === "selesai") petugasMap[emailPetugas].sls_selesai += 1;

            // 4. Transformasi Persentase untuk Data SLS Tunggal (slsList)
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
                edited: totalTarget > 0 ? Math.round((s_edited / totalTarget) * 100) : 0,                     // Kolom Baru
                submitted_resp: totalTarget > 0 ? Math.round((s_submitted_resp / totalTarget) * 100) : 0,     // Kolom Baru
                open: totalTarget > 0 ? Math.round((s_open / totalTarget) * 100) : 100,
                jml_sls: 1, sls_selesai: statusSlsKategori === "selesai" ? 1 : 0
            });

            if (selectedKecTab === "SEMUA" || kodeKec === selectedKecTab) {
                if (selectedPml === "SEMUA" || emailPmlFormated === selectedPml.toLowerCase().trim()) {
                    fSubmitted += s_submitted; fDraft += s_draft; fRejected += s_rejected;
                    fRevoked += s_revoked; fApproved += s_approved; fOpen += s_open; fSlsTotal++;
                    if (statusSlsKategori === "selesai") fSlsSelesai++;
                    else if (statusSlsKategori === "sedang") fSlsSedang++;
                    else fSlsBelum++;
                }
            }
        });

        const tanggalAwalSensus = new Date("2026-06-15");
        const tanggalHariIni = new Date();
        const selisihMilidetik = tanggalHariIni - tanggalAwalSensus;
        const kalkulasiHariKe = selisihMilidetik > 0 ? Math.floor(selisihMilidetik / (1000 * 60 * 60 * 24)) + 1 : 1;

        const totalMuatanSelainOpen = fSubmitted + fDraft + fRejected + fRevoked + fApproved;
        const daftarPetugasValid = Object.values(petugasMap).filter(p => p.email !== "Tanpa Petugas" && (selectedKecTab === "SEMUA" || p.kodeKec === selectedKecTab) && (selectedPml === "SEMUA" || p.emailPml === selectedPml.toLowerCase().trim()));
        const jumlahPetugasAktif = daftarPetugasValid.length;

        const hitungRata2RealisasiPerPetugas = jumlahPetugasAktif > 0 ? Math.round(totalMuatanSelainOpen / jumlahPetugasAktif) : 0;
        const hitungRata2DokPerHariPerPetugas = (kalkulasiHariKe > 0 && jumlahPetugasAktif > 0) 
            ? parseFloat((totalMuatanSelainOpen / kalkulasiHariKe / jumlahPetugasAktif).toFixed(1)) 
            : 0;

        let counterPetugasDiBawahRata2 = 0;
        const tmpLowPerformers = []; 
        const tmpMacet = [];
        const tmpMelambat = [];

        // Pembuatan tanggal penilai dinamis (H-1 dan H-3)
        const tglSekarang = new Date();
        const tglH1 = new Date(); tglH1.setDate(tglSekarang.getDate() - 1);
        const tglH3 = new Date(); tglH3.setDate(tglSekarang.getDate() - 4);
        
        const strH1 = tglH1.toISOString().split('T')[0];
        const strH3 = tglH3.toISOString().split('T')[0];

        daftarPetugasValid.forEach(p => {
            const realisasiIndividu = p.submitted + p.draft + p.rejected + p.revoked + p.approved; 
            const emailClean = p.email.toLowerCase().trim();

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

            // 🌟 LOGIKA UTAMA: Hitung total capaian kumulatif lintas desa untuk tanggal H-1 dan H-3
            let capaianH1 = 0;
            let capaianH3 = 0;

            historyData.forEach(h => {
                if (h.petugas_id?.toLowerCase().trim() === emailClean) {
                    if (h.tanggal === strH1) {
                        capaianH1 += (h.total_capaian || 0);
                    }
                    if (h.tanggal === strH3) {
                        capaianH3 += (h.total_capaian || 0);
                    }
                }
            });

            // Hitung selisih progres dokumen riil selama 3 hari terakhir
            const totalPerubahanTigaHari = Math.max(capaianH1 - capaianH3, 0);

            // EVALUASI KATEGORI 1: MACET (Jika selisih progres = 0, artinya tidak ada perubahan sama sekali)
            if (totalPerubahanTigaHari === 0 && p.t > p.open) {
                tmpMacet.push(p.email);
            } 
            // EVALUASI KATEGORI 2: MELAMBAT (Ada progres, tapi bertambah kurang dari 10 dokumen dalam 3 hari)
            else if (totalPerubahanTigaHari > 0 && totalPerubahanTigaHari < 10) {
                tmpMelambat.push(p.email);
            }
        });

        tmpLowPerformers.sort((a, b) => a.realisasi - b.realisasi);
        setLowPerformersList(tmpLowPerformers);
        setCriticalPcl({ macet: tmpMacet, melambat: tmpMelambat });

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
                edited: Math.round((obj.edited / total) * 100),                 // Baru
                submitted_resp: Math.round((obj.submitted_resp / total) * 100), // Baru
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

// --- BLOCK REPLACEMENT: FINAL LOGIKA TREN ANTI MULTI-DESA PER PETUGAS ---
useEffect(() => {
    if (historyData.length === 0) return;

    // 1. Dapatkan semua tanggal unik secara berurutan (Ascending)
    const tanggalUnik = [...new Set(historyData.map(h => h.tanggal))].sort();
    const kumpulanKeys = new Set();
    
    // Cache permanen untuk melacak total akumulatif terakhir per petugas lintas desa
    let lastCapaianPerPetugas = {};
    let lastTotalWilayah = 0;

    const dataChartGaris = tanggalUnik.map((tgl, tglIdx) => {
        // Ambil semua log mentah di tanggal hari ini
        const rawLogsHariIni = historyData.filter(h => h.tanggal === tgl);
        
        // 🌟 PERBAIKAN UTAMA: Gabungkan (Sum) total_capaian petugas jika dia punya banyak desa di hari yang sama
        let databaseCapaianHariIni = {};
        rawLogsHariIni.forEach(h => {
            if (h.petugas_id) {
                const email = h.petugas_id.toLowerCase().trim();
                databaseCapaianHariIni[email] = (databaseCapaianHariIni[email] || 0) + (h.total_capaian || 0);
            }
        });

        // Terapkan filter wilayah/PML untuk kebutuhan tampilan visual grafik
        let filteredLogs = [...rawLogsHariIni];
        if (selectedKecTab !== "SEMUA") filteredLogs = filteredLogs.filter(h => h.kode_kec === selectedKecTab);
        if (selectedDesaCode) filteredLogs = filteredLogs.filter(h => h.kode_desa === selectedDesaCode);
        if (selectedPetugasEmail) filteredLogs = filteredLogs.filter(h => h.petugas_id === selectedPetugasEmail);
        if (selectedPml !== "SEMUA") {
            filteredLogs = filteredLogs.filter(h => {
                const emailPclFormated = h.petugas_id ? h.petugas_id.toLowerCase().trim() : "";
                return pclToPmlLookup[emailPclFormated] === selectedPml.toLowerCase().trim();
            });
        }

        const dateObj = new Date(tgl);
        const labelTanggal = `${dateObj.getDate()} ${dateObj.toLocaleString('id-ID', { month: 'short' })}`;
        let dataPoint = { tanggalRaw: tgl, label: labelTanggal };

        // 3. PROSES DATA UNTUK GRAFIK
        if (viewModeTab === "PETUGAS" && !selectedPetugasEmail) {
            // Kita loop berdasarkan data yang sudah difilter wilayahnya
            // Tapi karena filteredLogs masih berbentuk multi-row per desa, kita group lagi penambahannya
            let penambahanGarisHariIni = {};

            filteredLogs.forEach(h => {
                const emailFormated = h.petugas_id ? h.petugas_id.toLowerCase().trim() : "Unknown";
                const namaPcl = staffLookup[emailFormated] || h.petugas_id || "Tanpa Nama";
                
                // Gunakan nilai gabungan yang sudah dihitung di atas
                const capaianSaatIni = databaseCapaianHariIni[emailFormated] || 0;
                const capaianSebelumnya = lastCapaianPerPetugas[emailFormated] || 0;
                
                const penambahanHariIni = Math.max(capaianSaatIni - capaianSebelumnya, 0);
                
                // Simpan sementara per nama petugas (mencegah double akumulasi di loop desa)
                penambahanGarisHariIni[namaPcl] = penambahanHariIni;
                kumpulanKeys.add(namaPcl);
            });

            // Masukkan hasil penambahan murni ke titik data chart
            Object.keys(penambahanGarisHariIni).forEach(namaPcl => {
                dataPoint[namaPcl] = penambahanGarisHariIni[namaPcl];
            });

            // 🌟 Update Master Cache menggunakan data kumulatif gabungan seluruh desa
            Object.keys(databaseCapaianHariIni).forEach(email => {
                lastCapaianPerPetugas[email] = databaseCapaianHariIni[email];
            });

        } else {
            // LOGIKA MODE WILAYAH / SINGLE PETUGAS SPECIFIC
            const totalCapaianSaatIni = filteredLogs.reduce((sum, item) => sum + (item.total_capaian || 0), 0);
            const penambahanHariIni = Math.max(totalCapaianSaatIni - lastTotalWilayah, 0);
            const namaKey = selectedPetugasEmail ? (staffLookup[selectedPetugasEmail] || selectedPetugasEmail) : "Penambahan Harian";
            
            dataPoint[namaKey] = tglIdx === 0 ? totalCapaianSaatIni : penambahanHariIni;
            kumpulanKeys.add(namaKey);

            lastTotalWilayah = totalCapaianSaatIni;
        }

        return dataPoint;
    });
const dataChartTanpaHariPertama = dataChartGaris.slice(1);
    setTrendKeys(Array.from(kumpulanKeys));
    setChartTrenData(dataChartTanpaHariPertama);
    
}, [historyData, selectedKecTab, selectedDesaCode, selectedPetugasEmail, selectedPml, pclToPmlLookup, viewModeTab, staffLookup]);

    // ==========================================
    // 3. OPTIMISASI PERHITUNGAN DATA (useMemo)
    // ==========================================
// =========================================================================
    // 3. OPTIMISASI PERHITUNGAN DATA (useMemo)
    // =========================================================================
    const barChartData = useMemo(() => {
        if (viewModeTab === "PETUGAS") {
            let filteredPetugas = dataMonitoringWilayah.petugas;
            if (selectedKecTab !== "SEMUA") {
                filteredPetugas = filteredPetugas.filter(p => p.kodeKec === selectedKecTab);
            }
            if (selectedPml !== "SEMUA") {
                filteredPetugas = filteredPetugas.filter(p => p.emailPml === selectedPml.toLowerCase().trim());
            }
            return filteredPetugas;
        }
        
        if (viewModeTab === "SLS") {
            if (selectedPetugasEmail) {
                return dataMonitoringWilayah.sls.filter(s => s.petugas_id === selectedPetugasEmail);
            }
            return dataMonitoringWilayah.sls.filter(s => s.kodeKec === selectedKecTab && s.kodeDesa === selectedDesaCode);
        }
        
        return selectedKecTab === "SEMUA" 
            ? dataMonitoringWilayah.kecamatan 
            : dataMonitoringWilayah.desa.filter(d => d.kodeKec === selectedKecTab);
    }, [viewModeTab, selectedKecTab, selectedPml, selectedPetugasEmail, selectedDesaCode, dataMonitoringWilayah]);

    const isPetugasMode = viewModeTab === "PETUGAS";
    const unitSatuanYAxis = isPetugasMode ? "" : "%";
    const formatSuffixTooltip = isPetugasMode ? " Dokumen" : "%";

    // =========================================================================
    // 🌟 KUNCI PERBAIKAN: LOGIKA TARGET PINDAH KE DALAM SCOPE KOMPONEN
    // =========================================================================
    // =========================================================================
    // 🌟 PERBAIKAN LOGIKA: TARGET DOKUMEN KIRIM SAMPAI HARI INI
    // =========================================================================
    const TANGGAL_MULAI = new Date("2026-06-15");
    const TANGGAL_SELESAI = new Date("2026-08-31");
    const TOTAL_HARI = Math.floor((TANGGAL_SELESAI - TANGGAL_MULAI) / (1000 * 60 * 60 * 24)) + 1; // 77 Hari
    
    const selisihHari = new Date() - TANGGAL_MULAI;
    const HARI_KE = selisihHari > 0 ? Math.floor(selisihHari / (1000 * 60 * 60 * 24)) + 1 : 1;
    
    const RASIO_WAKTU = Math.min(HARI_KE / TOTAL_HARI, 1);

    // 1. Target Persentase Wilayah (Kecamatan / Desa) -> Progresif %
    const targetPersenWilayah = Math.round(RASIO_WAKTU * 100);

    // 2. Target Volume Petugas -> Akumulasi Dokumen Seharusnya Kirim S/D Hari Ini
    const targetVolumePetugas = (() => {
        // Filter petugas di kecamatan terpilih
        const petugasDiKecamatanIni = dataMonitoringWilayah.petugas.filter(p => 
            p.email !== "Tanpa Petugas" && 
            (selectedKecTab === "SEMUA" || p.kodeKec === selectedKecTab)
        );

        // Hitung total beban target muatan awal di kecamatan tersebut
        const totalTargetMuatanKec = petugasDiKecamatanIni.reduce((sum, p) => sum + (p.total_target || 0), 0);
        const jumlahPetugasKecamatan = petugasDiKecamatanIni.length || 1;
        
        // Rata-rata beban target muatan per individu petugas
        const rataBebanPerPetugas = totalTargetMuatanKec / jumlahPetugasKecamatan;
        
        // Akumulasi target ideal sampai hari ini (Beban * Rasio Waktu Berjalan)
        return Math.round(rataBebanPerPetugas * RASIO_WAKTU);
    })();

    // Tentukan nilai & label garis target berdasarkan mode tab yang aktif
    const nilaiTargetYAxis = isPetugasMode ? targetVolumePetugas : targetPersenWilayah;
    const teksLabelTarget = isPetugasMode ? `${targetVolumePetugas.toLocaleString('id-ID')} Dokumen` : `${targetPersenWilayah}%`;
    // =========================================================================
    // =========================================================================

    // =========================================================================
    // 🔮 METRIK PREDIKTIF ESTIMASI SELESAI PROYEK (PREDICTIVE KPI)
    // =========================================================================
// =========================================================================
    // 🔮 PREDICTIVE KPI (VERSI ANTISIPASI EKOR PROYEK SEJAK AWAL)
    // =========================================================================
    const metrikEstimasiProyek = useMemo(() => {
        const masterPetugasWilayah = dataMonitoringWilayah.petugas.filter(p => 
            p.email !== "Tanpa Petugas" && 
            (selectedKecTab === "SEMUA" || p.kodeKec === selectedKecTab)
        );
        
        const totalSisaOpenAktif = masterPetugasWilayah.reduce((sum, p) => sum + (p.open || 0), 0);
        const totalBebanAwal = masterPetugasWilayah.reduce((sum, p) => sum + (p.total_target || 0), 0) || 1;

        // 1. Ambil Laju Riil 3 Hari Terakhir
        const tglHariIni = new Date();
        const dapatkanStrTgl = (minusHari) => {
            const d = new Date();
            d.setDate(tglHariIni.getDate() - minusHari);
            return d.toISOString().split('T')[0];
        };

        const tglH1 = dapatkanStrTgl(1); const tglH2 = dapatkanStrTgl(2);
        const tglH3 = dapatkanStrTgl(3); const tglH4 = dapatkanStrTgl(4);

        const setValidEmails = new Set(masterPetugasWilayah.map(p => p.email.toLowerCase().trim()));
        const logHarian = { [tglH1]: 0, [tglH2]: 0, [tglH3]: 0, [tglH4]: 0 };
        
        historyData.forEach(h => {
            const petId = (h.petugas_id || "").toLowerCase().trim();
            if (setValidEmails.has(petId) && logHarian[h.tanggal] !== undefined) {
                logHarian[h.tanggal] += (h.total_capaian || 0);
            }
        });

        const dW1 = Math.max((logHarian[tglH1] || 0) - (logHarian[tglH2] || 0), 0);
        const dW2 = Math.max((logHarian[tglH2] || 0) - (logHarian[tglH3] || 0), 0);
        const dW3 = Math.max((logHarian[tglH3] || 0) - (logHarian[tglH4] || 0), 0);
        
        // Ini adalah laju kencang saat ini (tanpa memperkirakan pelambatan akhir)
        const lajuHarianSaatIni = Math.max(parseFloat(((dW1 + dW2 + dW3) / 3).toFixed(1)), 1);

        // 🌟 KUNCI ANTISIPASI: HITUNG FAKTOR EKOR PROYEK (PROJECT TAIL FACTOR)
        // Kita hitung persentase sisa dokumen yang belum selesai
        const rasioSisaDokumen = totalSisaOpenAktif / totalBebanAwal; 

        // Koefisien Ekor Proyek (Asumsi: Di akhir proyek, laju melambat hingga tersisa ~40% dari laju puncak)
        // Rumus ini menjaga laju tetap realistis sejak awal dengan memberikan penalti pelambatan bertahap
        const faktorPelambatanEkor = 0.4 + (0.6 * rasioSisaDokumen);
        
        // Laju kirim tertimbang yang sudah memperkirakan pelambatan masa depan
        const lajuKirimPrediktif = Math.max(parseFloat((lajuHarianSaatIni * faktorPelambatanEkor).toFixed(1)), 1);

        // 2. Hitung estimasi sisa hari yang lebih realistis
        const sisaHariDibutuhkan = Math.ceil(totalSisaOpenAktif / lajuKirimPrediktif);

        const tglPrediksiSelesai = new Date();
        tglPrediksiSelesai.setDate(tglHariIni.getDate() + sisaHariDibutuhkan);

        const stringPrediksiSelesai = tglPrediksiSelesai.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
        const DEADLINE_PROYEK = new Date("2026-08-31");
        const isTerlambat = tglPrediksiSelesai > DEADLINE_PROYEK;
        const selisihDariDeadline = Math.ceil(Math.abs((tglPrediksiSelesai - DEADLINE_PROYEK) / (1000 * 60 * 60 * 24)));

        return {
            rataKirimHarian: lajuHarianSaatIni, // Tetap tampilkan laju asli di sub-info
            lajuPrediktif: lajuKirimPrediktif,
            sisaHariDibutuhkan,
            tanggalPrediksi: stringPrediksiSelesai,
            isTerlambat,
            selisihDariDeadline,
            totalSisaOpenAktif
        };
    }, [dataMonitoringWilayah.petugas, historyData, selectedKecTab]);

    const jumlahPetugasDiBawahTarget = useMemo(() => {
        if (!dataMonitoringWilayah.petugas) return 0;
        return dataMonitoringWilayah.petugas.filter(p => {
            if (p.email === "Tanpa Petugas") return false;
            const matchKec = selectedKecTab === "SEMUA" || p.kodeKec === selectedKecTab;
            const matchPml = selectedPml === "SEMUA" || p.emailPml === selectedPml.toLowerCase().trim();
            return matchKec && matchPml && (p.total_realisasi < nilaiTargetYAxis);
        }).length;
    }, [dataMonitoringWilayah.petugas, selectedKecTab, selectedPml, nilaiTargetYAxis]);
    // Membekukan elemen Barchart agar tidak terpengaruh re-render tidak perlu
    const memoizedBarChartElement = useMemo(() => (
        <BarChart
            data={barChartData}
            margin={{ bottom: 40, left: -15, right: 10, top: 20 }} 
            barCategoryGap="25%"
        >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            
            {/* 🌟 DIUBAH: Menggunakan kustom fungsi pada properti `tick` untuk mewarnai teks jadi merah */}
           <XAxis 
    dataKey="nama" 
    stroke="#94a3b8" 
    fontSize={8} 
    tickLine={false} 
    angle={-45} 
    textAnchor="end" 
    interval={0} 
    height={50} 
    tick={(props) => {
        const { x, y, payload } = props;
        const itemData = barChartData[payload.index];
        
        // Inisialisasi warna default (Aman / Memenuhi Target)
        let warnaTeks = "#475569"; 
        let ketebalanTeks = 700;

        // Atur warna bertingkat hanya berlaku di mode PETUGAS
        if (viewModeTab === "PETUGAS" && itemData) {
            const realisasi = itemData.total_realisasi || 0;
            const target = nilaiTargetYAxis || 0;

            if (realisasi < target) {
                // Kondisi 1: Jika kurang dari setengah target -> MERAH
                if (realisasi < (target / 2)) {
                    warnaTeks = "#ef4444";
                    ketebalanTeks = 900; // Lebih tebal agar kontras
                } 
                // Kondisi 2: Di bawah target tapi sudah di atas atau sama dengan setengah target -> ORANYE
                else {
                    warnaTeks = "#f97316";
                    ketebalanTeks = 800;
                }
            }
        }

        return (
            <g transform={`translate(${x},${y})`}>
                <text
                    x={0}
                    y={0}
                    dy={10}
                    textAnchor="end"
                    transform="rotate(-45)"
                    fill={warnaTeks} // Menggunakan warna hasil kalkulasi bertingkat
                    style={{ 
                        fontWeight: ketebalanTeks,
                        fontSize: '8px',
                        fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
                    }}
                >
                    {payload.value ? payload.value.toUpperCase() : ""}
                </text>
            </g>
        );
    }} 
/>  {/* PERBAIKAN: Tambahkan allowDataOverflow untuk mengunci batas atas YAxis */}
            <YAxis 
                stroke="#94a3b8" 
                fontSize={9} 
                tickLine={false} 
                unit={unitSatuanYAxis} 
                domain={isPetugasMode ? [0, 'auto'] : [0, 100]} 
                allowDataOverflow={!isPetugasMode} // Mengunci 100% saat mode persentase, tapi tetap dinamis saat mode petugas
            />
            
            {/* GARIS REFERENSI TARGET BERDASARKAN HARI BERJALAN */}
            <ReferenceLine 
                y={nilaiTargetYAxis} 
                stroke="#f59e0b" 
                strokeDasharray="4 4" 
                strokeWidth={2}
                className="z-30"
                label={{ 
                    value: `Target Hari ke-${HARI_KE}: ${teksLabelTarget}`, 
                    position: 'top', 
                    fill: '#d97706', 
                    fontSize: 10, 
                    fontWeight: 900,
                    style: { textShadow: '1px 1px 2px white, -1px -1px 2px white' }
                }} 
            />

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
                                setViewModeTab("PETUGAS");
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
    ), [barChartData, viewModeTab, selectedKecTab, isPetugasMode, unitSatuanYAxis, formatSuffixTooltip, nilaiTargetYAxis, teksLabelTarget, HARI_KE]);

    // ... batas akhir dari memoizedBarChartElement Anda ), [barChartData, ...]);

    // =========================================================================
    // 🎯 DEKLARASI AREA CHART DI LEVEL TERATAS (ATURAN HOOKS REACT)
    // =========================================================================
    const memoizedAreaChartElement = useMemo(() => {
        // Ambil filter petugas secara dinamis
        const petugasFilterGaris = dataMonitoringWilayah.petugas.filter(p => 
            p.email !== "Tanpa Petugas" && 
            (selectedKecTab === "SEMUA" || p.kodeKec === selectedKecTab)
        );
        
        const totalOpenAktif = petugasFilterGaris.reduce((sum, p) => sum + (p.open || 0), 0);
        const jumlahPetugasAktif = petugasFilterGaris.length || 1;

        const TANGGAL_MULAI_TREN = new Date("2026-06-15");
        const TANGGAL_SELESAI_TREN = new Date("2026-08-31");
        const TOTAL_HARI_TREN = Math.floor((TANGGAL_SELESAI_TREN - TANGGAL_MULAI_TREN) / (1000 * 60 * 60 * 24)) + 1;
        const selisihHariTren = new Date() - TANGGAL_MULAI_TREN;
        const HARI_KE_TREN = selisihHariTren > 0 ? Math.floor(selisihHariTren / (1000 * 60 * 60 * 24)) + 1 : 1;
        const SISA_HARI_TREN = Math.max(TOTAL_HARI_TREN - HARI_KE_TREN + 1, 1);

        const targetHarianGaris = viewModeTab === "PETUGAS" 
            ? parseFloat(((totalOpenAktif / jumlahPetugasAktif) / SISA_HARI_TREN).toFixed(1))
            : parseFloat((totalOpenAktif / SISA_HARI_TREN).toFixed(1));

        return (
            <AreaChart data={chartTrenData} margin={{ left: -20, right: 10, bottom: 5, top: 15 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="label" stroke="#94a3b8" fontSize={9} tickLine={false} tick={{ fontWeight: 600 }} />
                <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} />
                
                <ReferenceLine 
                    y={targetHarianGaris} 
                    stroke="#ef4444" 
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    className="z-40"
                    label={{ 
                        value: `⚠️ TARGET MINIMAL: +${targetHarianGaris.toLocaleString('id-ID')} DOKUMEN / HARI`, 
                        position: 'insideLeftTop', 
                        offset: 10,
                        fill: '#b91c1c', 
                        fontSize: 10,
                        fontWeight: 900,
                        style: { 
                            textShadow: '2px 2px 0px #fff, -2px -2px 0px #fff, 2px -2px 0px #fff, -2px 2px 0px #fff',
                            letterSpacing: '0.5px'
                        }
                    }} 
                />

                <Tooltip 
                    shared={true}
                    wrapperStyle={{ pointerEvents: 'auto' }} 
                    content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                            const filteredPayload = hoveredTrend 
                                ? payload.filter(entry => entry.name === hoveredTrend)
                                : payload;

                            if (filteredPayload.length === 0) return null;

                            const sortedPayload = [...filteredPayload].sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0));

                            return (
                                <div className="bg-slate-900 text-white p-3 rounded-xl text-[11px] font-mono shadow-xl border border-slate-800 min-w-[220px] max-w-[280px] z-50 flex flex-col select-text">
                                    <div className="font-sans font-black border-b border-slate-700 pb-1.5 mb-2 text-slate-400 flex justify-between">
                                        <span>Tanggal: {payload[0].payload.tanggalRaw}</span>
                                    </div>
                                    <div className="max-h-48 overflow-y-auto scrollbar-thin pr-1.5 flex flex-col gap-1.5">
                                        {sortedPayload.map((entry, index) => (
                                            <div key={index} className="flex justify-between items-center gap-4">
                                                <span className="font-bold flex items-center gap-1.5 truncate max-w-[160px]" style={{ color: entry.color }}>
                                                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }}></span>
                                                    <span className="truncate uppercase">{entry.name}</span>
                                                </span>
                                                <strong className="text-white bg-slate-800 px-1.5 py-0.5 rounded flex-shrink-0 font-bold">
                                                    +{entry.value.toLocaleString('id-ID')}
                                                </strong>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        }
                        return null;
                    }}
                />

                <Legend content={() => null} />

                {trendKeys.map((keyName, index) => {
                    const palette = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#8b5cf6", "#ec4899", "#84cc16", "#f43f5e", "#3b82f6"];
                    const strokeColor = palette[index % palette.length];
                    const isHovered = hoveredTrend === keyName;
                    const isDimmed = hoveredTrend && !isHovered;
                    
                    return (
                        <Area 
                            key={keyName} 
                            type="linear" 
                            dataKey={keyName} 
                            stroke={strokeColor}
                            strokeWidth={isHovered ? 4 : 2} 
                            strokeOpacity={isDimmed ? 0.08 : 1}
                            fillOpacity={trendKeys.length > 1 ? 0 : isHovered ? 0.2 : 0.05} 
                            fill={strokeColor} 
                            style={{ transition: 'stroke-width 0.15s, stroke-opacity 0.15s' }}
                        >
                            <LabelList 
                                dataKey={keyName} 
                                content={<CustomLabelTren strokeColor={strokeColor} isDimmed={isDimmed} />} 
                            />
                        </Area>
                    );
                })}
            </AreaChart>
        );
    }, [chartTrenData, dataMonitoringWilayah.petugas, viewModeTab, selectedKecTab, trendKeys, hoveredTrend]);
    // ==========================================
    // 4. ACTION FUNCTIONS (Excel Handler dll)
    // ==========================================
// --- BLOCK REPLACEMENT: FUNGSI EXPORT EXCEL DENGAN TAMBAHAN KOLOM NAMA PENGAWAS ---
const handleDownloadSlsExcel = () => {
    const currentChartData = barChartData;
    
    if (!currentChartData || currentChartData.length === 0) {
        alert("Tidak ada data yang bisa diexport saat ini.");
        return;
    }

    const formattedData = currentChartData.map((item, index) => {
        const totalTargetMurni = item.total_target || item.t || 0;

        let approvedMurni = 0;
        let submittedMurni = 0;
        let draftMurni = 0;
        let rejectedMurni = 0;
        let revokedMurni = 0;
        let openMurni = 0;

        if (viewModeTab !== "PETUGAS" && viewModeTab !== "SLS") {
            approvedMurni  = totalTargetMurni > 0 ? Math.round((item.approved * totalTargetMurni) / 100) : 0;
            submittedMurni = totalTargetMurni > 0 ? Math.round((item.submitted * totalTargetMurni) / 100) : 0;
            draftMurni     = totalTargetMurni > 0 ? Math.round((item.draft * totalTargetMurni) / 100) : 0;
            rejectedMurni  = totalTargetMurni > 0 ? Math.round((item.rejected * totalTargetMurni) / 100) : 0;
            revokedMurni   = totalTargetMurni > 0 ? Math.round((item.revoked * totalTargetMurni) / 100) : 0;
            
            const totalRealisasiMurni = approvedMurni + submittedMurni + draftMurni + rejectedMurni + revokedMurni;
            openMurni      = totalTargetMurni - totalRealisasiMurni;
        } else {
            approvedMurni  = item.approved || 0;
            submittedMurni = item.submitted || 0;
            draftMurni     = item.draft || 0;
            rejectedMurni  = item.rejected || 0;
            revokedMurni   = item.revoked || 0;
            openMurni      = item.open || 0;
        }

        const totalRealisasi = totalTargetMurni - openMurni;
        const persentaseCapaian = totalTargetMurni > 0 
            ? parseFloat(((totalRealisasi / totalTargetMurni) * 100).toFixed(2)) 
            : 0.00;

        // 1. Susun baris utama Excel
        const row = {
            "No": index + 1,
            "Nama Wilayah / Petugas": item.nama_asli || item.nama,
        };

        // 2. 🌟 KUNCI UTAMA: Tambahkan Kolom Nama Pengawas jika sedang di Tab PETUGAS
        if (viewModeTab === "PETUGAS" && item.emailPml) {
            const emailClean = item.emailPml.toLowerCase().trim();
            row["Nama Pengawas"] = emailClean === "tanpa pengawas" 
                ? "Tanpa Pengawas" 
                : (staffLookup[emailClean] || item.emailPml);
        }

        if (viewModeTab === "SLS" && item.idsubsls) {
            row["ID Sub SLS"] = item.idsubsls;
        }

        if (item.namaKec) row["Kecamatan"] = item.namaKec;

        // 3. Masukkan data volume dokumen
        row["Approved PML"] = approvedMurni;
        row["Submitted"] = submittedMurni;
        row["Draft"] = draftMurni;
        row["Rejected"] = rejectedMurni;
        row["Revoked"] = revokedMurni;
        row["Open"] = openMurni;
        row["Total Target"] = totalTargetMurni;
        row["Total Realisasi"] = totalRealisasi;
        row["Persentase Capaian (%)"] = persentaseCapaian;

        return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(formattedData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Data Realisasi Lapangan");

    const namaWilayahFile = selectedKecTab === "SEMUA" ? "KAB_BOYOLALI" : `KEC_${selectedKecTab}`;
    const namaFileExcel = `VOLUME_PROGRESS_${viewModeTab}_${namaWilayahFile}_${new Date().toISOString().slice(0,10)}.xlsx`;

    XLSX.writeFile(workbook, namaFileExcel);
};

    // ==========================================
    // 5. GAURD CLAUSE LOADING RENDER
    // ==========================================
    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen text-slate-500 font-bold text-xs uppercase tracking-widest animate-pulse">
                MENYUSUN DATA LAPORAN KABUPATEN...
            </div>
        );
    }

    // ==========================================
    // 6. PREPARASI DATA RENDER UTAMA (POST-LOADING)
    // ==========================================
    const validPetugasData = dataMonitoringWilayah.petugas.filter(p => 
        p.email !== "Tanpa Petugas" && 
        p.total_target > 0 && 
        (selectedKecTab === "SEMUA" || p.kodeKec === selectedKecTab)
    );

    const limitPetugas = selectedKecTab === "SEMUA" ? 20 : 10;
    const topPerformers = validPetugasData.slice(0, limitPetugas);
    const bottomPerformers = [...validPetugasData]
        .sort((a, b) => a.total_realisasi - b.total_realisasi)
        .slice(0, limitPetugas);

    const dataPieStatus = [
        { name: "SUBMITTED BY Pencacah", value: dataMonitoringWilayah.muatanStatus.submitted, color: "#3b82f6" },
        { name: "DRAFT",                 value: dataMonitoringWilayah.muatanStatus.draft,     color: "#f97316" },
        { name: "REJECTED BY Pengawas",  value: dataMonitoringWilayah.muatanStatus.rejected,  color: "#ef4444" },
        { name: "REVOKED BY Pengawas",   value: dataMonitoringWilayah.muStatus || dataMonitoringWilayah.muatanStatus.revoked,   color: "#991b1b" },
        { name: "APPROVED BY Pengawas",  value: dataMonitoringWilayah.muatanStatus.approved,  color: "#10b981" },
        { name: "OPEN",                  value: dataMonitoringWilayah.muatanStatus.open,      color: "#e2e8f0" }
    ].filter(item => item.value > 0); 

    const totalSeluruhMuatan = dataPieStatus.reduce((sum, item) => sum + item.value, 0);

    const totalTanpaOpen = dataPieStatus
    .filter(item => item.name !== "OPEN")
    .reduce((sum, item) => sum + item.value, 0);

const persentaseTanpaOpen = totalSeluruhMuatan > 0 
    ? ((totalTanpaOpen / totalSeluruhMuatan) * 100).toFixed(1) 
    : "0.0";

    const itemsPerPage = 20;
    const totalPages = Math.ceil(lowPerformersList.length / itemsPerPage);
    const indexOfLastItem = modalCurrentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentModalItems = lowPerformersList.slice(indexOfFirstItem, indexOfLastItem);

    // ==========================================
    // 7. RENDER JSX UTAMA
    // ==========================================
    return (
        <div className="p-6 bg-slate-100 min-h-screen space-y-6 relative">
            
            {/* BARIS UTAMA FILTRASI KECAMATAN DROPDOWN */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full md:w-auto">
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
                                setViewModeTab("PETUGAS");
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

            {/* BARIS PANELS: INDIKATOR KPI */}
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

{/* GRID UTAMA CRITICAL MONITORING (KINI 5 KOLOM) */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                
                {/* 1. CARD PETUGAS TIDAK AKTIF */}
                <div 
                    onClick={() => {
                        if (criticalPcl.macet.length === 0) return;
                        
                        const tglHariIni = new Date();
                        const tglH1 = new Date(); tglH1.setDate(tglHariIni.getDate() - 1);
                        const tglH2 = new Date(); tglH2.setDate(tglHariIni.getDate() - 2);
                        const tglH3 = new Date(); tglH3.setDate(tglHariIni.getDate() - 3);
                        const tglH4 = new Date(); tglH4.setDate(tglHariIni.getDate() - 4);
                        
                        const strH1 = tglH1.toISOString().split('T')[0];
                        const strH2 = tglH2.toISOString().split('T')[0];
                        const strH3 = tglH3.toISOString().split('T')[0];
                        const strH4 = tglH4.toISOString().split('T')[0];

                        const listMacetMapped = dataMonitoringWilayah.petugas
                            .filter(p => criticalPcl.macet.includes(p.email))
                            .map(p => {
                                const pmlName = staffLookup[p.emailPml] || p.emailPml;
                                const emailClean = p.email.toLowerCase().trim();
                                
                                const logPetugasPaging = {};
                                historyData.forEach(h => {
                                    if (h.petugas_id?.toLowerCase().trim() === emailClean) {
                                        logPetugasPaging[h.tanggal] = (logPetugasPaging[h.tanggal] || 0) + (h.total_capaian || 0);
                                    }
                                });

                                const getDeltaGabungan = (targetDate, dateSebelumnya) => {
                                    if (logPetugasPaging[targetDate] === undefined) return 0;
                                    if (logPetugasPaging[dateSebelumnya] === undefined) return 0;
                                    return Math.max((logPetugasPaging[targetDate] || 0) - (logPetugasPaging[dateSebelumnya] || 0), 0);
                                };

                                return {
                                    nama: p.nama_asli,
                                    pengawas: pmlName === "tanpa pengawas" ? "Tanpa Pengawas" : pmlName,
                                    kecamatan: p.namaKec,
                                    totalRealisasi: p.total_realisasi,
                                    target: p.total_target,
                                    h1: getDeltaGabungan(strH1, strH2),
                                    h2: getDeltaGabungan(strH2, strH3),
                                    h3: getDeltaGabungan(strH3, strH4),
                                };
                            });

                        listMacetMapped.sort((a, b) => a.kecamatan.localeCompare(b.kecamatan));

                        setCriticalCurrentPage(1);
                        setCriticalModalConfig({
                            show: true,
                            type: "macet",
                            title: "⚠️ Daftar Petugas Tidak Aktif (3 hari tidak kirim assignment)",
                            data: listMacetMapped
                        });
                    }}
                    className={`bg-white border-l-4 border-rose-500 p-4 rounded-2xl shadow-xs transition-all duration-200 select-none ${criticalPcl.macet.length > 0 ? 'cursor-pointer hover:bg-rose-50/40 active:scale-[0.99]' : ''}`}
                >
                    <div className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Petugas Tidak Aktif (3 Hari)</div>
                    <div className="text-2xl font-mono font-black text-rose-600 mt-1 flex items-baseline gap-1">
                        {criticalPcl.macet.length} 
                        <span className="text-xs text-slate-400 font-sans font-bold">{criticalPcl.macet.length > 0 ? 'Orang' : 'Orang'}</span>
                    </div>
                    <p className="text-[8px] text-slate-400 mt-1 font-bold">Capaian stagnan / 0 kirim dokumen</p>
                </div>

                {/* 2. CARD PETUGAS MELAMBAT */}
                <div 
                    onClick={() => {
                        if (criticalPcl.melambat.length === 0) return;
                        
                        const tglHariIni = new Date();
                        const tglH1 = new Date(); tglH1.setDate(tglHariIni.getDate() - 1);
                        const tglH2 = new Date(); tglH2.setDate(tglHariIni.getDate() - 2);
                        const tglH3 = new Date(); tglH3.setDate(tglHariIni.getDate() - 3);
                        const tglH4 = new Date(); tglH4.setDate(tglHariIni.getDate() - 4);
                        
                        const strH1 = tglH1.toISOString().split('T')[0];
                        const strH2 = tglH2.toISOString().split('T')[0];
                        const strH3 = tglH3.toISOString().split('T')[0];
                        const strH4 = tglH4.toISOString().split('T')[0];

                        const listMelambatMapped = dataMonitoringWilayah.petugas
                            .filter(p => criticalPcl.melambat.includes(p.email))
                            .map(p => {
                                const pmlName = staffLookup[p.emailPml] || p.emailPml;
                                const emailClean = p.email.toLowerCase().trim();
                                
                                const logPetugasPaging = {};
                                historyData.forEach(h => {
                                    if (h.petugas_id?.toLowerCase().trim() === emailClean) {
                                        logPetugasPaging[h.tanggal] = (logPetugasPaging[h.tanggal] || 0) + (h.total_capaian || 0);
                                    }
                                });

                                const getDeltaGabungan = (targetDate, dateSebelumnya) => {
                                    if (logPetugasPaging[targetDate] === undefined) return 0;
                                    if (logPetugasPaging[dateSebelumnya] === undefined) return 0;
                                    return Math.max((logPetugasPaging[targetDate] || 0) - (logPetugasPaging[dateSebelumnya] || 0), 0);
                                };

                                return {
                                    nama: p.nama_asli,
                                    pengawas: pmlName === "tanpa pengawas" ? "Tanpa Pengawas" : pmlName,
                                    kecamatan: p.namaKec,
                                    totalRealisasi: p.total_realisasi,
                                    target: p.total_target,
                                    h1: getDeltaGabungan(strH1, strH2),
                                    h2: getDeltaGabungan(strH2, strH3),
                                    h3: getDeltaGabungan(strH3, strH4),
                                };
                            });

                        listMelambatMapped.sort((a, b) => a.kecamatan.localeCompare(b.kecamatan));

                        setCriticalCurrentPage(1);
                        setCriticalModalConfig({
                            show: true,
                            type: "melambat",
                            title: "⚠️ Daftar Petugas Melambat (Produktivitas Rendah < 10 Assignment)",
                            data: listMelambatMapped
                        });
                    }}
                    className={`bg-white border-l-4 border-amber-500 p-4 rounded-2xl shadow-xs transition-all duration-200 select-none ${criticalPcl.melambat.length > 0 ? 'cursor-pointer hover:bg-amber-50/40 active:scale-[0.99]' : ''}`}
                >
                    <div className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Petugas Melambat</div>
                    <div className="text-2xl font-mono font-black text-amber-600 mt-1 flex items-baseline gap-1">
                        {criticalPcl.melambat.length} 
                        <span className="text-xs text-slate-400 font-sans font-bold">{criticalPcl.melambat.length > 0 ? 'Orang' : 'Orang'}</span>
                    </div>
                    <p className="text-[8px] text-slate-400 mt-1 font-bold">Produktivitas 3 hari terakhir di bawah 10 dokumen</p>
                </div>

                {/* 🌟 3. CARD BARU: PENGAWAS (PML) BERMASALAH */}
                {(() => {
                    // Petakan jumlah kasus bermasalah per PML
                    const pmlMap = {} ;
                    
                    dataMonitoringWilayah.petugas.forEach(p => {
                        if(p.email === "Tanpa Petugas") return;
                        const pmlKey = p.emailPml || "tanpa pengawas";
                        
                        if(!pmlMap[pmlKey]) {
                            pmlMap[pmlKey] = {
                                emailPml: pmlKey,
                                namaPml: staffLookup[pmlKey] || (pmlKey === "tanpa pengawas" ? "Tanpa Pengawas" : pmlKey),
                                kecamatan: p.namaKec || "-",
                                jmlMacet: 0,
                                jmlMelambat: 0
                            };
                        }
                        
                        if(criticalPcl.macet.includes(p.email)) pmlMap[pmlKey].jmlMacet += 1;
                        if(criticalPcl.melambat.includes(p.email)) pmlMap[pmlKey].jmlMelambat += 1;
                    });

                    // Ubah ke array & filter yang hanya memiliki minimal 1 kasus masalah
                    const listPmlBermasalah = Object.values(pmlMap).filter(pml => pml.jmlMacet > 0 || pml.jmlMelambat > 0);
                    
                    // Urutkan berdasarkan total akumulasi terbanyak (Macet + Melambat)
                    listPmlBermasalah.sort((a, b) => (b.jmlMacet + b.jmlMelambat) - (a.jmlMacet + a.jmlMelambat));
                    const totalPmlBermasalah = listPmlBermasalah.length;

                    return (
                        <div
 onClick={() => {
                                if (totalPmlBermasalah === 0) return;
                                
                                const formatUntukModal = listPmlBermasalah.map(item => {
                                    // Pastikan properti emailPml terisi dan tidak undefined
                                    return {
                                        nama: item.namaPml,
                                        emailPml: item.emailPml, // <--- Pastikan ini terlempar ke dalam modal
                                        pengawas: "PENGONTROL WILAYAH", 
                                        kecamatan: item.kecamatan,
                                        h3: item.jmlMacet,      
                                        h2: item.jmlMelambat,   
                                        h1: item.jmlMacet + item.jmlMelambat, 
                                        totalRealisasi: item.jmlMacet + item.jmlMelambat,
                                        target: 0, 
                                        isModePml: true 
                                    };
                                });

                                setCriticalCurrentPage(1);
                                setCriticalModalConfig({
                                    show: true,
                                    type: "pml_critical",
                                    title: "🚨 Daftar Pengawas (PML) dengan Petugas Macet & Melambat Terbanyak",
                                    data: formatUntukModal
                                });
                            }}
                            className={`bg-white border-l-4 border-indigo-500 p-4 rounded-2xl shadow-xs transition-all duration-200 select-none ${totalPmlBermasalah > 0 ? 'cursor-pointer hover:bg-indigo-50/40 active:scale-[0.99]' : ''}`}
                        >
                            <div className="text-[9px] font-black uppercase text-slate-400 tracking-wider">TIM Perlu Atensi</div>
                            <div className="text-2xl font-mono font-black text-indigo-600 mt-1 flex items-baseline gap-1">
                                {totalPmlBermasalah}
                                <span className="text-xs text-slate-400 font-sans font-bold">{totalPmlBermasalah > 0 ? 'Tim PML' : 'Tim PML'}</span>
                            </div>
                            <p className="text-[8px] text-slate-400 mt-1 font-bold">Tim yang memiliki beban petugas macet / melambat</p>
                        </div>
                    );
                })()}

                {/* 4. CARD SUBMITTED / PROSES */}
                <div className="bg-white border-l-4 border-blue-500 p-4 rounded-2xl shadow-xs">
                    <div className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Perlu di Review (Submitted/Proses)</div>
                    <div className="text-2xl font-mono font-black text-blue-600 mt-1">
                        {(dataMonitoringWilayah.muatanStatus.submitted + dataMonitoringWilayah.muatanStatus.draft + dataMonitoringWilayah.muatanStatus.rejected + dataMonitoringWilayah.muatanStatus.revoked).toLocaleString('id-ID')} <span className="text-xs text-slate-400 font-sans font-bold">Dok</span>
                    </div>
                    <p className="text-[8px] text-slate-400 mt-1 font-bold">Status Draft / Submitted / Rejected / Revoked</p>
                </div>
                
                {/* 5. CARD APPROVE PENGAWAS */}
                <div className="bg-white border-l-4 border-emerald-500 p-4 rounded-2xl shadow-xs">
                    <div className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Approve Pengawas</div>
                    <div className="text-2xl font-mono font-black text-emerald-600 mt-1">
                        {dataMonitoringWilayah.muatanStatus.approved.toLocaleString('id-ID')} <span className="text-xs text-slate-400 font-sans font-bold">Dok</span>
                    </div>
                    <p className="text-[8px] text-slate-400 mt-1 font-bold">Assignment yang telah diapprove pengawas</p>
                </div>
            </div>

{/* BARIS GRAPH UTAMA: GRAFIK BATANG & REKAP BULAT */}
<div className="bg-white p-5 border border-slate-200 rounded-3xl shadow-sm">
    {/* Perbaikan di Baris Ini: Tambahkan items-center dan min-h-[40px] agar tinggi header konsisten */}
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 min-h-[40px]">
        <div>
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                {selectedPetugasEmail 
                    ? `Capaian Lapangan Petugas: ${selectedPetugas} - Per SLS`
                    : selectedPml !== "SEMUA"
                        ? `Capaian Tim Pengawas: ${staffLookup[selectedPml] || selectedPml} (Per Petugas)`
                        : selectedKecTab === "SEMUA"
                            ? "Capaian Realisasi Lapangan Kabupaten (Per Kecamatan)"
                            : `Capaian Realisasi Lapangan Kec. ${namaKecamatanTerpilihText} (${viewModeTab === "DESA" ? "Per Desa" : "Per Petugas"})`}
            </h3>
        </div>
        
        {/* 🌟 PERBAIKAN UTAMA: Bungkus kontainer tombol dengan tinggi fixed (h-9) */}
        <div className="flex items-center gap-3 self-end sm:self-auto h-9">
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
                                setViewModeTab("PETUGAS"); // Sesuai perubahan sebelumnya langsung ke petugas
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

{/* AREA UTAMA LEGENDA WARNA GLOBAL STATUS ASSIGNMENT */}
<div className="flex flex-col lg:flex-row lg:items-center justify-between gap-x-6 gap-y-3 bg-slate-50 border border-slate-100 p-3 rounded-2xl mb-6 text-[10px]">
    
    {/* SISI KIRI: Legenda Status Bar Chart (Bawaan Anda) */}
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider mr-1">Legenda Status:</span>
        {dataMonitoringWilayah && susunanBarStatus.map((b) => {
            const totalKategori = dataPieStatus.find(item => item.name === b.label)?.value || 0;
            const persenKategori = totalSeluruhMuatan > 0 ? ((totalKategori / totalSeluruhMuatan) * 100).toFixed(2) : "0.00";
            return (
                <div key={b.key} className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-xl border border-slate-200/60 shadow-2xs text-[10px]">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: b.fill }}></span>
                    <span className="font-bold text-slate-500 uppercase text-[9px]">
                        {b.label.toUpperCase()
                            .replace(" BY PENCACAH", "")
                            .replace(" BY PENGAWAS", "")
                            .replace("SUBMITTED ", "")
                        }
                    </span>
                    <span className="font-mono font-black text-slate-800 border-l border-slate-200 pl-1.5 ml-0.5">
                        {totalKategori.toLocaleString('id-ID')} <span className="text-[9px] font-sans font-bold text-slate-600 ml-0.5">({persenKategori}%)</span>
                    </span>
                </div>
            );
        })}
    </div>

    {/* 🌟 SISI KANAN: Indikator Sumbu X dengan Kontras Tinggi (Solid Badge & Blink) */}
    {viewModeTab === "PETUGAS" && (
        <div className="flex flex-wrap items-center gap-2 text-[9px] font-black uppercase tracking-wider border-t pt-2 w-full lg:w-auto lg:border-t-0 lg:pt-0 lg:border-l lg:border-slate-200 lg:pl-4 animate-fade-in">
            <span className="text-slate-400 mr-1">Status Nama:</span>
            
            {/* AMAN */}
            <div className="flex items-center gap-1 bg-slate-200 text-slate-700 px-2 py-0.5 rounded-md font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                <span>Sesuai Target</span>
            </div>
            
            {/* DI BAWAH TARGET */}
            <div className="flex items-center gap-1 bg-orange-100 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-md font-black">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse"></span>
                <span>&lt; Target</span>
            </div>
            
            {/* KRITIS */}
            <div className="flex items-center gap-1 bg-red-600 text-white px-2 py-0.5 rounded-md font-black shadow-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping absolute opacity-75"></span>
                <span className="w-1.5 h-1.5 rounded-full bg-white relative"></span>
                <span>&lt; 50%</span>
            </div>
        </div>
    )}
</div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
                    <div className="lg:col-span-3 w-full overflow-x-auto overflow-y-hidden scrollbar-thin">
                        <div className="h-[420px] w-full min-w-[500px] md:min-w-0">
                            <ResponsiveContainer width="100%" height="100%">
                                {memoizedBarChartElement}
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* REKAP KANAN: DIAGRAM LINGKARAN & INDIKATOR TARGET SLS WILAYAH */}
                    <div className="lg:col-span-1 space-y-4 border-l border-slate-100 pl-2 lg:pl-4 flex flex-col justify-between h-full">
                        <div>
                            <div className="text-[10px] font-black text-slate-400 tracking-widest text-center lg:text-left uppercase">Status Assignment</div>
                            
                            {/* Kontainer Pie Chart */}
                            <div className="h-44 w-full relative mt-2">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart margin={{ top: 0, right: 0, bottom: 5, left: 0 }}>
                                        <Pie
                                            data={dataPieStatus}
                                            cx="50%" cy="45%" innerRadius={45} outerRadius={58} paddingAngle={2} dataKey="value" stroke="none"
                                        >
                                            {dataPieStatus.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                            ))}
                                        </Pie>
                                        
                                        {/* HANYA PERSENTASE DI TENGAH PIE */}
                                        <text x="50%" y="42%" textAnchor="middle" dominantBaseline="middle" className="fill-indigo-600 font-mono font-black text-[15px]">
                                            {persentaseTanpaOpen}%
                                        </text>
                                        <text x="50%" y="54%" textAnchor="middle" dominantBaseline="middle" className="fill-slate-400 font-sans font-bold text-[8px] uppercase tracking-wider">
                                            REALISASI
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

                            {/* TOTAL MUATAN DI BAWAH PIE CHART */}
                            <div className="mt-2 flex items-center justify-between bg-slate-900 border border-slate-950 px-3 py-2.5 rounded-xl">
                                <span className="font-black text-white text-[10px] uppercase tracking-wider flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse"></span>
                                    Total Assignment
                                </span>
                                <span className="font-mono font-black text-[13px] text-white bg-slate-800 px-2.5 py-0.5 rounded-md border border-slate-700/60 shadow-inner">
                                    {totalSeluruhMuatan.toLocaleString('id-ID')}
                                </span>
                            </div>
                        </div>

                        {/* KELOMPOK STATUS PROGRES WILAYAH SLS */}
                        <div className="space-y-2 border-t border-slate-100 pt-4">
                            <div className="text-[10px] font-black text-slate-400 tracking-widest text-center lg:text-left uppercase mb-1">Status Progres Wilayah SLS</div>
                            {[
                                { label: 'SLS Selesai Didata', count: dataMonitoringWilayah.statusSls.selesai, color: 'bg-emerald-500' },
                                { label: 'SLS Sedang Didata', count: dataMonitoringWilayah.statusSls.sedang, color: 'bg-indigo-500' },
                                { label: 'SLS Belum Mulai', count: dataMonitoringWilayah.statusSls.belum, color: 'bg-slate-300' }
                            ].map((item) => {
                                const totalSls = dataMonitoringWilayah.statusSls.total || 1;
                                const persenSls = ((item.count / totalSls) * 100).toFixed(1);
                                return (
                                    <div key={item.label} className="flex items-center justify-between bg-slate-50/70 px-3 py-2 rounded-xl border border-slate-100 text-[10px]">
                                        <span className="font-bold text-slate-500 uppercase flex items-center gap-1.5">
                                            <span className={`w-1.5 h-1.5 rounded-full ${item.color}`}></span>
                                            {item.label}
                                        </span>
                                        <span className="font-mono font-black text-slate-700">
                                            {item.count} <span className="text-[9px] font-sans text-slate-400 font-normal">SLS ({persenSls}%)</span>
                                        </span>
                                    </div>
                                );
                            })}
                            <button 
                                onClick={handleDownloadSlsExcel} 
                                className="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white py-2 rounded-xl text-[10px] font-black uppercase tracking-wider shadow-md transition-all duration-150 mt-3 flex items-center justify-center gap-1.5"
                                title="Unduh data volume realisasi saat ini dalam bentuk berkas Excel"
                            >
                                <span>📥</span> Export Data Realisasi
                            </button>
                        </div>
                    </div>
                </div>
            </div>

{/* DIAGRAM TREN TIME-SERIES */}
{/* DIAGRAM TREN TIME-SERIES DENGAN PREDICTIVE KPI */}
<div className="bg-white p-5 border border-slate-200 rounded-3xl shadow-sm">
                
                {/* HEADLINE BOX DENGAN BADGE PREDIKSI MINIMALIS */}
                <div className="mb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
                    <div>
                        <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                            📈 Grafik Penambahan Kirim Assignment per Hari (2 Minggu Terakhir)
                        </h4>
                        <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">
                            Wilayah: {selectedKecTab === "SEMUA" ? "Satu Kabupaten Boyolali" : selectedPetugasEmail ? `PCL ${selectedPetugas}` : selectedDesaCode ? `Desa ${selectedDesaName}` : `Kecamatan ${namaKecamatanTerpilihText}`}
                        </p>
                    </div>

                    {/* 🔮 INDIKATOR PREDIKSI ESTIMASI (CLEAN & INTEGRATED STYLE) */}
                    <div className="flex flex-col sm:items-end justify-center select-none">
                        <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wide">
                            {/* Titik Status Berkedip (Pulse) */}
                            <span className="relative flex h-2 w-2">
                                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${metrikEstimasiProyek.isTerlambat ? 'bg-rose-500' : 'bg-emerald-500'}`}></span>
                                <span className={`relative inline-flex rounded-full h-2 w-2 ${metrikEstimasiProyek.isTerlambat ? 'bg-rose-500' : 'bg-emerald-500'}`}></span>
                            </span>
                            <span className={metrikEstimasiProyek.isTerlambat ? 'text-rose-600' : 'text-emerald-600'}>
                                Perkiraan Selesai: {metrikEstimasiProyek.tanggalPrediksi}
                            </span>
                        </div>
                        
                        <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">
                            {metrikEstimasiProyek.isTerlambat ? (
                                <span className="text-rose-500/90">⚠️ Terancam Mundur ±{metrikEstimasiProyek.selisihDariDeadline} Hari Dari Target</span>
                            ) : (
                                <span className="text-slate-400">Status Aman ({metrikEstimasiProyek.sisaHariDibutuhkan} Hari Kerja Tersisa)</span>
                            )}
                        </p>
                        
                        <div className="text-[9px] text-slate-400/80 font-mono mt-0.5">
                            Laju Riil: +{metrikEstimasiProyek.rataKirimHarian.toLocaleString('id-ID')} dok/hari | Sisa: {metrikEstimasiProyek.totalSisaOpenAktif.toLocaleString('id-ID')} dok
                        </div>
                    </div>
                </div>

                {/* AREA GRAFIK DAN LEGENDA */}
                <div className="flex flex-col lg:flex-row gap-4 h-64 w-full">
                    
                    {/* Area Grafik (Kiri) */}
                    <div className="flex-1 h-full">
                        <ResponsiveContainer width="100%" height="100%">
                            {memoizedAreaChartElement}
                        </ResponsiveContainer>
                    </div>

                    {/* Custom Legend Kanan */}
                    {trendKeys.length > 1 && (
                        <div className="w-full lg:w-64 h-full border border-slate-100 bg-slate-50/50 rounded-2xl p-3 flex flex-col justify-start">
                            <div className="text-[9px] font-black uppercase text-slate-400 tracking-wider mb-2 border-b border-slate-200/60 pb-1 flex justify-between items-center">
                                <span>Petugas ({trendKeys.length}) | H+ Terakhir</span>
                                {hoveredTrend && (
                                    <button onClick={() => setHoveredTrend(null)} className="text-indigo-600 hover:underline lowercase font-normal">[reset]</button>
                                )}
                            </div>
                            <div className="flex-1 overflow-y-auto scrollbar-thin space-y-1 pr-1 max-h-[190px] lg:max-h-none">
                                {[...trendKeys].sort((a, b) => a.localeCompare(b)).map((keyName) => {
                                    const originalIndex = trendKeys.indexOf(keyName);
                                    const palette = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#8b5cf6", "#ec4899", "#84cc16", "#f43f5e", "#3b82f6"];
                                    const color = palette[originalIndex % palette.length];
                                    const isFocused = hoveredTrend === keyName;
                                    const isDimmed = hoveredTrend && !isFocused;
                                    const dataHariTerakhir = chartTrenData.length > 0 ? chartTrenData[chartTrenData.length - 1] : {};
                                    const penambahanTerakhir = dataHariTerakhir[keyName] || 0;

                                    return (
                                        <div 
                                            key={keyName}
                                            onClick={() => setHoveredTrend(isFocused ? null : keyName)}
                                            className={`flex items-center justify-between px-2 py-1.5 rounded-xl cursor-pointer transition-all duration-150 select-none ${
                                                isFocused ? 'bg-slate-900 text-white shadow-sm scale-[1.02]' : isDimmed ? 'opacity-25 grayscale scale-[0.98]' : 'bg-white border border-slate-100 text-slate-700 hover:bg-slate-100 hover:scale-[1.01]'
                                            }`}
                                        >
                                            <div className="flex items-center gap-1.5 truncate mr-2">
                                                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }}></span>
                                                <span className="text-[10px] font-black uppercase tracking-wide truncate" title={keyName}>{keyName}</span>
                                            </div>
                                            <div className="flex-shrink-0 font-mono text-[10px] font-bold">
                                                {isFocused ? <span className="text-indigo-400 text-[9px] font-sans">● Fokus</span> : <span className={penambahanTerakhir > 0 ? "text-emerald-600" : "text-slate-400"}>(+{penambahanTerakhir.toLocaleString('id-ID')})</span>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* TABEL TOP & BOTTOM PCL */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
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

            {/* MODAL DRILL-DOWN */}
            {showKpiModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-[100] p-4 animate-fade-in">
                    <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden transform transition-all duration-300 scale-100">
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

            {/* MODAL DRILL-DOWN BARU: DETAIL PETUGAS CRITICAL (MACET/MELAMBAT) */}
{criticalModalConfig.show && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-[110] p-4 animate-fade-in">
                    <div className="bg-white w-full max-w-5xl rounded-3xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden transform transition-all duration-300 scale-100">
                        
                        <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50">
                            <div>
                                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                                    {criticalModalConfig.title}
                                </h3>
                                <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">
                                    {criticalModalConfig.type === "pml_critical" 
                                        ? "Menampilkan pengawas (PML) yang memiliki jumlah petugas macet & melambat terbanyak"
                                        : "Menampilkan rekam pengiriman assignment harian petugas dalam 3 hari terakhir (H-1 s.d H-3)"}
                                </p>
                            </div>
                            {/* Tombol Back / Tutup yang adaptif */}
                            <button 
                                onClick={() => {
                                    // Jika sedang di dalam detail PCL milik PML, klik tombol ini akan mengembalikan ke list PML utama
                                    if (criticalModalConfig.type === "detil_pml_pcl") {
                                        // Trigger ulang klik card PML otomatis untuk me-recreate data map PML awal
                                        const pmlCardElement = document.querySelector('[class*="border-indigo-500"]');
                                        if (pmlCardElement) pmlCardElement.click();
                                    } else {
                                        setCriticalModalConfig({ show: false, type: "", title: "", data: [] });
                                    }
                                }}
                                className="bg-slate-200 hover:bg-slate-300 text-slate-600 font-black text-xs px-2.5 py-1.5 rounded-xl transition-all uppercase tracking-wide"
                            >
                                {criticalModalConfig.type === "detil_pml_pcl" ? "◀ Kembali" : "✕ Tutup"}
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
                            <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                                <table className="w-full text-left border-collapse min-w-[800px]">
                                    <thead>
                                        <tr className="bg-slate-800 text-white text-[9px] font-black uppercase tracking-wider border-b border-slate-700">
                                            <th className="p-3 text-center w-12 sticky top-0 bg-slate-800">No</th>
                                            {/* 🌟 PERBAIKAN HEADER: Pisahkan pml_critical secara absolut */}
                                            {criticalModalConfig.type === "pml_critical" ? (
                                                <>
                                                    <th className="p-3 sticky top-0 bg-slate-800">Nama Pengawas (PML)</th>
                                                    <th className="p-3 sticky top-0 bg-slate-800">Role Jabatan</th>
                                                    <th className="p-3 sticky top-0 bg-slate-800">Kecamatan</th>
                                                    <th className="p-3 text-center bg-rose-900 text-rose-100 sticky top-0 font-bold">Petugas Macet (0 Kirim)</th>
                                                    <th className="p-3 text-center bg-amber-900 text-amber-100 sticky top-0 font-bold">Petugas Melambat</th>
                                                    <th className="p-3 text-center bg-indigo-900 text-indigo-100 sticky top-0 font-bold">Total Petugas</th>
                                                    <th className="p-3 text-right pr-6 sticky top-0 bg-slate-800">Lihat Petugas</th>
                                                </>
                                            ) : (
                                                <>
                                                    <th className="p-3 sticky top-0 bg-slate-800">Nama Petugas (PCL)</th>
                                                    <th className="p-3 sticky top-0 bg-slate-800">Pengawas (PML)</th>
                                                    <th className="p-3 sticky top-0 bg-slate-800">Kecamatan</th>
                                                    <th className="p-3 text-center bg-amber-900 text-amber-200 sticky top-0 font-bold">H-3 (3 Hari Lalu)</th>
                                                    <th className="p-3 text-center bg-amber-800 text-amber-100 sticky top-0 font-bold">H-2 (2 Hari Lalu)</th>
                                                    <th className="p-3 text-center bg-amber-700 text-amber-50 sticky top-0 font-bold">H-1 (Kemarin)</th>
                                                    <th className="p-3 text-right pr-6 sticky top-0 bg-slate-800">Total Progress</th>
                                                </>
                                            )}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200 text-[11px] font-medium text-slate-600 bg-white">
                                        {(() => {
                                            const cItemsPerPage = 15;
                                            const cIdxLast = criticalCurrentPage * cItemsPerPage;
                                            const cIdxFirst = cIdxLast - cItemsPerPage;
                                            const pagedData = criticalModalConfig.data.slice(cIdxFirst, cIdxLast);

                                            if (pagedData.length === 0) {
                                                return (
                                                    <tr>
                                                        <td colSpan="8" className="p-8 text-center text-slate-400 font-bold uppercase tracking-wide">
                                                            Tidak ada data di kategori ini.
                                                        </td>
                                                    </tr>
                                                );
                                            }

                                            const isPmlMode = criticalModalConfig.type === "pml_critical";

                                            return pagedData.map((item, idx) => {
if (isPmlMode) {
                                                    return (
                                                        <tr 
                                                            key={idx} 
                                                            onClick={() => {

                                                                const emailPmlTerpilih = (item.emailPml || item.email || "").toLowerCase().trim();
  

                                                                const tglHariIni = new Date();
                                                                const tglH1 = new Date(); tglH1.setDate(tglHariIni.getDate() - 1);
                                                                const tglH2 = new Date(); tglH2.setDate(tglHariIni.getDate() - 2);
                                                                const tglH3 = new Date(); tglH3.setDate(tglHariIni.getDate() - 3);
                                                                const tglH4 = new Date(); tglH4.setDate(tglHariIni.getDate() - 4);
                                                                
                                                                const strH1 = tglH1.toISOString().split('T')[0];
                                                                const strH2 = tglH2.toISOString().split('T')[0];
                                                                const strH3 = tglH3.toISOString().split('T')[0];
                                                                const strH4 = tglH4.toISOString().split('T')[0];

                                                                // 🪵 LOG 4: Cek total master data petugas yang tersedia di dashboard saat ini

                                                                const petugasBermasalahPmlIni = dataMonitoringWilayah.petugas
                                                                    .filter(p => {
                                                                        const pmlPetugasClean = (p.emailPml || "").toLowerCase().trim();
                                                                        const isAnggotaPmlIni = pmlPetugasClean === emailPmlTerpilih;
                                                                        const isBermasalah = criticalPcl.macet.includes(p.email) || criticalPcl.melambat.includes(p.email);
                                                                        
                                                                        return isAnggotaPmlIni && isBermasalah;
                                                                    })
                                                                    .map(p => {
                                                                        const emailClean = p.email.toLowerCase().trim();
                                                                        const logPetugasPaging = {};
                                                                        
                                                                        historyData.forEach(h => {
                                                                            if (h.petugas_id?.toLowerCase().trim() === emailClean) {
                                                                                logPetugasPaging[h.tanggal] = (logPetugasPaging[h.tanggal] || 0) + (h.total_capaian || 0);
                                                                            }
                                                                        });

                                                                        const getDeltaGabungan = (targetDate, dateSebelumnya) => {
                                                                            if (logPetugasPaging[targetDate] === undefined || logPetugasPaging[dateSebelumnya] === undefined) return 0;
                                                                            return Math.max((logPetugasPaging[targetDate] || 0) - (logPetugasPaging[dateSebelumnya] || 0), 0);
                                                                        };

                                                                        return {
                                                                            nama: p.nama_asli,
                                                                            pengawas: item.nama,
                                                                            kecamatan: p.namaKec,
                                                                            totalRealisasi: p.total_realisasi,
                                                                            target: p.total_target,
                                                                            h1: getDeltaGabungan(strH1, strH2),
                                                                            h2: getDeltaGabungan(strH2, strH3),
                                                                            h3: getDeltaGabungan(strH3, strH4),
                                                                        };
                                                                    });


                                                                setCriticalCurrentPage(1);
                                                                setCriticalModalConfig({
                                                                    show: true,
                                                                    type: "detil_pml_pcl",
                                                                    title: `🔍 Daftar Petugas Bermasalah di Bawah Pengawas: ${item.nama}`,
                                                                    data: petugasBermasalahPmlIni
                                                                });
                                                            }}
                                                            className="hover:bg-indigo-50/50 cursor-pointer transition-colors odd:bg-white even:bg-slate-50/20 group"
                                                        >
                                                            {/* Konten td bawaan Anda... */}
                                                            <td className="p-3 text-center font-mono font-bold text-slate-400 group-hover:text-indigo-600">{cIdxFirst + idx + 1}</td>
                                                            <td className="p-3 font-black text-slate-800 uppercase text-indigo-950 group-hover:text-indigo-600">{item.nama} <span className="text-[9px] text-slate-400 font-normal lowercase opacity-0 group-hover:opacity-100 transition-opacity ml-1">(klik detail)</span></td>
                                                            <td className="p-3 text-slate-400 font-bold uppercase tracking-wider text-[10px]">PML Pengawas</td>
                                                            <td className="p-3 font-bold text-slate-500">{item.kecamatan}</td>
                                                            <td className={`p-3 text-center font-mono font-black ${item.h3 > 0 ? 'bg-rose-100 text-rose-700 border border-rose-200' : 'bg-slate-50/50 text-slate-400'}`}>{item.h3} Petugas</td>
                                                            <td className={`p-3 text-center font-mono font-black ${item.h2 > 0 ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-slate-50/50 text-slate-400'}`}>{item.h2} Petugas</td>
                                                            <td className="p-3 text-center font-mono font-black bg-indigo-50 text-indigo-700 group-hover:bg-indigo-100">{item.h1} Petugas</td>
                                                            <td className="p-3 text-right pr-6">
                                                                <span className="inline-block bg-indigo-600 text-white font-sans text-[9px] font-black uppercase px-2 py-0.5 rounded-md tracking-wider group-hover:bg-indigo-700">👁️ Lihat</span>
                                                            </td>
                                                        </tr>
                                                    );
                                                }

                                                const totalPersen = item.target > 0 ? Math.round((item.totalRealisasi / item.target) * 100) : 0;
                                                const getCellClassName = (val) => {
                                                    return val === 0 || val === "0"
                                                        ? "p-3 text-center font-mono bg-rose-100 text-rose-700 font-black border border-rose-200"
                                                        : "p-3 text-center font-mono font-bold bg-slate-50/50 text-slate-700";
                                                };

                                                return (
                                                    <tr key={idx} className="hover:bg-slate-50 transition-colors odd:bg-white even:bg-slate-50/20">
                                                        <td className="p-3 text-center font-mono font-bold text-slate-400">{cIdxFirst + idx + 1}</td>
                                                        <td className="p-3 font-black text-slate-800 uppercase">{item.nama}</td>
                                                        <td className="p-3 text-slate-500 font-semibold">{item.pengawas}</td>
                                                        <td className="p-3 font-bold text-slate-500">{item.kecamatan}</td>
                                                        <td className={getCellClassName(item.h3)}>{item.h3 > 0 ? `+${item.h3}` : '0'}</td>
                                                        <td className={getCellClassName(item.h2)}>{item.h2 > 0 ? `+${item.h2}` : '0'}</td>
                                                        <td className={getCellClassName(item.h1)}>{item.h1 > 0 ? `+${item.h1}` : '0'}</td>
                                                        <td className="p-3 text-right pr-6">
                                                            <div className="font-mono font-black text-slate-800">{item.totalRealisasi} / {item.target} <span className="text-[9px] font-sans font-normal text-slate-400">Dok</span></div>
                                                            <div className="text-[9px] font-bold text-indigo-600 mt-0.5">{totalPersen}% Telah Terisi</div>
                                                        </td>
                                                    </tr>
                                                );
                                            });
                                        })()}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* 🌟 FIX PERBAIKAN PADA FOOTER PAGINATION */}
                        <div className="p-4 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-3 bg-slate-50">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                                Menampilkan <span className="font-mono text-slate-700">{criticalModalConfig.data.length > 0 ? ((criticalCurrentPage - 1) * 15) + 1 : 0}</span> - <span className="font-mono text-slate-700">{Math.min(criticalCurrentPage * 15, criticalModalConfig.data.length)}</span> dari <span className="font-mono text-indigo-600">{criticalModalConfig.data.length}</span> {criticalModalConfig.type === "pml_critical" ? "Pengawas" : "Petugas"} Terdeteksi
                            </div>
                            
                            {Math.ceil(criticalModalConfig.data.length / 15) > 1 && (
                                <div className="flex items-center gap-1.5">
                                    <button 
                                        disabled={criticalCurrentPage === 1}
                                        onClick={() => setCriticalCurrentPage(prev => Math.max(prev - 1, 1))}
                                        className="bg-white border border-slate-200 text-slate-700 px-3 py-1.5 rounded-xl font-black text-[9px] uppercase tracking-wider shadow-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 transition-all"
                                    >
                                        ◀ Prev
                                    </button>
                                    <div className="bg-white border border-slate-200 px-3 py-1.5 rounded-xl text-[10px] font-mono font-black text-slate-700 min-w-[70px] text-center">
                                        {criticalCurrentPage} / {Math.ceil(criticalModalConfig.data.length / 15)}
                                    </div>
                                    <button 
                                        disabled={criticalCurrentPage === Math.ceil(criticalModalConfig.data.length / 15)}
                                        onClick={() => setCriticalCurrentPage(prev => Math.min(prev + 1, Math.ceil(criticalModalConfig.data.length / 15)))}
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