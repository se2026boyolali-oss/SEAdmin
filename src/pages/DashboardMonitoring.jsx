import React, { useState, useEffect, useMemo, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, PieChart, Pie, Cell, AreaChart, Area, Legend, ReferenceLine, ReferenceArea, Customized, ComposedChart, Line } from 'recharts';
import { supabase } from '../supabaseClient';
import * as XLSX from 'xlsx';
import { useAuth } from '../context/AuthContext';
import Dexie from 'dexie';
// Komponen dipisah ke luar agar tidak di-recreate oleh React setiap kali hover
// ==========================================
// 1. TAMBAHKAN KOMPONEN INI DI PALING ATAS FILE DASBOR ANDA
// ==========================================
// ==========================================
// MODIFIKASI: BANNER SEKARANG MEMBACA DARI SUPABASE
// ==========================================

function SmartAlertBanner() {
    const [infos, setInfos] = React.useState([]);
    const [currentIndex, setCurrentIndex] = React.useState(0);
    const [isVisible, setIsVisible] = React.useState(true);
    const [fetching, setFetching] = React.useState(true); // State loading khusus banner

    React.useEffect(() => {
        async function fetchAnnouncements() {
            try {
                setFetching(true);
                // Mengambil pengumuman yang berstatus aktif (is_active = true) 
                // dan diurutkan dari yang terbaru (id descending)
                const { data, error } = await supabase
                    .from('announcements')
                    .select('id, message, type')
                    .eq('is_active', true)
                    .order('id', { ascending: false });

                if (error) throw error;
                setInfos(data || []);
            } catch (err) {
                console.error("Gagal mengambil data pengumuman Supabase:", err.message);
            } finally {
                setFetching(false);
            }
        }

        fetchAnnouncements();
    }, []);

    // Jika masih loading, atau banner di-close, atau tidak ada pengumuman aktif, jangan tampilkan apa-apa
    if (fetching || !isVisible || infos.length === 0) return null;

    const currentInfo = infos[currentIndex];

    // Mapping warna tajam dan efek glow sesuai tipe dari database
    const themeMap = {
        info: {
            bg: "bg-blue-50/95 border-l-8 border-blue-600 text-blue-950 shadow-[0_0_15px_rgba(37,99,235,0.15)]",
            badge: "bg-blue-600 text-white",
            dot: "bg-blue-500"
        },
        warning: {
            bg: "bg-amber-50/95 border-l-8 border-amber-500 text-amber-950 shadow-[0_0_15px_rgba(245,158,11,0.2)]",
            badge: "bg-amber-500 text-white",
            dot: "bg-amber-500"
        },
        success: {
            bg: "bg-emerald-50/95 border-l-8 border-emerald-600 text-emerald-950 shadow-[0_0_15px_rgba(16,185,129,0.15)]",
            badge: "bg-emerald-600 text-white",
            dot: "bg-emerald-500"
        }
    };
    const currentTheme = themeMap[currentInfo.type] || themeMap.info;

    return (
        <div className={`mb-6 p-4 rounded-r-2xl rounded-l-md border border-slate-200/60 flex items-center justify-between gap-4 backdrop-blur-xs transition-all duration-300 relative overflow-hidden ${currentTheme.bg}`}>

            <div className="flex items-center gap-3.5 w-full">
                {/* Live Dot Indicator (Sinyal Berkedip) */}
                <span className="relative flex h-2.5 w-2.5 shrink-0 ml-1">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${currentTheme.dot}`}></span>
                    <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${currentTheme.dot}`}></span>
                </span>

                {/* Badge Penanda Kategori Pengumuman */}
                <span className={`text-[9px] font-black tracking-widest px-2 py-0.5 rounded uppercase font-sans shrink-0 ${currentTheme.badge}`}>
                    {currentInfo.type === 'warning' ? 'PENTING' : currentInfo.type === 'success' ? 'SUKSES' : 'INFO BARU'}
                </span>

                {/* Isi Teks dari Supabase */}
                <div className="text-xs sm:text-sm font-bold tracking-wide leading-relaxed">
                    {currentInfo.message}
                </div>
            </div>

            {/* Sisi Kanan: Kontrol Navigasi Halaman Pengumuman (Jika Info > 1) */}
            <div className="flex items-center gap-3 shrink-0 select-none">
                {infos.length > 1 && (
                    <div className="flex items-center gap-1.5 text-[10px] font-black bg-white border border-slate-200 px-2 py-1 rounded-xl text-slate-700 shadow-2xs">
                        <button onClick={() => setCurrentIndex((prev) => (prev - 1 + infos.length) % infos.length)} className="hover:text-indigo-600 px-1 transition">◀</button>
                        <span className="font-mono text-slate-400">{currentIndex + 1}/{infos.length}</span>
                        <button onClick={() => setCurrentIndex((prev) => (prev + 1) % infos.length)} className="hover:text-indigo-600 px-1 transition">▶</button>
                    </div>
                )}

                {/* Tombol Tutup Banner */}
                <button onClick={() => setIsVisible(false)} className="p-1 rounded-xl hover:bg-slate-200/60 text-slate-400 hover:text-slate-700 transition">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </div>
        </div>
    );
}
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
    { key: "draft", label: "DRAFT", fill: "#f97316", radius: undefined },
    { key: "rejected", label: "REJECTED BY Pengawas", fill: "#ef4444", radius: undefined },
    { key: "revoked", label: "REVOKED BY Pengawas", fill: "#991b1b", radius: undefined },
    { key: "approved", label: "APPROVED BY Pengawas", fill: "#10b981", radius: undefined },
    { key: "edited", label: "EDITED BY Pengawas", fill: "#80ce9a", radius: undefined },     // Tambahan
    { key: "edited_admin", label: "EDITED BY Admin Kabupaten", fill: "#954eb1", radius: undefined }, // Tambahan
    { key: "complete_admin", label: "COMPLETED BY Admin Kabupaten", fill: "#dc00d1", radius: undefined },
    { key: "open", label: "OPEN", fill: "#e2e8f0", radius: [4, 4, 0, 0] }
];

export default function DashboardMonitoring() {
    // ==========================================
    // 1. STATE MANAGEMENT UTAMA (useState)
    // ==========================================
    const { profile } = useAuth();
    const [selectedKecTab, setSelectedKecTab] = useState("SEMUA");
    const [selectedKecamatan, setSelectedKecamatan] = useState(null);
    const [selectedPml, setSelectedPml] = useState("SEMUA");
    const [viewModeTab, setViewModeTab] = useState("DESA");
    const [selectedDesaCode, setSelectedDesaCode] = useState(null);
    const [selectedDesaName, setSelectedDesaName] = useState("");
    const [selectedPetugas, setSelectedPetugas] = useState(null);
    const [selectedPetugasEmail, setSelectedPetugasEmail] = useState(null);
    const [includeDraft, setIncludeDraft] = useState(false);
    const [loading, setLoading] = useState(true);
    const [rawData, setRawData] = useState([]);
    const [historyData, setHistoryData] = useState([]);
    const [pmlList, setPmlList] = useState([]);
    const [staffLookup, setStaffLookup] = useState({});
    const [pclToPmlLookup, setPclToPmlLookup] = useState({});
    const [lastSyncedTime, setLastSyncedTime] = useState(null);
    // Place this at the top of your component with other useState declarations
    const [dashboardMode, setDashboardMode] = useState("PCL"); // Opsi: "PCL" | "PML"
    // Tambahkan di baris deklarasi state paling atas:
    const [pmlTimeframeMode, setPmlTimeframeMode] = useState("TODAY"); // Pilihan: "TODAY" atau "TOTAL"
    // Pilihan: "ASC" (tersedikit ke terbanyak) atau "DESC" (terbanyak ke tersedikit)
    const [pmlSortOrder, setPmlSortOrder] = useState("ASC");
    // Kriteria sorting: "approve", "reject", "pending", atau "rate"
    const [pmlSortBy, setPmlSortBy] = useState("pending"); // Default mengurutkan pending
    // Direction: "ASC" (kecil ke besar) atau "DESC" (besar ke kecil)
    const [pmlSortDirection, setPmlSortDirection] = useState("DESC"); // Default terbanyak dulu
    // Tambahkan di bawah state includeDraft Anda
    const [viewSlsPercentage, setViewSlsPercentage] = useState(false);
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

    // ─── OPTIMISASI UTAMA: GEMBOK PENGUNCI LAUNCHING DASHBOARD ───
    const isMasterDataLoadedRef = useRef(false);

    const namaKecamatanTerpilihText = selectedKecTab !== "SEMUA"
        ? (dataMonitoringWilayah.kecamatan.find(k => k.kodeKec === selectedKecTab)?.nama_asli || selectedKecTab)
        : "";
    const db = useMemo(() => {
        const localDb = new Dexie('DashboardMonitoringCache');
        localDb.version(1).stores({
            progress_boyolali: 'idsubsls', // primary key
            history_progress_petugas: '++, tanggal, petugas_id', // auto-incremented primary key + indeks
            petugas: 'email' // primary key
        });
        return localDb;
    }, []);
    // ==========================================
    // 2. DATA EFFECTS MANAGEMENT (useEffect)
    // ==========================================
    // ==========================================
    // 1. LOAD DASHBOARD DATA (UTUH + TAMBAHAN KOLOM PML)
    // ==========================================
    useEffect(() => {
        async function loadAllDashboardData() {
            if (isMasterDataLoadedRef.current) return;
            isMasterDataLoadedRef.current = true;

            try {
                setLoading(true);

                // 1. Ambil token/timestamp update terbaru dari Supabase (Egress super minimal)
                const { data: syncData, error: syncError } = await supabase
                    .from('sync_status')
                    .select('last_update')
                    .eq('nama_tabel', 'progress_boyolali')
                    .maybeSingle();

                if (syncError) throw syncError;

                const serverTimestamp = syncData?.last_update || null;
                let localTimestamp = localStorage.getItem('cache_progress_boyolali_timestamp');

                let finalProgress = [];
                let finalHistory = [];
                let finalPetugas = [];

                // 2. LOGIKA KONDISIONAL CACHE
                if (localTimestamp && serverTimestamp && localTimestamp === serverTimestamp) {
                    console.log("🚀 [CACHE HIT] Menggunakan data lokal IndexedDB...");

                    finalProgress = await db.progress_boyolali.toArray();
                    finalHistory = await db.history_progress_petugas.toArray();
                    finalPetugas = await db.petugas.toArray();

                    if (finalProgress.length === 0) {
                        console.warn("Cache terdeteksi kosong di IndexedDB, memaksa unduh ulang...");
                        localTimestamp = null;
                    }
                }

                if (!localTimestamp || !serverTimestamp || localTimestamp !== serverTimestamp) {
                    console.log("🔄 [CACHE MISS] Data baru/berubah terdeteksi. Mengunduh dari Supabase...");

                    const duaMingguLalu = new Date();
                    duaMingguLalu.setDate(duaMingguLalu.getDate() - 15);
                    const strFilterTanggal = duaMingguLalu.toISOString().split('T')[0];

                    const [progressRes, historyRes, petugasRes] = await Promise.all([
                        supabase.from('progress_boyolali').select(`
                            idsubsls, kecamatan, kode_desa, nama_desa, kode_sls, nama_rt_dusun, updated_at,
                            total, open, draft, submitted_pencacah, approved_pengawas, 
                            rejected_pengawas, revoked_pengawas, edited_pengawas, submitted_respondent, edited_admin_kabupaten, complete_admin_kabupaten,
                            muatan_sls (
                                nmsls, kdkec, nmkec, kddesa, nmdesa, petugas_id,
                                petugas (nama_petugas, posisi_tugas, id_pml_atasan, kecamatan_tugas)
                            )
                        `),
                        supabase.from('history_progress_petugas')
                            // 🌟 PERBAIKAN Sederhana: Tambahkan kolom PML ke query
                            .select('tanggal, petugas_id, total_capaian, total_capaian_tanpa_draft, kode_kec, kode_desa, email_pml, total_approve_pml, total_reject_pml')
                            .gte('tanggal', strFilterTanggal)
                            .order('tanggal', { ascending: true }),
                        supabase.from('petugas').select('email, nama_petugas')
                    ]);

                    if (progressRes.error) throw progressRes.error;
                    if (historyRes.error) throw historyRes.error;
                    if (petugasRes.error) throw petugasRes.error;

                    finalProgress = progressRes.data || [];
                    finalHistory = historyRes.data || [];
                    finalPetugas = petugasRes.data || [];

                    await db.transaction('rw', [db.progress_boyolali, db.history_progress_petugas, db.petugas], async () => {
                        await db.progress_boyolali.clear();
                        await db.history_progress_petugas.clear();
                        await db.petugas.clear();

                        if (finalProgress.length > 0) await db.progress_boyolali.bulkAdd(finalProgress);
                        if (finalHistory.length > 0) await db.history_progress_petugas.bulkAdd(finalHistory);
                        if (finalPetugas.length > 0) await db.petugas.bulkAdd(finalPetugas);
                    });

                    if (serverTimestamp) {
                        localStorage.setItem('cache_progress_boyolali_timestamp', serverTimestamp);
                    }
                }

                if (serverTimestamp) {
                    const syncTime = new Date(serverTimestamp);
                    setLastSyncedTime(syncTime.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) + ' WIB');
                } else {
                    setLastSyncedTime(new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) + ' WIB');
                }

                if (finalPetugas.length > 0) {
                    const lookupObj = {};
                    finalPetugas.forEach(st => {
                        lookupObj[st.email.toLowerCase().trim()] = st.nama_petugas;
                    });
                    setStaffLookup(lookupObj);
                }

                setRawData(finalProgress);
                setHistoryData(finalHistory);

            } catch (err) {
                console.error("Control Center Load Error (Mencoba fallback ke cache lokal):", err.message);
                try {
                    const cachedProgress = await db.progress_boyolali.toArray();
                    const cachedHistory = await db.history_progress_petugas.toArray();
                    if (cachedProgress.length > 0) {
                        setRawData(cachedProgress);
                        setHistoryData(cachedHistory);
                        console.log("⚠️ Menggunakan fallback data offline karena galat jaringan.");
                    }
                } catch (dbErr) {
                    console.error("Gagal memuat fallback database lokal:", dbErr);
                }
            } finally {
                setLoading(false);
            }
        }
        loadAllDashboardData();
    }, [db]);


    // ==========================================
    // 2. EFFECT AGREGASI WILAYAH & DETEKSI PETUGAS (100% STRUKTUR ASLI ANDA)
    // ==========================================
    useEffect(() => {
        if (rawData.length === 0) return;

        const kecMap = {};
        const desaMap = {};
        const petugasMap = {};
        const slsList = [];

        let fSubmitted = 0, fDraft = 0, fRejected = 0, fRevoked = 0, fApproved = 0, fOpen = 0;
        let fEdited = 0, fEditedAdmin = 0, fCompleteAdmin = 0;
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
                const isUserPml = profile?.role === 'pml' && profile?.email?.toLowerCase().trim() === rawPmlEmail;

                if (selectedKecTab === "SEMUA" || kodeKec === selectedKecTab || isUserPml) {
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

            const emailPetugas = relMuatan.petugas_id ? relMuatan.petugas_id.toLowerCase().trim() : "tanpa petugas";
            const namaPetugas = relPetugas.nama_petugas ? `${relPetugas.nama_petugas}` : emailPetugas;
            const emailPmlFormated = relPetugas.id_pml_atasan ? relPetugas.id_pml_atasan.toLowerCase().trim() : "tanpa pengawas";

            const s_submitted = parseInt(row.submitted_pencacah) || 0;
            const s_draft = parseInt(row.draft) || 0;
            const s_rejected = parseInt(row.rejected_pengawas) || 0;
            const s_revoked = parseInt(row.revoked_pengawas) || 0;
            const s_approved = parseInt(row.approved_pengawas) || 0;
            const s_edited = parseInt(row.edited_pengawas) || 0;
            const s_submitted_resp = parseInt(row.submitted_respondent) || 0;
            const s_open = parseInt(row.open) || 0;
            const s_edited_admin = parseInt(row.edited_admin_kabupaten) || 0;
            const s_complete_admin = parseInt(row.complete_admin_kabupaten) || 0;

            const totalTarget = parseInt(row.total) || (s_submitted + s_draft + s_rejected + s_revoked + s_approved + s_edited + s_submitted_resp + s_open + s_edited_admin + s_complete_admin);

            let statusSlsKategori = "belum";
            if (totalTarget > 0) {
                if (s_open === 0) statusSlsKategori = "selesai";
                else if (s_open < totalTarget) statusSlsKategori = "sedang";
                else statusSlsKategori = "belum";
            }

            const initStrukturData = (kode, namaTampilan, namaAsli) => ({
                kodeKec, kodeDesa, nama: namaTampilan, nama_asli: namaAsli,
                submitted: 0, draft: 0, rejected: 0, revoked: 0, approved: 0,
                edited: 0, submitted_resp: 0, open: 0, edited_admin: 0, complete_admin: 0,
                t: 0, jml_sls: 0, sls_selesai: 0
            });

            // 1. Akumulasi per Kecamatan
            if (!kecMap[kodeKec]) kecMap[kodeKec] = initStrukturData(kodeKec, `${namaKec} [${kodeKec}]`, namaKec);
            kecMap[kodeKec].submitted += s_submitted;
            kecMap[kodeKec].draft += s_draft;
            kecMap[kodeKec].rejected += s_rejected;
            kecMap[kodeKec].revoked += s_revoked;
            kecMap[kodeKec].approved += s_approved;
            kecMap[kodeKec].edited += s_edited;
            kecMap[kodeKec].submitted_resp += s_submitted_resp;
            kecMap[kodeKec].open += s_open;
            kecMap[kodeKec].edited_admin += s_edited_admin;
            kecMap[kodeKec].complete_admin += s_complete_admin;
            kecMap[kodeKec].t += totalTarget;
            kecMap[kodeKec].jml_sls += 1;
            if (statusSlsKategori === "selesai") kecMap[kodeKec].sls_selesai += 1;

            // 2. Akumulasi per Desa
            if (!desaMap[kodeDesa]) desaMap[kodeDesa] = initStrukturData(kodeDesa, namaDesa, namaDesa);
            desaMap[kodeDesa].submitted += s_submitted;
            desaMap[kodeDesa].draft += s_draft;
            desaMap[kodeDesa].rejected += s_rejected;
            desaMap[kodeDesa].revoked += s_revoked;
            desaMap[kodeDesa].approved += s_approved;
            desaMap[kodeDesa].edited += s_edited;
            desaMap[kodeDesa].submitted_resp += s_submitted_resp;
            desaMap[kodeDesa].open += s_open;
            desaMap[kodeDesa].complete_admin += s_complete_admin;
            desaMap[kodeDesa].edited_admin += s_edited_admin;
            desaMap[kodeDesa].t += totalTarget;
            desaMap[kodeDesa].jml_sls += 1;
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
                    edited: 0, submitted_resp: 0, open: 0, edited_admin: 0, complete_admin: 0,
                    t: 0, jml_sls: 0, sls_selesai: 0
                };
            }
            petugasMap[emailPetugas].submitted += s_submitted;
            petugasMap[emailPetugas].draft += s_draft;
            petugasMap[emailPetugas].rejected += s_rejected;
            petugasMap[emailPetugas].revoked += s_revoked;
            petugasMap[emailPetugas].approved += s_approved;
            petugasMap[emailPetugas].edited += s_edited;
            petugasMap[emailPetugas].submitted_resp += s_submitted_resp;
            petugasMap[emailPetugas].open += s_open;
            petugasMap[emailPetugas].edited_admin += s_edited_admin;
            petugasMap[emailPetugas].complete_admin += s_complete_admin;
            petugasMap[emailPetugas].t += totalTarget;
            petugasMap[emailPetugas].jml_sls += 1;
            if (statusSlsKategori === "selesai") petugasMap[emailPetugas].sls_selesai += 1;

            // 4. Transformasi Data SLS Tunggal
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
                edited: totalTarget > 0 ? Math.round((s_edited / totalTarget) * 100) : 0,
                submitted_resp: totalTarget > 0 ? Math.round((s_submitted_resp / totalTarget) * 100) : 0,
                open: totalTarget > 0 ? Math.round((s_open / totalTarget) * 100) : 100,
                edited_admin: totalTarget > 0 ? Math.round((s_edited_admin / totalTarget) * 100) : 0,
                complete_admin: totalTarget > 0 ? Math.round((s_complete_admin / totalTarget) * 100) : 0,
                jml_sls: 1, sls_selesai: statusSlsKategori === "selesai" ? 1 : 0
            });

            const lolosFilterPetugas = !selectedPetugasEmail || (emailPetugas === selectedPetugasEmail.toLowerCase().trim());
            const lolosFilterDesa = !selectedDesaCode || (kodeDesa === selectedDesaCode);
            const lolosFilterKec = selectedKecTab === "SEMUA" || (kodeKec === selectedKecTab);
            const lolosFilterPml = selectedPml === "SEMUA" || (emailPmlFormated === selectedPml.toLowerCase().trim());

            if (lolosFilterKec && lolosFilterPml && lolosFilterDesa && lolosFilterPetugas) {
                fSubmitted += s_submitted; fDraft += s_draft; fRejected += s_rejected;
                fRevoked += s_revoked; fApproved += s_approved; fOpen += s_open;
                fEdited += s_edited; fEditedAdmin += s_edited_admin; fCompleteAdmin += s_complete_admin;

                fSlsTotal++;
                if (statusSlsKategori === "selesai") fSlsSelesai++;
                else if (statusSlsKategori === "sedang") fSlsSedang++;
                else fSlsBelum++;
            }
        });

        const tanggalAwalSensus = new Date("2026-06-15");
        const tanggalHariIni = new Date();
        const selisihMilidetik = tanggalHariIni - tanggalAwalSensus;
        const kalkulasiHariKe = selisihMilidetik > 0 ? Math.floor(selisihMilidetik / (1000 * 60 * 60 * 24)) + 1 : 1;

        const totalMuatanSelainOpen = fSubmitted + fDraft + fRejected + fRevoked + fApproved + fEdited + fEditedAdmin + fCompleteAdmin;
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

            let capaianH1 = 0;
            let capaianH3 = 0;

            historyData.forEach(h => {
                if (h.petugas_id?.toLowerCase().trim() === emailClean) {
                    if (h.tanggal === strH1) capaianH1 += (h.total_capaian || 0);
                    if (h.tanggal === strH3) capaianH3 += (h.total_capaian || 0);
                }
            });

            const totalPerubahanTigaHari = Math.max(capaianH1 - capaianH3, 0);

            if (totalPerubahanTigaHari === 0 && p.t > p.open) {
                tmpMacet.push(p.email);
            } else if (totalPerubahanTigaHari > 0 && totalPerubahanTigaHari < 10) {
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
                ...obj,
                total_target: obj.t,
                total_realisasi: obj.t - obj.open,

                submitted_dokumen: obj.submitted,
                draft_dokumen: obj.draft,
                rejected_dokumen: obj.rejected,
                revoked_dokumen: obj.revoked,
                approved_dokumen: obj.approved,
                edited_dokumen: obj.edited,
                submitted_resp_dokumen: obj.submitted_resp,
                edited_admin_dokumen: obj.edited_admin,
                complete_admin_dokumen: obj.complete_admin,
                open_dokumen: obj.open,

                submitted: Math.round((obj.submitted / total) * 100),
                draft: Math.round((obj.draft / total) * 100),
                rejected: Math.round((obj.rejected / total) * 100),
                revoked: Math.round((obj.revoked / total) * 100),
                approved: Math.round((obj.approved / total) * 100),
                edited: Math.round((obj.edited / total) * 100),
                submitted_resp: Math.round((obj.submitted_resp / total) * 100),
                edited_admin: Math.round((obj.edited_admin / total) * 100),
                complete_admin: Math.round((obj.complete_admin / total) * 100),
                open: Math.round((obj.open / total) * 100)
            };
        };

        const sortedKecamatan = Object.values(kecMap).map(formatKePersen).sort((a, b) => a.kodeKec.localeCompare(b.kodeKec, undefined, { numeric: true }));
        const sortedDesa = Object.values(desaMap).map(formatKePersen).sort((a, b) => a.kodeDesa.localeCompare(b.kodeDesa, undefined, { numeric: true }));
        const sortedPetugas = Object.values(petugasMap).map(obj => ({ ...obj, total_target: obj.t, total_realisasi: obj.t - obj.open })).sort((a, b) => b.total_realisasi - a.total_realisasi);
        const sortedSls = slsList.sort((a, b) => a.idsubsls.localeCompare(b.idsubsls, undefined, { numeric: true }));

       // 🌟 HITUNG KINERJA HARIAN & PENDING PML (VERSI AMAN ZONA WAKTU WIB)
        // 🌟 HITUNG KINERJA HARIAN & PENDING PML (VERSI AMAN ANTI-DESEPAN & COMPATIBLE NIGHTLY FETCH)
        const historyPmlToday = {};
        const historyPmlYesterday = {};

        // 1. Akumulasi Pending PML langsung dari status submitted PPL bimbingannya
        const pendingPmlMap = {};
        Object.values(petugasMap).forEach(p => {
            const emailPml = p.emailPml ? p.emailPml.toLowerCase().trim() : null;
            if (emailPml && emailPml !== "tanpa pengawas") {
                pendingPmlMap[emailPml] = (pendingPmlMap[emailPml] || 0) + (p.submitted || 0);
            }
        });

        // 2. 🟢 AMBIL TANGGAL KONTROL BERBASIS WIB (Asia/Jakarta)
        const formatTanggalWib = (dateObj) => {
            return new Intl.DateTimeFormat('fr-CA', {
                timeZone: 'Asia/Jakarta',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            }).format(dateObj);
        };

        const nowWib = new Date();
        const hariIniWibStr = formatTanggalWib(nowWib);
        const kemarinWibStr = formatTanggalWib(new Date(nowWib.getTime() - (24 * 60 * 60 * 1000)));

        // 3. Ambil daftar tanggal unik yang ADA di database history, urutkan ascending
        const daftarTanggalPml = [...new Set(historyData.map(h => h.tanggal))].sort();

        // Cari tanggal valid di database yang TIDAK BOLEH melebihi hari ini WIB (Membuang tanggal bug masa depan)
        const tanggalValidDiDb = daftarTanggalPml.filter(tgl => tgl <= hariIniWibStr);

        // Tentukan batas "Hari Ini/Terbaru" dan "Kemarin/Sebelumnya" secara dinamis berdasarkan ketersediaan data real
        let strHariIniPml, strKemarinPml;

        if (tanggalValidDiDb.length >= 2) {
            strHariIniPml = tanggalValidDiDb[tanggalValidDiDb.length - 1]; // Tanggal paling baru yang ada di DB (misal: 25 Juli jika hari ini belum ditarik)
            strKemarinPml = tanggalValidDiDb[tanggalValidDiDb.length - 2]; // Tanggal satu hari sebelum data terbaru (misal: 24 Juli)
        } else if (tanggalValidDiDb.length === 1) {
            strHariIniPml = tanggalValidDiDb[0];
            strKemarinPml = tanggalValidDiDb[0];
        } else {
            strHariIniPml = hariIniWibStr;
            strKemarinPml = kemarinWibStr;
        }

        // 4. Olah data snapshot history berdasarkan kunci tanggal yang telah tervalidasi
        historyData.forEach(h => {
            const pmlMail = h.email_pml ? h.email_pml.toLowerCase().trim() : (tmpPclToPml[h.petugas_id?.toLowerCase().trim()] || null);
            if (pmlMail) {
                if (h.tanggal === strHariIniPml) {
                    if (!historyPmlToday[pmlMail]) historyPmlToday[pmlMail] = { app: 0, rej: 0 };
                    historyPmlToday[pmlMail].app += (h.total_approve_pml || 0);
                    historyPmlToday[pmlMail].rej += (h.total_reject_pml || 0);
                }
                if (h.tanggal === strKemarinPml) {
                    if (!historyPmlYesterday[pmlMail]) historyPmlYesterday[pmlMail] = { app: 0, rej: 0 };
                    historyPmlYesterday[pmlMail].app += (h.total_approve_pml || 0);
                    historyPmlYesterday[pmlMail].rej += (h.total_reject_pml || 0);
                }
            }
        });

        // 5. Olah Objek Akhir pmlPerformance Lengkap (Selisih Hari Ini & Total Akumulasi)
        const processedPmlList = tmpPmlList.map(pmlItem => {
            const emailClean = pmlItem.email.toLowerCase().trim();
            const todayApp = historyPmlToday[emailClean]?.app || 0;
            const todayRej = historyPmlToday[emailClean]?.rej || 0;
            const yestApp = historyPmlYesterday[emailClean]?.app || 0;
            const yestRej = historyPmlYesterday[emailClean]?.rej || 0;

            // 1. Selisih Murni (Pencegahan nilai minus jika terjadi penyesuaian data)
            const diffApprove = todayApp - yestApp;
            const diffReject = todayRej - yestRej;

            const approveHariIni = diffApprove > 0 ? diffApprove : 0;
            const rejectHariIni = diffReject > 0 ? diffReject : 0;

            const totalPeriksaHariIni = approveHariIni + rejectHariIni;
            const rejectRateHariIni = totalPeriksaHariIni > 0
                ? Number(((rejectHariIni / totalPeriksaHariIni) * 100).toFixed(1))
                : 0;

            // 2. Data Total Akumulasi
            const totalApprove = todayApp;
            const totalReject = todayRej;
            const totalPeriksaTotal = totalApprove + totalReject;
            const rejectRateTotal = totalPeriksaTotal > 0
                ? Number(((totalReject / totalPeriksaTotal) * 100).toFixed(1))
                : 0;

            const sampelAnggota = Object.values(petugasMap).find(p => (p.emailPml || "").toLowerCase().trim() === emailClean);
            const namaKecamatanPml = sampelAnggota?.namaKec || "-";

            return {
                email: emailClean,
                nama_petugas: pmlItem.nama,
                kecamatan: namaKecamatanPml,

                // 📊 Data Hari Ini / Snapshot Terakhir
                approveHariIni,
                rejectHariIni,
                rejectRateHariIni,

                // 📈 Data Total Akumulasi
                totalApprove,
                totalReject,
                rejectRateTotal,

                // ⏳ Antrean & Rate Bawaan
                pendingPml: pendingPmlMap[emailClean] || 0,
                rejectRate: rejectRateTotal
            };
        });

        setDataMonitoringWilayah({
            kecamatan: sortedKecamatan,
            desa: sortedDesa,
            petugas: sortedPetugas,
            pmlPerformance: processedPmlList,
            sls: sortedSls,
            muatanStatus: {
                submitted: fSubmitted,
                draft: fDraft,
                rejected: fRejected,
                revoked: fRevoked,
                approved: fApproved,
                open: fOpen,
                edited: fEdited,
                edited_admin: fEditedAdmin,
                complete_admin: fCompleteAdmin
            },
            statusSls: { selesai: fSlsSelesai, sedang: fSlsSedang, belum: fSlsBelum, total: fSlsTotal }
        });

        setDataMonitoringWilayah({
            kecamatan: sortedKecamatan,
            desa: sortedDesa,
            petugas: sortedPetugas,
            pmlPerformance: processedPmlList,
            sls: sortedSls,
            muatanStatus: {
                submitted: fSubmitted,
                draft: fDraft,
                rejected: fRejected,
                revoked: fRevoked,
                approved: fApproved,
                open: fOpen,
                edited: fEdited,
                edited_admin: fEditedAdmin,
                complete_admin: fCompleteAdmin
            },
            statusSls: { selesai: fSlsSelesai, sedang: fSlsSedang, belum: fSlsBelum, total: fSlsTotal }
        });

    }, [rawData, historyData, selectedKecTab, selectedPml, staffLookup, profile, selectedDesaCode, selectedPetugasEmail]);


    // ==========================================
    // 3. PENGOLAH TREN GRAFIK HARIAN (100% STRUKTUR ASLI ANDA)
    // ==========================================
    useEffect(() => {
        if (historyData.length === 0) return;

        const tanggalUnik = [...new Set(historyData.map(h => h.tanggal))].sort();
        const kumpulanKeys = new Set();

        let lastCapaianPerPetugas = {};
        let lastTotalWilayah = 0;

        const namaKeyDinamis = includeDraft ? "Penambahan Harian (Dengan Draft)" : "Penambahan Harian (Tanpa Draft)";

        const dataChartGaris = tanggalUnik.map((tgl, tglIdx) => {
            const rawLogsHariIni = historyData.filter(h => h.tanggal === tgl);

            let databaseCapaianHariIni = {};
            rawLogsHariIni.forEach(h => {
                if (h.petugas_id) {
                    const email = h.petugas_id.toLowerCase().trim();

                    let nilaiCapaianMurni = 0;
                    if (includeDraft) {
                        nilaiCapaianMurni = h.total_capaian || 0;
                    } else {
                        nilaiCapaianMurni = h.total_capaian_tanpa_draft !== null && h.total_capaian_tanpa_draft !== undefined
                            ? h.total_capaian_tanpa_draft
                            : 0;
                    }

                    databaseCapaianHariIni[email] = (databaseCapaianHariIni[email] || 0) + nilaiCapaianMurni;
                }
            });

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

            if (viewModeTab === "PETUGAS" && !selectedPetugasEmail) {
                let penambahanGarisHariIni = {};

                filteredLogs.forEach(h => {
                    const emailFormated = h.petugas_id ? h.petugas_id.toLowerCase().trim() : "Unknown";
                    const namaPcl = staffLookup[emailFormated] || h.petugas_id || "Tanpa Nama";

                    const capaianSaatIni = databaseCapaianHariIni[emailFormated] || 0;
                    const capaianSebelumnya = lastCapaianPerPetugas[emailFormated] || 0;
                    let penambahanHariIni = Math.max(capaianSaatIni - capaianSebelumnya, 0);

                    if (!includeDraft && capaianSebelumnya === 0 && capaianSaatIni > 0) {
                        penambahanHariIni = 0;
                    }

                    penambahanGarisHariIni[namaPcl] = penambahanHariIni;
                    kumpulanKeys.add(namaPcl);
                });

                Object.keys(penambahanGarisHariIni).forEach(namaPcl => {
                    dataPoint[namaPcl] = penambahanGarisHariIni[namaPcl];
                });

                Object.keys(databaseCapaianHariIni).forEach(email => {
                    lastCapaianPerPetugas[email] = databaseCapaianHariIni[email];
                });

            } else {
                let capaianHariIni = 0;

                if (includeDraft) {
                    capaianHariIni = filteredLogs.reduce((sum, item) => sum + (item.total_capaian || 0), 0);
                } else {
                    capaianHariIni = filteredLogs.reduce((sum, item) => {
                        return sum + (item.total_capaian_tanpa_draft !== null && item.total_capaian_tanpa_draft !== undefined
                            ? item.total_capaian_tanpa_draft
                            : 0);
                    }, 0);
                }

                let penambahanHariIni = Math.max(capaianHariIni - lastTotalWilayah, 0);

                if (!includeDraft && lastTotalWilayah === 0 && capaianHariIni > 0) {
                    penambahanHariIni = 0;
                }

                const keyNamaGarisFinal = selectedPetugasEmail ? (staffLookup[selectedPetugasEmail] || selectedPetugasEmail) : namaKeyDinamis;

                dataPoint[keyNamaGarisFinal] = tglIdx === 0 ? capaianHariIni : penambahanHariIni;
                kumpulanKeys.add(keyNamaGarisFinal);

                lastTotalWilayah = capaianHariIni;
            }

            return dataPoint;
        });

        const dataChartTanpaHariPertama = dataChartGaris.slice(1);
        setTrendKeys(Array.from(kumpulanKeys));
        setChartTrenData(dataChartTanpaHariPertama);

    }, [historyData, selectedKecTab, selectedDesaCode, selectedPetugasEmail, selectedPml, pclToPmlLookup, viewModeTab, staffLookup, includeDraft]);

    // Data khusus Grafik PML (Combo Bar + Line)
    // 2. DATA KHUSUS GRAFIK PML (COMBO BAR + LINE)
    // ✅ KODE PERBAIKAN (Aman dari ReferenceError):
    const handlePmlSortClick = (criterion) => {
        if (pmlSortBy === criterion) {
            // Jika kolom sama diklik lagi, balik arahnya (ASC <-> DESC)
            setPmlSortDirection(prev => prev === "ASC" ? "DESC" : "ASC");
        } else {
            // Jika pilih kolom baru, set kolomnya dan default ke DESC (terbesar dulu)
            setPmlSortBy(criterion);
            setPmlSortDirection("DESC");
        }
    };
    const processedPmlChartData = useMemo(() => {
        if (!dataMonitoringWilayah?.pmlPerformance) return [];

        const isToday = pmlTimeframeMode === "TODAY";

        return dataMonitoringWilayah.pmlPerformance.map(pml => {
            const approveVal = isToday ? (pml.approveHariIni || 0) : (pml.totalApprove || 0);
            const rejectVal = isToday ? (pml.rejectHariIni || 0) : (pml.totalReject || 0);
            const rejectRate = isToday ? (pml.rejectRateHariIni || 0) : (pml.rejectRateTotal || 0);

            return {
                nama: pml.nama_petugas || "PML",
                email: pml.email,
                kecamatan: pml.kecamatan || "-",
                approveVal,
                rejectVal,
                pendingPml: pml.pendingPml || 0,
                rejectRate
            };
        })
            // 🟢 DYNAMIC MULTI-COLUMN SORTING
            .sort((a, b) => {
                let valA = 0;
                let valB = 0;

                if (pmlSortBy === "approve") {
                    valA = a.approveVal;
                    valB = b.approveVal;
                } else if (pmlSortBy === "reject") {
                    valA = a.rejectVal;
                    valB = b.rejectVal;
                } else if (pmlSortBy === "pending") {
                    valA = a.pendingPml;
                    valB = b.pendingPml;
                } else if (pmlSortBy === "rate") {
                    valA = a.rejectRate;
                    valB = b.rejectRate;
                }

                return pmlSortDirection === "ASC" ? valA - valB : valB - valA;
            });

    }, [dataMonitoringWilayah.pmlPerformance, pmlTimeframeMode, pmlSortBy, pmlSortDirection]);
    // ==========================================
    // 3. OPTIMISASI PERHITUNGAN DATA (useMemo)
    // ==========================================
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


    // Cari baris ini di kode Anda dan ubah menjadi:
    const isPetugasMode = viewModeTab === "PETUGAS";
    // MODIFIKASI: Jika viewSlsPercentage aktif, unit tetap "%" meskipun di mode petugas
    const unitSatuanYAxis = (isPetugasMode && !viewSlsPercentage) ? "" : "%";
    const formatSuffixTooltip = (isPetugasMode && !viewSlsPercentage) ? " Dokumen" : "%";

    const TANGGAL_MULAI = new Date("2026-06-15");
    const TANGGAL_SELESAI = new Date("2026-08-31");
    const TOTAL_HARI = Math.floor((TANGGAL_SELESAI - TANGGAL_MULAI) / (1000 * 60 * 60 * 24)) + 1;

    const selisihHari = new Date() - TANGGAL_MULAI;
    const HARI_KE = selisihHari > 0 ? Math.floor(selisihHari / (1000 * 60 * 60 * 24)) + 1 : 1;
    const RASIO_WAKTU = Math.min(HARI_KE / TOTAL_HARI, 1);

    const targetPersenWilayah = Math.round(RASIO_WAKTU * 100);

    const targetVolumePetugas = (() => {
        const petugasDiKecamatanIni = dataMonitoringWilayah.petugas.filter(p =>
            p.email !== "Tanpa Petugas" && (selectedKecTab === "SEMUA" || p.kodeKec === selectedKecTab)
        );
        const totalTargetMuatanKec = petugasDiKecamatanIni.reduce((sum, p) => sum + (p.total_target || 0), 0);
        const jumlahPetugasKecamatan = petugasDiKecamatanIni.length || 1;
        const rataBebanPerPetugas = totalTargetMuatanKec / jumlahPetugasKecamatan;
        return Math.round(rataBebanPerPetugas * RASIO_WAKTU);
    })();

    const nilaiTargetYAxis = isPetugasMode ? targetVolumePetugas : targetPersenWilayah;
    const teksLabelTarget = isPetugasMode ? `${targetVolumePetugas.toLocaleString('id-ID')} Dokumen` : `${targetPersenWilayah}%`;

    const metrikEstimasiProyek = useMemo(() => {
        // 1. Tentukan target grup petugas berdasarkan filter wilayah atau individu petugas yang aktif
        let masterPetugasWilayah = dataMonitoringWilayah.petugas.filter(p =>
            p.email !== "Tanpa Petugas" && p.total_target > 0
        );

        const isSkupPetugasIndividu = (viewModeTab === "PETUGAS" || viewModeTab === "SLS") &&
            (selectedPetugasEmail || hoveredTrend);

        let keyAktif = hoveredTrend || "";

        // Jika sedang fokus ke satu petugas
        if (isSkupPetugasIndividu) {
            const objekPetugasTerpilih = dataMonitoringWilayah.petugas.find(p => {
                const namaMurni = (p.nama_asli || p.nama || "").toLowerCase().trim();
                return namaMurni === keyAktif.toLowerCase().trim() || p.email === selectedPetugasEmail;
            });

            if (objekPetugasTerpilih) {
                masterPetugasWilayah = [objekPetugasTerpilih];
            }
        } else {
            // Mode Wilayah Standar
            if (selectedKecTab !== "SEMUA") {
                masterPetugasWilayah = masterPetugasWilayah.filter(p => p.kodeKec === selectedKecTab);
            }
        }

        // 2. Hitung sisa berkas open berdasarkan grup petugas terpilih di atas
        const totalSisaOpenAktif = masterPetugasWilayah.reduce((sum, p) => {
            return sum + (includeDraft ? (p.open || 0) : ((p.open || 0) + (p.draft || 0)));
        }, 0);

        // 🌟 BEBAN TARGET DINAMIS: Menyesuaikan entitas yang aktif agar perhitungan rasio sinkron dengan grafik
        const totalBebanAwal = masterPetugasWilayah.reduce((sum, p) => sum + (p.total_target || 0), 0) || 1;

        // 3. Ambil data histori 4 hari terakhir untuk menghitung laju harian
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
                logHarian[h.tanggal] += includeDraft ? (h.total_capaian || 0) : (h.total_capaian_tanpa_draft || 0);
            }
        });

        const dW1 = Math.max((logHarian[tglH1] || 0) - (logHarian[tglH2] || 0), 0);
        const dW2 = Math.max((logHarian[tglH2] || 0) - (logHarian[tglH3] || 0), 0);
        const dW3 = Math.max((logHarian[tglH3] || 0) - (logHarian[tglH4] || 0), 0);

        // 4. Kalkulasi Laju Kirim Harian Riil Saat Ini
        const lajuHarianSaatIni = Math.max(parseFloat(((dW1 + dW2 + dW3) / 3).toFixed(1)), 0.1);

        // 5. Jalankan Simulasi Pengurangan Dokumen Hari Demi Hari
        let sisaHariDibutuhkan = 0;
        let sisaDokumenSimulasi = totalSisaOpenAktif;
        let totalLajuPrediktifKumulatif = 0;

        // ✨ ARRAY KOORDINAT GRAFIK DIBUAT DI SINI AGAR SINKRON
        const arrayProyeksi = [];
        const tglSimulasi = new Date();

        if (sisaDokumenSimulasi > 0) {
            while (sisaDokumenSimulasi > 0 && sisaHariDibutuhkan < 365) {
                sisaHariDibutuhkan++;
                tglSimulasi.setDate(tglSimulasi.getDate() + 1); // Prediksi mulai besok

                const rasioHariIni = sisaDokumenSimulasi / totalBebanAwal;
                let lajuHariIni = lajuHarianSaatIni;

                // 🌟 RUMUS SMOOTHING TUNGGAL (Digunakan Teks & Grafik)
                if (rasioHariIni <= 0.25) {
                    const rasioSkalaInternal = Math.max(rasioHariIni / 0.25, 0);
                    const faktorPelambatanSmooth = 0.5 + (0.5 * rasioSkalaInternal);
                    lajuHariIni = Math.max(lajuHarianSaatIni * faktorPelambatanSmooth, 0.1);
                }

                sisaDokumenSimulasi -= lajuHariIni;
                totalLajuPrediktifKumulatif += lajuHariIni;

                // ✨ SIMPAN TITIK KOORDINAT KE ARRAY
                arrayProyeksi.push({
                    tanggalRaw: tglSimulasi.toISOString().split('T')[0],
                    label: tglSimulasi.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
                    "PREDIKSI JALAN HARIAN": parseFloat(lajuHariIni.toFixed(1)),
                    isProyeksi: true
                });
            }
        }

        const lajuPrediktifRataRata = sisaHariDibutuhkan > 0
            ? parseFloat((totalLajuPrediktifKumulatif / sisaHariDibutuhkan).toFixed(1))
            : lajuHarianSaatIni;

        // 6. Tentukan Perkiraan Tanggal Selesai & Status Keterlambatan
        const TANGGAL_SELESAI_TREN = new Date("2026-08-31");
        let stringPrediksiSelesai = "-";
        let isTerlambat = false;
        let selisihDariDeadline = 0;

        if (totalSisaOpenAktif === 0) {
            stringPrediksiSelesai = "SELESAI";
        } else if (lajuHarianSaatIni <= 0.2 && totalSisaOpenAktif > 0) {
            stringPrediksiSelesai = "STAGNAN (0 DOK/HARI)";
            isTerlambat = true;
            const hariIni = new Date();
            hariIni.setHours(0, 0, 0, 0);
            selisihDariDeadline = Math.ceil(Math.max((TANGGAL_SELESAI_TREN - hariIni) / (1000 * 60 * 60 * 24), 1));
        } else {
            const tglPrediksiSelesai = new Date();
            tglPrediksiSelesai.setDate(tglPrediksiSelesai.getDate() + sisaHariDibutuhkan);
            stringPrediksiSelesai = tglPrediksiSelesai.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

            if (tglPrediksiSelesai > TANGGAL_SELESAI_TREN) {
                isTerlambat = true;
                selisihDariDeadline = Math.ceil(Math.abs((tglPrediksiSelesai - TANGGAL_SELESAI_TREN) / (1000 * 60 * 60 * 24)));
            }
        }

        return {
            rataKirimHarian: lajuHarianSaatIni,
            lajuPrediktif: lajuPrediktifRataRata,
            sisaHariDibutuhkan,
            tanggalPrediksi: stringPrediksiSelesai,
            isTerlambat,
            selisihDariDeadline,
            totalSisaOpenAktif,
            isModeIndividu: isSkupPetugasIndividu,
            arrayProyeksi // ✨ PENTING: Ekspor array ke AreaChart
        };
    }, [dataMonitoringWilayah.petugas, historyData, selectedKecTab, viewModeTab, selectedPetugasEmail, hoveredTrend, includeDraft]);

    const jumlahPetugasDiBawahTarget = useMemo(() => {
        if (!dataMonitoringWilayah.petugas) return 0;
        return dataMonitoringWilayah.petugas.filter(p => {
            if (p.email === "Tanpa Petugas") return false;
            const matchKec = selectedKecTab === "SEMUA" || p.kodeKec === selectedKecTab;
            const matchPml = selectedPml === "SEMUA" || p.emailPml === selectedPml.toLowerCase().trim();
            return matchKec && matchPml && (p.total_realisasi < nilaiTargetYAxis);
        }).length;
    }, [dataMonitoringWilayah.petugas, selectedKecTab, selectedPml, nilaiTargetYAxis]);

    // Effect untuk mengunci wilayah tugas DAN memaksa tampilan langsung ke mode PETUGAS untuk PML
    useEffect(() => {
        if (profile?.role === 'pml' && profile?.kecamatan_tugas && rawData.length > 0) {
            const targetKecText = profile.kecamatan_tugas.toString().toUpperCase().trim();

            // 🌟 PAKSA VIEW MODE langsung ke PETUGAS jika role-nya adalah PML
            setViewModeTab("PETUGAS");

            // Cari baris data di rawData yang nama atau kodenya terkandung di dalam teks profil
            const cocokKecamatan = rawData.find(row => {
                const relMuatan = row.muatan_sls || {};
                const kodeKec = (relMuatan.kdkec || "").toString().trim();
                const namaKec = (row.kecamatan || relMuatan.nmkec || "").toUpperCase().trim();

                return (
                    (kodeKec && targetKecText.includes(kodeKec)) ||
                    (namaKec && targetKecText.includes(namaKec))
                );
            });

            if (cocokKecamatan) {
                const kodeResmi = (cocokKecamatan.muatan_sls?.kdkec || cocokKecamatan.kecamatan || "").toString().trim();
                setSelectedKecTab(kodeResmi);
                setSelectedKecamatan(kodeResmi);
            } else {
                const matchAngka = targetKecText.match(/\d+/);
                const kodeFallback = matchAngka ? matchAngka[0] : targetKecText;

                setSelectedKecTab(kodeFallback);
                setSelectedKecamatan(kodeFallback);
            }

            if (profile?.email) {
                setSelectedPml(profile.email.toLowerCase().trim());
            }
        }
    }, [profile, rawData]); // 👈 Kunci dependency
    // 2. Lakukan transformasi data barChartData berdasarkan status switch:
    const processedBarChartData = useMemo(() => {
        if (!barChartData) return [];

        let updatedData = barChartData.map(item => {
            const isPersenMode = viewModeTab !== "PETUGAS" && viewModeTab !== "SLS";

            // 1. LOGIKA LAMA: Proteksi Switch Include Draft (Tetap Pertahankan)
            if (!includeDraft) {
                const draftValue = parseFloat(item.draft) || 0;
                const openValue = parseFloat(item.open) || 0;
                const originalRealisasi = parseFloat(item.total_realisasi) || 0;
                const newRealisasi = Math.max(0, originalRealisasi - draftValue);
                let newOpen = openValue + draftValue;

                if (isPersenMode) {
                    const totalTanpaOpen = (parseFloat(item.submitted) || 0) +
                        (parseFloat(item.rejected) || 0) +
                        (parseFloat(item.revoked) || 0) +
                        (parseFloat(item.approved) || 0) +
                        (parseFloat(item.edited) || 0) +
                        (parseFloat(item.edited_admin) || 0) +
                        (parseFloat(item.complete_admin) || 0);
                    newOpen = Math.max(0, 100 - totalTanpaOpen);
                }

                item = {
                    ...item,
                    draft: 0,
                    open: newOpen,
                    total_realisasi: newRealisasi
                };
            }

            // 2. LOGIKA BARU: Jika Mode Petugas & Switch Persentase SLS Aktif
            if (viewModeTab === "PETUGAS" && viewSlsPercentage) {
                const totalSlsPetugas = parseInt(item.jml_sls) || 1;
                const slsSelesaiMurni = parseInt(item.sls_selesai) || 0;

                // Catatan: Di rawData Anda, SLS dikategorikan "sedang" atau "selesai" jika open < total target.
                // Maka, SLS yang sudah disentuh/dikerjakan (ada status selain open) adalah: Total SLS - SLS Belum Mulai.
                // Namun, jika Anda ingin menyamakan dengan definisi "SLS yang progresnya berjalan/selesai", 
                // kita bisa menghitung SLS yang sudah selesai + SLS yang sedang berjalan.
                // Berdasarkan baris ~247 kode Anda: fSlsBelum ditingkatkan jika s_open === totalTarget.

                // Mari kita hitung SLS yang sudah dikerjakan (Selesai + Sedang)
                // Karena kita hanya punya data agregat `jml_sls` dan `sls_selesai` di level petugasMap,
                // mari kita cari tahu berapa SLS yang berstatus 'belum mulai' secara presisi dari slsList:
                const slsMilikPetugas = dataMonitoringWilayah.sls.filter(s => s.petugas_id === item.email);
                const slsSudahDikerjakan = slsMilikPetugas.filter(s => s.open < 100).length;

                // Menggunakan 2 angka di belakang koma
                const persenSlsDikerjakan = parseFloat(((slsSudahDikerjakan / totalSlsPetugas) * 100).toFixed(2));
                const persenSlsOpen = parseFloat((100 - persenSlsDikerjakan).toFixed(2));

                return {
                    ...item,
                    // Timpa nilai status utama menjadi persentase untuk Recharts Stacked Bar
                    // Kita masukkan nilai persentase ini ke kolom 'approved' (atau 'submitted') sebagai visual realisasi
                    approved: persenSlsDikerjakan,
                    submitted: 0, draft: 0, rejected: 0, revoked: 0, edited: 0, edited_admin: 0, complete_admin: 0,
                    open: persenSlsOpen,
                    total_realisasi: persenSlsDikerjakan // Digunakan untuk sorting descending di bawah
                };
            }

            return item;
        });

        // 3. Sorting Descending (Tetap Pertahankan)
        if (viewModeTab === "PETUGAS") {
            updatedData = updatedData.sort((a, b) => {
                const realisasiA = parseFloat(a.total_realisasi) || 0;
                const realisasiB = parseFloat(b.total_realisasi) || 0;
                return realisasiB - realisasiA;
            });
        }

        return updatedData;
    }, [barChartData, includeDraft, viewModeTab, viewSlsPercentage, dataMonitoringWilayah.sls]);
    // Tambahkan useMemo baru ini di bawah processedBarChartData atau di atas baris Return JSX
    const processedPetugasData = useMemo(() => {
        // Ambil basis data petugas murni
        let dataPetugas = dataMonitoringWilayah.petugas.filter(p =>
            p.email !== "Tanpa Petugas" && p.total_target > 0
        );

        // Jika switch includeDraft MATI, kurangi total_realisasi dengan jumlah draft individu
        if (!includeDraft) {
            dataPetugas = dataPetugas.map(p => {
                const draftValue = parseFloat(p.draft) || 0;
                const originalRealisasi = parseFloat(p.total_realisasi) || 0;
                return {
                    ...p,
                    draft: 0,
                    total_realisasi: Math.max(0, originalRealisasi - draftValue)
                };
            });
        }

        // Filter berdasarkan wilayah kecamatan terpilih
        if (selectedKecTab !== "SEMUA") {
            dataPetugas = dataPetugas.filter(p => p.kodeKec === selectedKecTab);
        }

        return dataPetugas;
    }, [dataMonitoringWilayah.petugas, includeDraft, selectedKecTab]);
    // Membekukan elemen Barchart agar tidak terpengaruh re-render tidak perlu
    const memoizedBarChartElement = useMemo(() => (
        <BarChart
            data={processedBarChartData} // 👈 UBAH DI SINI (Ganti barChartData menjadi processedBarChartData)
            margin={{ bottom: 40, left: -15, right: 10, top: 20 }}
            barCategoryGap="25%"
        >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />

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
                    // 👈 UBAH DI SINI agar mengecek data yang sudah diproses
                    const itemData = processedBarChartData[payload.index];

                    let warnaTeks = "#475569";
                    let ketebalanTeks = 700;

                    if (viewModeTab === "PETUGAS" && itemData) {
                        const realisasi = itemData.total_realisasi || 0;

                        // 🟢 KONDISI BARU: Jika sedang melihat analisis persen SLS dan di atas 40%
                        if (viewSlsPercentage) {
                            if (realisasi > 40) {
                                warnaTeks = "#16a34a"; // Hijau Emerald (Emerald 600)
                                ketebalanTeks = 900;   // Sangat tebal
                            } else {
                                warnaTeks = "#475569"; // Warna slate normal
                                ketebalanTeks = 500;   // Ketebalan normal
                            }
                        } else {
                            // Logika nominal dokumen bawaan Anda sebelumnya
                            const target = nilaiTargetYAxis || 0;
                            if (realisasi < target) {
                                if (realisasi < (target / 2)) {
                                    warnaTeks = "#ef4444";
                                    ketebalanTeks = 900;
                                } else {
                                    warnaTeks = "#f97316";
                                    ketebalanTeks = 800;
                                }
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
                                fill={warnaTeks}
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
            />
// Di dalam memoizedBarChartElement, cari YAxis dan ubah domainnya:
            <YAxis
                stroke="#94a3b8"
                fontSize={9}
                tickLine={false}
                unit={unitSatuanYAxis}
                // MODIFIKASI DI SINI
                domain={(isPetugasMode && !viewSlsPercentage) ? [0, 'auto'] : [0, 100]}
                allowDataOverflow={!isPetugasMode || viewSlsPercentage}
            />

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

                        // Tentukan nominal target wilayah dari data grafik
                        const totalTargetMurni = parseInt(data.total_target || data.target || data.t || data.total) || 0;
                        const isPersenMode = viewModeTab !== "PETUGAS" && viewModeTab !== "SLS";

                        // Fungsi pembantu untuk mengekstrak Jumlah & Persen secara akurat
                        const dapatkanDetailNilai = (fieldKey) => {
                            let jumlahDokumen = 0;
                            let nilaiPersentase = 0;

                            // 🏃 Mode PETUGAS murni: Nilai grafik di sini adalah JUMLAH DOKUMEN asli
                            if (viewModeTab === "PETUGAS") {
                                if (!includeDraft && fieldKey === 'open') {
                                    const openAsli = parseFloat(data.open) || 0;
                                    const draftAsli = parseFloat(data.draft) || 0;
                                    jumlahDokumen = openAsli + draftAsli;
                                } else if (!includeDraft && fieldKey === 'draft') {
                                    jumlahDokumen = 0;
                                } else {
                                    jumlahDokumen = parseFloat(data[fieldKey]) || 0;
                                }
                                nilaiPersentase = totalTargetMurni > 0 ? (jumlahDokumen / totalTargetMurni) * 100 : 0;
                            }

                            // 🏠 Mode SLS: Nilai grafik berupa PERSENTASE, hitung balik ke JUMLAH DOKUMEN murni
                            else if (viewModeTab === "SLS") {
                                let persenStatus = parseFloat(data[fieldKey]) || 0;

                                if (!includeDraft && fieldKey === 'open') {
                                    const openPersen = parseFloat(data.open) || 0;
                                    const draftPersen = parseFloat(data.draft) || 0;
                                    persenStatus = openPersen + draftPersen;
                                } else if (!includeDraft && fieldKey === 'draft') {
                                    persenStatus = 0;
                                }

                                // Konversi dari persen kembali ke jumlah dokumen asli
                                jumlahDokumen = Math.round((persenStatus / 100) * totalTargetMurni);
                                nilaiPersentase = persenStatus;
                            }

                            // 📍 Mode KECAMATAN / DESA: Ambil dari cadangan dokumen murni (`_dokumen`)
                            else {
                                const keyDokumenAsli = `${fieldKey}_dokumen`;

                                if (!includeDraft && fieldKey === 'open') {
                                    const openAsli = parseFloat(data.open_dokumen) || 0;
                                    const draftAsli = parseFloat(data.draft_dokumen) || 0;
                                    jumlahDokumen = openAsli + draftAsli;
                                } else if (!includeDraft && fieldKey === 'draft') {
                                    jumlahDokumen = 0;
                                } else {
                                    jumlahDokumen = parseFloat(data[keyDokumenAsli]) || 0;
                                }
                                nilaiPersentase = totalTargetMurni > 0 ? (jumlahDokumen / totalTargetMurni) * 100 : 0;
                            }

                            return {
                                jumlah: jumlahDokumen.toLocaleString('id-ID'),
                                persen: nilaiPersentase.toFixed(1)
                            };
                        };

                        // Ekstrak data untuk masing-masing kategori status
                        const approved = dapatkanDetailNilai('approved');
                        const submitted = dapatkanDetailNilai('submitted');
                        const draft = dapatkanDetailNilai('draft');
                        const rejected = dapatkanDetailNilai('rejected');
                        const revoked = dapatkanDetailNilai('revoked');
                        const open = dapatkanDetailNilai('open');
                        const edited = dapatkanDetailNilai('edited');
                        const editedAdmin = dapatkanDetailNilai('edited_admin');
                        const completeAdmin = dapatkanDetailNilai('complete_admin');

                        return (
                            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xl text-[11px] space-y-1.5 font-sans min-w-[240px] z-50">
                                <div className="font-black text-slate-800 uppercase tracking-wide border-b border-slate-100 pb-1.5 mb-1 flex items-center gap-1">
                                    {viewModeTab === "PETUGAS" ? "🏃‍♂️" : viewModeTab === "SLS" ? "🏠" : "📍"} {data.nama_asli}
                                </div>
                                <div className="space-y-1 font-medium text-slate-500">
                                    {/* Target Utama Wilayah */}
                                    <div className="flex justify-between border-b border-slate-100 pb-1 mb-1 bg-slate-50/50 px-1 rounded">
                                        <span className="font-bold">Total Target:</span>
                                        <strong className="text-slate-800 font-mono">
                                            {totalTargetMurni > 0 ? totalTargetMurni.toLocaleString('id-ID') : '-'} Muatan
                                        </strong>
                                    </div>

                                    {/* Baris Data: Menampilkan "Jumlah Dok (Persen%)" */}
                                    <div className="flex justify-between items-center px-1">
                                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#10b981]"></span> Approved:</span>
                                        <span className="font-mono text-right text-emerald-600 font-black">{approved.jumlah} <span className="text-[10px] text-slate-400 font-normal">({approved.persen}%)</span></span>
                                    </div>
                                    <div className="flex justify-between items-center px-1">
                                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#3b82f6]"></span> Submitted:</span>
                                        <span className="font-mono text-right text-blue-600 font-black">{submitted.jumlah} <span className="text-[10px] text-slate-400 font-normal">({submitted.persen}%)</span></span>
                                    </div>
                                    <div className="flex justify-between items-center px-1">
                                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#f97316]"></span> Draft:</span>
                                        <span className="font-mono text-right text-orange-600 font-black">{draft.jumlah} <span className="text-[10px] text-slate-400 font-normal">({draft.persen}%)</span></span>
                                    </div>
                                    <div className="flex justify-between items-center px-1">
                                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#ef4444]"></span> Rejected:</span>
                                        <span className="font-mono text-right text-red-600 font-black">{rejected.jumlah} <span className="text-[10px] text-slate-400 font-normal">({rejected.persen}%)</span></span>
                                    </div>
                                    <div className="flex justify-between items-center px-1">
                                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#991b1b]"></span> Revoked:</span>
                                        <span className="font-mono text-right text-red-950 font-black">{revoked.jumlah} <span className="text-[10px] text-slate-400 font-normal">({revoked.persen}%)</span></span>
                                    </div>
                                    <div className="flex justify-between items-center px-1">
                                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#80ce9a]"></span> Edited Pengawas:</span>
                                        <span className="font-mono text-right text-emerald-700 font-black">{edited.jumlah} <span className="text-[10px] text-slate-400 font-normal">({edited.persen}%)</span></span>
                                    </div>
                                    <div className="flex justify-between items-center px-1">
                                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#954eb1]"></span> Edited Admin:</span>
                                        <span className="font-mono text-right text-purple-600 font-black">{editedAdmin.jumlah} <span className="text-[10px] text-slate-400 font-normal">({editedAdmin.persen}%)</span></span>
                                    </div>
                                    <div className="flex justify-between items-center px-1">
                                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#dc00d1]"></span> Complete Admin:</span>
                                        <span className="font-mono text-right text-purple-800 font-black">{completeAdmin.jumlah} <span className="text-[10px] text-slate-400 font-normal">({completeAdmin.persen}%)</span></span>
                                    </div>
                                    <div className="flex justify-between items-center px-1 border-t border-slate-100 pt-1 mt-1">
                                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#e2e8f0]"></span> Open:</span>
                                        <span className="font-mono text-right text-slate-500 font-black">{open.jumlah} <span className="text-[10px] text-slate-400 font-normal">({open.persen}%)</span></span>
                                    </div>
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
                                    // 🟢 Diubah menjadi toFixed(2) agar memunculkan 2 angka di belakang koma
                                    return totalProgres > 0 ? `${totalProgres.toFixed(0)}%` : "0.00%";
                                }
                            }}
                        />
                    )}
                </Bar>
            ))}
        </BarChart>
        // 👈 JANGAN LUPA menambahkan processedBarChartData ke dependency array di bawah ini
        // Di paling akhir memoizedBarChartElement, ubah menjadi:
    ), [processedBarChartData, viewModeTab, selectedKecTab, isPetugasMode, unitSatuanYAxis, formatSuffixTooltip, nilaiTargetYAxis, teksLabelTarget, HARI_KE, viewSlsPercentage]);
    const memoizedPmlChartElement = useMemo(() => (
        <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
                data={processedPmlChartData}
                margin={{ bottom: 40, left: -10, right: 10, top: 20 }}
                barCategoryGap="25%"
            >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />

                {/* X Axis: Nama PML */}
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
                        return (
                            <g transform={`translate(${x},${y})`}>
                                <text
                                    x={0} y={0} dy={10}
                                    textAnchor="end"
                                    transform="rotate(-45)"
                                    fill="#334155"
                                    style={{ fontWeight: 800, fontSize: '8px' }}
                                >
                                    {payload.value ? payload.value.toUpperCase() : ""}
                                </text>
                            </g>
                        );
                    }}
                />

                {/* Sumbu Y Kiri: Volume Dokumen Pemeriksaan */}
                <YAxis
                    yAxisId="left"
                    stroke="#64748b"
                    fontSize={9}
                    tickLine={false}
                    unit=" Dok"
                />

                {/* Sumbu Y Kanan: Persentase Reject Rate (%) */}
                <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke="#a855f7"
                    fontSize={9}
                    tickLine={false}
                    domain={[0, 100]}
                    unit="%"
                />

                {/* TOOLTIP DINAMIS DENGAN LABEL MODES */}
                <Tooltip
                    cursor={{ fill: '#f8fafc', opacity: 0.5 }}
                    content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            const labelMode = pmlTimeframeMode === "TODAY" ? "(Hari Ini)" : "(Total)";

                            return (
                                <div className="bg-slate-950 text-white p-3 rounded-xl shadow-2xl text-[11px] font-sans space-y-1 z-50 min-w-[200px]">
                                    <div className="font-black text-indigo-300 border-b border-slate-800 pb-1 uppercase">
                                        🔍 PML: {data.nama}
                                    </div>
                                    <div className="text-[10px] text-slate-400 font-bold uppercase">Kec. {data.kecamatan}</div>
                                    <div className="pt-1 space-y-1">
                                        <div className="flex justify-between text-emerald-400 font-bold">
                                            <span>Approve {labelMode}:</span>
                                            <span className="font-mono">+{data.approveVal} Dok</span>
                                        </div>
                                        <div className="flex justify-between text-rose-400 font-bold">
                                            <span>Reject {labelMode}:</span>
                                            <span className="font-mono">+{data.rejectVal} Dok</span>
                                        </div>
                                        <div className="flex justify-between text-blue-400 font-bold">
                                            <span>Antrean Diperiksa:</span>
                                            <span className="font-mono">{data.pendingPml} Dok</span>
                                        </div>
                                        <div className="flex justify-between text-purple-300 font-black border-t border-slate-800 pt-1 mt-1">
                                            <span>Reject Rate {labelMode}:</span>
                                            <span className="font-mono">{data.rejectRate}%</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        }
                        return null;
                    }}
                />

                {/* BAR STACKED DENGAN DATAKEY YANG SUDAH DISESUAIKAN */}
                <Bar yAxisId="left" dataKey="approveVal" stackId="pml" fill="#10b981" name="Approve" maxBarSize={30} />
                <Bar yAxisId="left" dataKey="rejectVal" stackId="pml" fill="#f43f5e" name="Reject" maxBarSize={30} />
                <Bar yAxisId="left" dataKey="pendingPml" stackId="pml" fill="#3b82f6" name="Pending Antrean" maxBarSize={30} radius={[4, 4, 0, 0]} />

                {/* LINE CHART REJECT RATE */}
                <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="rejectRate"
                    stroke="#a855f7"
                    strokeWidth={2.5}
                    dot={{ fill: '#a855f7', r: 3 }}
                    activeDot={{ r: 5, stroke: '#ffffff', strokeWidth: 2 }}
                    name="Reject Rate (%)"
                />
            </ComposedChart>
        </ResponsiveContainer>
    ), [processedPmlChartData, pmlTimeframeMode]);
    // ==========================================
    // PERBAIKAN LOGIKA: GARIS RATA-RATA BERDASARKAN KLIK & HOVER
    // ==========================================
    // ==========================================
    // FIX: RESET HOVER SAAT FILTER BERUBAH
    // ==========================================
    useEffect(() => {
        // Reset status hover ke null agar grafik kembali normal/tidak abu-abu
        if (typeof setHoveredTrend === 'function') {
            setHoveredTrend(null);
        }
    }, [selectedKecTab, viewModeTab, includeDraft, selectedPetugasEmail]);
    // Tambahkan state filter lain di dalam array dependency di atas jika ada
    const [tampilkanPrediksi, setTampilkanPrediksi] = useState(false);
    const memoizedAreaChartElement = useMemo(() => {
        // 1. Filter Petugas berdasarkan kecamatan yang dipilih dan kecualikan "Tanpa Petugas"
        const petugasFilterGaris = dataMonitoringWilayah.petugas.filter(p =>
            p.email !== "Tanpa Petugas" && (selectedKecTab === "SEMUA" || p.kodeKec === selectedKecTab)
        );

        const totalOpenKecamatan = petugasFilterGaris.reduce((sum, p) => sum + (p.open || 0), 0);

        // 2. Perhitungan Periode dan Sisa Hari Target Tren
        const TANGGAL_SELESAI_TREN = new Date("2026-08-31");
        const hariIni = new Date();
        hariIni.setHours(0, 0, 0, 0); // Reset time

        const selisihSisaHari = TANGGAL_SELESAI_TREN - hariIni;
        const SISA_HARI_TREN = selisihSisaHari > 0
            ? Math.floor(selisihSisaHari / (1000 * 60 * 60 * 24)) + 1
            : 1;

        // 3. Tentukan Key Nama Garis yang Sedang Aktif
        let keyNamaGarisAktif = trendKeys[0] || "";

        if (viewModeTab === "PETUGAS" || viewModeTab === "SLS") {
            if (hoveredTrend) {
                keyNamaGarisAktif = hoveredTrend;
            } else if (selectedPetugasEmail) {
                const objekPetugasTerpilih = dataMonitoringWilayah.petugas.find(p => p.email === selectedPetugasEmail);
                if (objekPetugasTerpilih) {
                    keyNamaGarisAktif = objekPetugasTerpilih.nama_asli || objekPetugasTerpilih.nama;
                }
            }
        }

        // 4. Dapatkan sisa open spesifik milik petugas/wilayah yang aktif
        let openTargetDinamis = totalOpenKecamatan;

        if ((viewModeTab === "PETUGAS" || viewModeTab === "SLS") && keyNamaGarisAktif) {
            const objekPetugasTerpilih = dataMonitoringWilayah.petugas.find(p => {
                const namaMurni = (p.nama_asli || p.nama || "").toLowerCase().trim();
                return namaMurni === keyNamaGarisAktif.toLowerCase().trim() || p.email === selectedPetugasEmail;
            });

            if (objekPetugasTerpilih) {
                openTargetDinamis = includeDraft
                    ? (objekPetugasTerpilih.open || 0)
                    : ((objekPetugasTerpilih.open || 0) + (objekPetugasTerpilih.draft || 0));
            }
        }

        // 5. Hitung Target Harian Garis (Beban Individu / Sisa Hari)


        // 6. Kondisi Pembatas Rata-Rata Harian
        const janganTampilkanRataRata = viewModeTab === "PETUGAS" && !selectedPetugasEmail && !hoveredTrend;

        // 7. Filter Data Berdasarkan Mode 'Include Draft' untuk Rata-Rata
        const dataDiFilterUntukRataRata = chartTrenData.filter(item => {
            if (!includeDraft) {
                return new Date(item.tanggalRaw) >= new Date("2026-07-05");
            }
            return true;
        });

        const jumlahHariData = dataDiFilterUntukRataRata.length || 1;

        // 8. Hitung Rata-Rata Harian Petugas Terpilih
        const totalDokumenKirimPeriode = dataDiFilterUntukRataRata.reduce((sum, item) => {
            const targetKeyMurni = Object.keys(item).find(
                k => k.toLowerCase().trim() === keyNamaGarisAktif.toLowerCase().trim()
            );
            const nilaiDokumen = targetKeyMurni ? (parseFloat(item[targetKeyMurni]) || 0) : 0;
            return sum + nilaiDokumen;
        }, 0);

        const nilaiRataRataHarian = parseFloat((totalDokumenKirimPeriode / jumlahHariData).toFixed(1));
        const targetHarianGaris = parseFloat((openTargetDinamis + totalDokumenKirimPeriode) / (SISA_HARI_TREN + jumlahHariData)).toFixed(2);
        // =======================================================
        // 🌟 DETEKSI METRIK ESTIMASI
        // =======================================================
        const isSkupPetugasIndividu = (viewModeTab === "PETUGAS" || viewModeTab === "SLS") &&
            (selectedPetugasEmail || hoveredTrend);

        let finalMetrikEstimasi = { ...metrikEstimasiProyek };

        if (isSkupPetugasIndividu) {
            let sisaHariDibutuhkanMicro = nilaiRataRataHarian > 0 ? Math.ceil(openTargetDinamis / nilaiRataRataHarian) : 0;
            let tanggalPrediksiMicro = "-";
            let isTerlambatMicro = false;
            let selisihDariDeadlineMicro = 0;

            if (nilaiRataRataHarian > 0 && openTargetDinamis > 0) {
                const targetTanggalSelesai = new Date();
                targetTanggalSelesai.setDate(targetTanggalSelesai.getDate() + sisaHariDibutuhkanMicro);

                tanggalPrediksiMicro = targetTanggalSelesai.toLocaleDateString('id-ID', {
                    day: 'numeric', month: 'short', year: 'numeric'
                });

                if (targetTanggalSelesai > TANGGAL_SELESAI_TREN) {
                    isTerlambatMicro = true;
                    const selisihWaktu = targetTanggalSelesai - TANGGAL_SELESAI_TREN;
                    selisihDariDeadlineMicro = Math.ceil(selisihWaktu / (1000 * 60 * 60 * 24));
                }
            } else if (openTargetDinamis === 0) {
                tanggalPrediksiMicro = "SELESAI";
                isTerlambatMicro = false;
            } else {
                tanggalPrediksiMicro = "STAGNAN (0 DOK/HARI)";
                isTerlambatMicro = true;
                selisihDariDeadlineMicro = SISA_HARI_TREN;
            }

            finalMetrikEstimasi = {
                tanggalPrediksi: tanggalPrediksiMicro,
                isTerlambat: isTerlambatMicro,
                selisihDariDeadline: selisihDariDeadlineMicro,
                sisaHariDibutuhkan: sisaHariDibutuhkanMicro,
                rataKirimHarian: nilaiRataRataHarian,
                lajuPrediktif: nilaiRataRataHarian,
                totalSisaOpenAktif: openTargetDinamis
            };
        }

        // GANTI BLOK NOMOR 8 DI DALAM useMemo GRAFIK ANDA DENGAN INI:

        // =======================================================
        // 🌟 GENERATE DATA PROYEKSI HARIAN GRAFIK (FIXED BUG)
        // =======================================================
        let gabunganChartData = chartTrenData.map(d => ({
            ...d,
            "PREDIKSI JALAN HARIAN": undefined
        }));

        // Cukup ambil array yang sudah dihitung oleh metrik utama
        if (tampilkanPrediksi && metrikEstimasiProyek.arrayProyeksi && metrikEstimasiProyek.arrayProyeksi.length > 0) {

            // Sambungkan titik ujung data aktual hari ini, dengan awal titik proyeksi besok (agar garis tidak putus)
            if (gabunganChartData.length > 0) {
                const dataTerakhir = gabunganChartData[gabunganChartData.length - 1];
                dataTerakhir["PREDIKSI JALAN HARIAN"] = (dataTerakhir[keyNamaGarisAktif] !== undefined)
                    ? dataTerakhir[keyNamaGarisAktif]
                    : metrikEstimasiProyek.rataKirimHarian;
            }

            // GABUNGKAN
            gabunganChartData = [...gabunganChartData, ...metrikEstimasiProyek.arrayProyeksi];
        }
        // 9. Cari Nilai Tertinggi Y-Axis
        const nilaiMaksimalData = gabunganChartData.reduce((max, item) => {
            let maxInRow = 0;
            trendKeys.forEach(key => {
                if (item[key] > maxInRow) maxInRow = item[key];
            });
            if (item["PREDIKSI JALAN HARIAN"] > maxInRow) maxInRow = item["PREDIKSI JALAN HARIAN"];
            return maxInRow > max ? maxInRow : max;
        }, 0);

        const labelTanggalAwal = gabunganChartData.length > 0 ? gabunganChartData[0].label : undefined;
        const objekEmpatJuli = gabunganChartData.find(d => d.tanggalRaw === "2026-07-04");
        const labelEmpatJuli = objekEmpatJuli ? objekEmpatJuli.label : undefined;
        const batasAtasYAxis = Math.ceil(Math.max(nilaiMaksimalData, targetHarianGaris, nilaiRataRataHarian) * 1.15);

        return (
            <AreaChart data={gabunganChartData} margin={{ left: -20, right: 10, bottom: 5, top: 15 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />

                {/* 🌟 PERBAIKAN: Tambahkan `minTickGap={25}` agar teks tanggal otomatis menyembunyikan diri dengan rapi saat grafik melebar ke samping */}
                <XAxis
                    dataKey="label"
                    stroke="#94a3b8"
                    fontSize={9}
                    tickLine={false}
                    tick={{ fontWeight: 600 }}
                    minTickGap={25}
                />
                <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} domain={[0, batasAtasYAxis]} />

                {!includeDraft && labelTanggalAwal && labelEmpatJuli && (
                    <ReferenceArea
                        x1={labelTanggalAwal} x2={labelEmpatJuli}
                        fill="#ef4444" fillOpacity={0.07} stroke="#fca5a5" strokeDasharray="3 3" strokeWidth={1}
                        label={{
                            value: "⚠️ DATA KIRIM HARIAN TANPA DRAFT BELUM DIREKAM (SEBELUM 5 JULI)",
                            position: "insideBottomLeft", offset: 15, fill: "#b91c1c", fontSize: 9, fontWeight: 900,
                            style: { letterSpacing: '0.5px' }
                        }}
                    />
                )}

                <ReferenceLine
                    y={targetHarianGaris}
                    stroke="#ef4444" strokeWidth={2} strokeDasharray="4 4" className="z-40"
                    label={{
                        value: `⚠️ TARGET MINIMAL: +${targetHarianGaris.toLocaleString('id-ID')} KIRIM / HARI`,
                        position: 'insideLeftTop', offset: 10, fill: '#b91c1c', fontSize: 10, fontWeight: 900,
                        style: { textShadow: '2px 2px 0px #fff, -2px -2px 0px #fff', letterSpacing: '0.5px' }
                    }}
                />

                {!janganTampilkanRataRata && nilaiRataRataHarian > 0 && (
                    <ReferenceLine
                        y={nilaiRataRataHarian}
                        stroke="#3b82f6" strokeWidth={2} strokeDasharray="3 3" className="z-40"
                        label={{
                            value: `📊 RATA-RATA (14 HARI) ${keyNamaGarisAktif.toUpperCase()}: +${nilaiRataRataHarian.toLocaleString('id-ID')} KIRIM / HARI`,
                            position: 'insideRightTop', offset: 10, fill: '#1d4ed8', fontSize: 10, fontWeight: 900,
                            style: { textShadow: '2px 2px 0px #fff, -2px -2px 0px #fff', letterSpacing: '0.5px' }
                        }}
                    />
                )}

                <Tooltip
                    shared={true}
                    wrapperStyle={{ pointerEvents: 'auto' }}
                    content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                            const filteredPayload = hoveredTrend ? payload.filter(entry => entry.name === hoveredTrend || entry.name === "PREDIKSI JALAN HARIAN") : payload;
                            if (filteredPayload.length === 0) return null;
                            const sortedPayload = [...filteredPayload].sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0));
                            return (
                                <div className="bg-slate-900 text-white p-3 rounded-xl text-[11px] font-mono shadow-xl border border-slate-800 min-w-[220px] max-w-[280px] z-50 flex flex-col select-text">
                                    <div className="font-sans font-black border-b border-slate-700 pb-1.5 mb-2 text-slate-400 flex justify-between">
                                        <span>Tanggal: {payload[0].payload.tanggalRaw}</span>
                                        {payload[0].payload.isProyeksi && <span className="text-amber-400 text-[9px] font-bold">PROYEKSI</span>}
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
                    let strokeColor = palette[index % palette.length];
                    if (keyName.includes("Dengan Draft")) strokeColor = "#3b82f6";
                    else if (keyName.includes("Tanpa Draft")) strokeColor = "#10b981";

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
                            fillOpacity={trendKeys.length > 2 ? 0 : isHovered ? 0.15 : 0.03}
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

                {tampilkanPrediksi && (
                    <Area
                        type="monotone"
                        dataKey="PREDIKSI JALAN HARIAN"
                        stroke="#f59e0b"
                        strokeWidth={3}
                        strokeDasharray="5 5"
                        fillOpacity={0.05}
                        fill="#f59e0b"
                        name="PERKIRAAN KIRIM HARIAN"
                    >
                        <LabelList
                            dataKey="PREDIKSI JALAN HARIAN"
                            content={<CustomLabelTren strokeColor="#f59e0b" isDimmed={false} />}
                        />
                    </Area>
                )}
            </AreaChart>
        );
    }, [chartTrenData, dataMonitoringWilayah.petugas, viewModeTab, selectedKecTab, trendKeys, hoveredTrend, includeDraft, selectedPetugasEmail, metrikEstimasiProyek, tampilkanPrediksi]);


    const handleDownloadSlsExcel = () => {
        const currentChartData = processedBarChartData;

        if (!currentChartData || currentChartData.length === 0) {
            alert("Tidak ada data yang bisa diexport saat ini.");
            return;
        }

        const formattedData = currentChartData.map((item, index) => {
            const totalTargetMurni = parseInt(item.total_target || item.t || 0) || 0;
            const isPersenMode = viewModeTab !== "PETUGAS" && viewModeTab !== "SLS";

            let approvedMurni = 0;
            let submittedMurni = 0;
            let draftMurni = 0;
            let rejectedMurni = 0;
            let revokedMurni = 0;
            let editedMurni = 0;
            let editedAdminMurni = 0;
            let completeAdminMurni = 0;
            let openMurni = 0;

            if (isPersenMode) {
                // 📍 Mode Kecamatan / Desa: Ambil dari cadangan dokumen murni mentah (Akurat 100%)
                approvedMurni = parseInt(item.approved_dokumen) || 0;
                submittedMurni = parseInt(item.submitted_dokumen) || 0;
                rejectedMurni = parseInt(item.rejected_dokumen) || 0;
                revokedMurni = parseInt(item.revoked_dokumen) || 0;
                editedMurni = parseInt(item.edited_dokumen) || 0;
                editedAdminMurni = parseInt(item.edited_admin_dokumen) || 0;
                completeAdminMurni = parseInt(item.complete_admin_dokumen) || 0;

                if (!includeDraft) {
                    draftMurni = 0;
                    // Jika switch draft mati, jumlah open murni adalah open asli + draft asli
                    openMurni = (parseInt(item.open_dokumen) || 0) + (parseInt(item.draft_dokumen) || 0);
                } else {
                    draftMurni = parseInt(item.draft_dokumen) || 0;
                    openMurni = parseInt(item.open_dokumen) || 0;
                }
            } else {
                // 🏃 Mode Petugas / SLS: Nilai pada item sudah dalam bentuk nominal dokumen riil
                approvedMurni = parseInt(item.approved) || 0;
                submittedMurni = parseInt(item.submitted) || 0;
                rejectedMurni = parseInt(item.rejected) || 0;
                revokedMurni = parseInt(item.revoked) || 0;
                editedMurni = parseInt(item.edited) || 0;
                editedAdminMurni = parseInt(item.edited_admin) || 0;
                completeAdminMurni = parseInt(item.complete_admin) || 0;

                if (!includeDraft) {
                    draftMurni = 0;
                    openMurni = parseInt(item.open) || 0; // Pada useMemo processedBarChartData, nilai item.open sudah ditambahkan dengan draft otomatis
                } else {
                    draftMurni = parseInt(item.draft) || 0;
                    openMurni = parseInt(item.open) || 0;
                }
            }

            // Total Realisasi adalah semua beban target dikurangi item yang masih OPEN
            const totalRealisasi = Math.max(0, totalTargetMurni - openMurni);
            const persentaseCapaian = totalTargetMurni > 0
                ? parseFloat(((totalRealisasi / totalTargetMurni) * 100).toFixed(2))
                : 0.00;

            const row = {
                "No": index + 1,
                "Nama Wilayah / Petugas": item.nama_asli || item.nama,
            };

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

            // Mapping Kolom Excel yang telah Disesuaikan & Dilengkapi
            row["Approved PML"] = approvedMurni;
            row["Submitted"] = submittedMurni;
            row["Draft"] = draftMurni;
            row["Rejected"] = rejectedMurni;
            row["Revoked"] = revokedMurni;
            row["Edited Pengawas"] = editedMurni;
            row["Edited Admin Kabupaten"] = editedAdminMurni;
            row["Complete Admin Kabupaten"] = completeAdminMurni;
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
        const namaFileExcel = `VOLUME_PROGRESS_${viewModeTab}_${namaWilayahFile}_${new Date().toISOString().slice(0, 10)}.xlsx`;

        XLSX.writeFile(workbook, namaFileExcel);
    };

    // ⚡ TAMBAH KAN FUNGSI INI DI AREA ACTION FUNCTIONS (DI BAWAH handleDownloadSlsExcel)
    const handleExportAllSlsKabupatenExcel = () => {
        if (!rawData || rawData.length === 0) {
            alert("Tidak ada data mentah yang dapat diexport saat ini.");
            return;
        }

        // 1. Urutkan rawData berdasarkan idsubsls secara ascending
        const sortedRawData = [...rawData].sort((a, b) => {
            const idA = a.idsubsls ? a.idsubsls.toString() : "";
            const idB = b.idsubsls ? b.idsubsls.toString() : "";
            return idA.localeCompare(idB, undefined, { numeric: true });
        });

        // 2. Petakan data ke format kolom yang diinginkan
        const formattedData = sortedRawData.map((row, index) => {
            const relMuatan = row.muatan_sls || {};
            const relPetugas = relMuatan.petugas || {};

            const s_submitted = parseInt(row.submitted_pencacah) || 0;
            const s_draft = parseInt(row.draft) || 0;
            const s_rejected = parseInt(row.rejected_pengawas) || 0;
            const s_revoked = parseInt(row.revoked_pengawas) || 0;
            const s_approved = parseInt(row.approved_pengawas) || 0;
            const s_edited = parseInt(row.edited_pengawas) || 0;
            const s_edited_admin = parseInt(row.edited_admin_kabupaten) || 0;
            const s_complete_admin = parseInt(row.complete_admin_kabupaten) || 0;
            const s_open = parseInt(row.open) || 0;

            const totalTargetMurni = parseInt(row.total) ||
                (s_submitted + s_draft + s_rejected + s_revoked + s_approved + s_edited + s_open + s_edited_admin + s_complete_admin);

            // Proteksi opsi includeDraft
            let finalDraft = s_draft;
            let finalOpen = s_open;
            if (!includeDraft) {
                finalDraft = 0;
                finalOpen = s_open + s_draft;
            }

            const totalRealisasi = Math.max(0, totalTargetMurni - finalOpen);
            const persentaseCapaian = totalTargetMurni > 0
                ? parseFloat(((totalRealisasi / totalTargetMurni) * 100).toFixed(2))
                : 0.00;

            // Identifikasi Nama PCL (Petugas)
            const emailPclClean = relMuatan.petugas_id ? relMuatan.petugas_id.toLowerCase().trim() : "tanpa petugas";
            const namaPcl = emailPclClean === "tanpa petugas"
                ? "Tanpa Petugas"
                : (staffLookup[emailPclClean] || relMuatan.petugas_id);

            // Identifikasi Nama PML (Pengawas)
            const emailPmlClean = relPetugas.id_pml_atasan ? relPetugas.id_pml_atasan.toLowerCase().trim() : "tanpa pengawas";
            const namaPml = emailPmlClean === "tanpa pengawas"
                ? "Tanpa Pengawas"
                : (staffLookup[emailPmlClean] || relPetugas.id_pml_atasan);

            // Struktur kolom baru sesuai request Anda
            return {
                "No": index + 1,
                "Kecamatan": row.kecamatan || relMuatan.nmkec || "Unknown",
                "Desa": row.nama_desa || relMuatan.nmdesa || "Unknown",
                "Nama SLS": row.nama_rt_dusun || relMuatan.nmsls || row.idsubsls,
                "ID SLS": row.idsubsls || "-",
                "Nama PCL": namaPcl,
                "Nama PML": namaPml,
                // Kolom dokumen di bawah ini urutannya tetap sama
                "Approved PML": s_approved,
                "Submitted": s_submitted,
                "Draft": finalDraft,
                "Rejected": s_rejected,
                "Revoked": s_revoked,
                "Edited Pengawas": s_edited,
                "Edited Admin Kabupaten": s_edited_admin,
                "Complete Admin Kabupaten": s_complete_admin,
                "Open": finalOpen,
                "Total Target": totalTargetMurni,
                "Total Realisasi": totalRealisasi,
                "Persentase Capaian (%)": persentaseCapaian
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(formattedData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Data SLS Se-Kabupaten");

        const namaFileExcel = `ALL_SLS_SORTED_KAB_BOYOLALI_${new Date().toISOString().slice(0, 10)}.xlsx`;
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
        p.email !== "Tanpa Petugas" && p.total_target > 0 && (selectedKecTab === "SEMUA" || p.kodeKec === selectedKecTab)
    );

    const limitPetugas = selectedKecTab === "SEMUA" ? 20 : 10;

    // Urutkan ulang secara Descending untuk TOP PERFORMER
    const topPerformers = [...processedPetugasData]
        .sort((a, b) => b.total_realisasi - a.total_realisasi)
        .slice(0, limitPetugas);

    // Urutkan ulang secara Ascending untuk BOTTOM PERFORMER
    const bottomPerformers = [...processedPetugasData]
        .sort((a, b) => a.total_realisasi - b.total_realisasi)
        .slice(0, limitPetugas);

    // ================= MODIFIKASI DIMULAI DI SINI =================
    // 1. Ambil nilai draft dan open mentah terlebih dahulu
    const rawDraft = dataMonitoringWilayah.muatanStatus.draft || 0;
    const rawOpen = dataMonitoringWilayah.muatanStatus.open || 0;

    // 2. Tentukan nilai final draft & open berdasarkan switch includeDraft
    const finalDraft = includeDraft ? rawDraft : 0;
    const finalOpen = includeDraft ? rawOpen : rawOpen + rawDraft; // Pindahkan draft ke open jika switch OFF

    const dataPieStatus = [
        { name: "SUBMITTED BY Pencacah", value: dataMonitoringWilayah.muatanStatus.submitted, color: "#3b82f6" },
        { name: "DRAFT", value: finalDraft, color: "#f97316" }, // 🟢 Menggunakan nilai final
        { name: "REJECTED BY Pengawas", value: dataMonitoringWilayah.muatanStatus.rejected, color: "#ef4444" },
        { name: "REVOKED BY Pengawas", value: dataMonitoringWilayah.muatanStatus.revoked, color: "#991b1b" },
        { name: "APPROVED BY Pengawas", value: dataMonitoringWilayah.muatanStatus.approved, color: "#10b981" },
        { name: "EDITED BY Pengawas", value: dataMonitoringWilayah.muatanStatus.edited, color: "#9af788" },
        { name: "EDITED BY Admin", value: dataMonitoringWilayah.muatanStatus.edited_admin, color: "#e75ad4" },
        { name: "COMPLETE BY Admin", value: dataMonitoringWilayah.muatanStatus.complete_admin, color: "#d400ca" },

        { name: "OPEN", value: finalOpen, color: "#e2e8f0" } // 🟢 Menggunakan nilai final
    ].filter(item => item.value > 0);
    // ==============================================================

    // Total seluruh muatan akan selalu tetap karena draft dipindahkan ke open
    const totalSeluruhMuatan = dataPieStatus.reduce((sum, item) => sum + item.value, 0);

    // Total tanpa open otomatis berkurang jika draft dinilai 0 (karena draft tidak ikut dihitung di sini saat switch OFF)
    const totalTanpaOpen = dataPieStatus.filter(item => item.name !== "OPEN").reduce((sum, item) => sum + item.value, 0);

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

                    {/* FILTRASI KECAMATAN */}
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider whitespace-nowrap">Kecamatan:</label>
                        <select
                            value={selectedKecTab}
                            // 🔒 Kunci pilihan jika user adalah PML
                            disabled={profile?.role === 'pml'}
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
                            className={`bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full sm:w-56 ${profile?.role === 'pml' ? 'cursor-not-allowed opacity-80 bg-slate-100' : 'cursor-pointer'
                                }`}
                        >
                            {/* 🔒 Sembunyikan opsi ALL Kabupaten untuk PML */}
                            {profile?.role !== 'pml' && (
                                <option value="SEMUA">📊 KABUPATEN BOYOLALI (ALL)</option>
                            )}
                            {dataMonitoringWilayah.kecamatan.map((kec) => (
                                <option key={kec.kodeKec} value={kec.kodeKec}>
                                    {kec.kodeKec} - {kec.nama_asli}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* FILTRASI PENGAWAS (PML) */}
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

                {/* METADATA SYNC STATUS */}
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

            {/* GRID UTAMA CRITICAL MONITORING (5 KOLOM) */}
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
                                    if (logPetugasPaging[targetDate] === undefined || logPetugasPaging[dateSebelumnya] === undefined) return 0;
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
                        <span className="text-xs text-slate-400 font-sans font-bold">Orang</span>
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
                                    if (logPetugasPaging[targetDate] === undefined || logPetugasPaging[dateSebelumnya] === undefined) return 0;
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
                        <span className="text-xs text-slate-400 font-sans font-bold">Orang</span>
                    </div>
                    <p className="text-[8px] text-slate-400 mt-1 font-bold">Produktivitas 3 hari terakhir di bawah 10 dokumen</p>
                </div>

                {/* 3. CARD BARU: PENGAWAS (PML) BERMASALAH */}
                {(() => {
                    const pmlMap = {};

                    dataMonitoringWilayah.petugas.forEach(p => {
                        if (p.email === "Tanpa Petugas") return;
                        const pmlKey = p.emailPml || "tanpa pengawas";

                        if (!pmlMap[pmlKey]) {
                            pmlMap[pmlKey] = {
                                emailPml: pmlKey,
                                namaPml: staffLookup[pmlKey] || (pmlKey === "tanpa pengawas" ? "Tanpa Pengawas" : pmlKey),
                                kecamatan: p.namaKec || "-",
                                jmlMacet: 0,
                                jmlMelambat: 0
                            };
                        }

                        if (criticalPcl.macet.includes(p.email)) pmlMap[pmlKey].jmlMacet += 1;
                        if (criticalPcl.melambat.includes(p.email)) pmlMap[pmlKey].jmlMelambat += 1;
                    });

                    const listPmlBermasalah = Object.values(pmlMap).filter(pml => pml.jmlMacet > 0 || pml.jmlMelambat > 0);
                    listPmlBermasalah.sort((a, b) => (b.jmlMacet + b.jmlMelambat) - (a.jmlMacet + a.jmlMelambat));
                    const totalPmlBermasalah = listPmlBermasalah.length;

                    return (
                        <div
                            onClick={() => {
                                if (totalPmlBermasalah === 0) return;

                                const formatUntukModal = listPmlBermasalah.map(item => ({
                                    nama: item.namaPml,
                                    emailPml: item.emailPml,
                                    pengawas: "PENGONTROL WILAYAH",
                                    kecamatan: item.kecamatan,
                                    h3: item.jmlMacet,
                                    h2: item.jmlMelambat,
                                    h1: item.jmlMacet + item.jmlMelambat,
                                    totalRealisasi: item.jmlMacet + item.jmlMelambat,
                                    target: 0,
                                    isModePml: true
                                }));

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
                                <span className="text-xs text-slate-400 font-sans font-bold">Tim PML</span>
                            </div>
                            <p className="text-[8px] text-slate-400 mt-1 font-bold">Tim yang memiliki beban petugas macet / melambat</p>
                        </div>
                    );
                })()}
                {/* 1. CARD PML APPROVE TIDAK WAJAR (SPAM HARIAN) */}
                {(() => {
                    const pmlSpam = (dataMonitoringWilayah.pmlPerformance || []).filter(p => p.approveHariIni >= 100 || (p.totalApprove >= 40 && Number(p.rejectRate) === 0));
                    const totalSpam = pmlSpam.length;

                    return (
                        <div
                            onClick={() => {
                                if (totalSpam === 0) return;
                                setCriticalCurrentPage(1);
                                setCriticalModalConfig({
                                    show: true,
                                    type: "pml_anomali_spam",
                                    title: "🚨 Daftar PML Approve CEPAT (Approve > 100/hr atau approve > 40 dengan rate reject 0)",
                                    data: pmlSpam
                                });
                            }}
                            className={`bg-white border-l-4 border-rose-600 p-4 rounded-2xl shadow-xs transition-all duration-200 select-none ${totalSpam > 0 ? 'cursor-pointer hover:bg-rose-50/40 active:scale-[0.99]' : ''}`}
                        >
                            <div className="text-[9px] font-black uppercase text-slate-400 tracking-wider">PML Approve Cepat</div>
                            <div className="text-2xl font-mono font-black text-rose-600 mt-1 flex items-baseline gap-1">
                                {totalSpam}
                                <span className="text-xs text-slate-400 font-sans font-bold">PML</span>
                            </div>
                            <p className="text-[8px] text-slate-400 mt-1 font-bold">Approve &gt; 100 dok/hari</p>
                        </div>
                    );
                })()}

                {/* 2. CARD PML PASIF (0 PERIKSA & ANTREAN ADA) */}
                {(() => {
                    const pmlPasif = (dataMonitoringWilayah.pmlPerformance || []).filter(p => p.approveHariIni + p.rejectHariIni < 5 && p.pendingPml > 20);
                    const totalPasif = pmlPasif.length;

                    return (
                        <div
                            onClick={() => {
                                if (totalPasif === 0) return;
                                setCriticalCurrentPage(1);
                                setCriticalModalConfig({
                                    show: true,
                                    type: "pml_pasif",
                                    title: "⚠️ Daftar PML Pasif (Kurang dari 5 Periksa Hari Ini & Antrean PPL Menumpuk)",
                                    data: pmlPasif
                                });
                            }}
                            className={`bg-white border-l-4 border-amber-500 p-4 rounded-2xl shadow-xs transition-all duration-200 select-none ${totalPasif > 0 ? 'cursor-pointer hover:bg-amber-50/40 active:scale-[0.99]' : ''}`}
                        >
                            <div className="text-[9px] font-black uppercase text-slate-400 tracking-wider">PML Pasif Hari Ini</div>
                            <div className="text-2xl font-mono font-black text-amber-600 mt-1 flex items-baseline gap-1">
                                {totalPasif}
                                <span className="text-xs text-slate-400 font-sans font-bold">PML</span>
                            </div>
                            <p className="text-[8px] text-slate-400 mt-1 font-bold">Antrean Periksa &gt; 20 Dok, Tapi Periksa Harian &lt; 5</p>
                        </div>
                    );
                })()}

            </div>

            <SmartAlertBanner />
            {/* BARIS GRAPH UTAMA: GRAFIK BATANG & REKAP BULAT */}
            <div className="bg-white p-5 border border-slate-200 rounded-3xl shadow-sm">

                {/* HEADER UTAMA: Judul & Navigasi Utama + Switcher Mode Dashboard */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 min-h-[40px]">
                    <div>
                        {/* SWITCH MODE DASHBOARD: PROGRESS PCL VS KUALITAS PML */}
                        <div className="flex bg-slate-100 p-1 rounded-2xl w-fit border border-slate-200/80 mb-2 shadow-inner">
                            <button
                                type="button"
                                onClick={() => setDashboardMode("PCL")}
                                className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all cursor-pointer ${dashboardMode === "PCL"
                                        ? "bg-white text-indigo-600 shadow-xs"
                                        : "text-slate-400 hover:text-slate-600"
                                    }`}
                            >
                                🏃‍♂️ Progress Lapangan (PPL)
                            </button>
                            <button
                                type="button"
                                onClick={() => setDashboardMode("PML")}
                                className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all cursor-pointer ${dashboardMode === "PML"
                                        ? "bg-white text-purple-600 shadow-xs"
                                        : "text-slate-400 hover:text-slate-600"
                                    }`}
                            >
                                🔍 Progress Pemeriksaan (PML)
                            </button>
                        </div>

                        <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                            {dashboardMode === "PML"
                                ? "Beban Antrean & Kualitas Pemeriksaan Pengawas Lapangan (PML)"
                                : selectedPetugasEmail
                                    ? `Capaian Lapangan Petugas: ${selectedPetugas} - Per SLS`
                                    : selectedPml !== "SEMUA"
                                        ? `Capaian Tim Pengawas: ${staffLookup[selectedPml] || selectedPml} (Per Petugas)`
                                        : selectedKecTab === "SEMUA"
                                            ? "Capaian Realisasi Lapangan Kabupaten (Per Kecamatan)"
                                            : `Capaian Realisasi Lapangan Kec. ${namaKecamatanTerpilihText} (${viewModeTab === "DESA" ? "Per Desa" : "Per Petugas"})`
                            }
                        </h3>

                        {/* BREADCRUMB INDICATOR HIERARKI WILAYAH */}
                        {dashboardMode === "PCL" && (
                            <div className="flex items-center gap-1.5 mt-1 text-[10px] text-slate-400 font-bold uppercase">
                                <span>Kabupaten</span>
                                {selectedKecTab !== "SEMUA" && <span>/ Kec. {namaKecamatanTerpilihText}</span>}
                                {selectedPetugasEmail && <span>/ Petugas: {selectedPetugas}</span>}
                                <span className="text-indigo-600 font-black">({viewModeTab})</span>
                            </div>
                        )}
                    </div>

                    {/* KONTROL NAVIGASI KANAN */}
                    <div className="flex flex-wrap items-center gap-3 self-end sm:self-auto min-h-9">
                        {dashboardMode === "PCL" && selectedKecTab !== "SEMUA" && !selectedPetugasEmail && selectedPml === "SEMUA" && (
                            <div className="bg-slate-100 p-1 rounded-xl flex gap-1 border border-slate-200/60 shadow-inner">
                                <button
                                    onClick={() => { setViewModeTab("DESA"); setSelectedDesaCode(null); }}
                                    className={`text-[9px] font-black px-3 py-1.5 rounded-lg transition-all uppercase tracking-wide cursor-pointer ${viewModeTab === "DESA" ? "bg-white text-slate-800 shadow-sm" : "text-slate-400 hover:text-slate-600 hover:bg-slate-200/50"}`}
                                >
                                    📍 Per Desa
                                </button>
                                <button
                                    onClick={() => setViewModeTab("PETUGAS")}
                                    className={`text-[9px] font-black px-3 py-1.5 rounded-lg transition-all uppercase tracking-wide cursor-pointer ${viewModeTab === "PETUGAS" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400 hover:text-slate-600 hover:bg-slate-200/50"}`}
                                >
                                    🏃‍♂️ Per Petugas
                                </button>
                            </div>
                        )}

                        {dashboardMode === "PCL" && (selectedKecTab !== "SEMUA" || selectedPml !== "SEMUA") && (
                            <button
                                onClick={() => {
                                    if (viewModeTab === "SLS") {
                                        if (selectedPetugasEmail) {
                                            setViewModeTab("PETUGAS");
                                            setSelectedPetugasEmail(null);
                                            setSelectedPetugas(null);
                                        } else {
                                            setViewModeTab("PETUGAS");
                                            setSelectedDesaCode(null);
                                        }
                                    } else {
                                        if (profile?.role !== 'pml') {
                                            setSelectedKecTab("SEMUA");
                                            setSelectedKecamatan(null);
                                            setSelectedPml("SEMUA");
                                            setSelectedPetugas(null);
                                            setSelectedPetugasEmail(null);
                                            setViewModeTab("DESA");
                                        } else {
                                            setViewModeTab("PETUGAS");
                                            setSelectedDesaCode(null);
                                            setSelectedPetugas(null);
                                            setSelectedPetugasEmail(null);
                                        }
                                    }
                                }}
                                className="bg-slate-800 hover:bg-slate-900 text-white text-[9px] font-black px-4 py-1.5 rounded-xl transition-all uppercase tracking-wider shadow-sm flex items-center gap-1 cursor-pointer"
                            >
                                ← Kembali
                            </button>
                        )}
                    </div>
                </div>
                {/* AREA LEGENDA UTAMA (KONDISIONAL SESUAI MODE ACTIVE) */}
                {dashboardMode === "PCL" ? (
                    /* 1. LEGENDA KINERJA PCL (SAMA SEPERTI SEBELUMNYA) */
                    <div className="bg-slate-50 border border-slate-200/60 p-3 rounded-2xl mb-6 text-[10px]">
                        {/* BARIS 1: Daftar Nilai & Warna Status Utama */}
                        <div className="flex items-center gap-2 overflow-x-auto pb-2.5 border-b border-slate-200/50 scrollbar-none">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider mr-1 shrink-0">Legenda Status:</span>
                            {susunanBarStatus.map((b) => {
                                let totalKategori = 0;

                                if (b.key === 'submitted') totalKategori = dataMonitoringWilayah.muatanStatus.submitted || 0;
                                else if (b.key === 'draft') totalKategori = finalDraft;
                                else if (b.key === 'rejected') totalKategori = dataMonitoringWilayah.muatanStatus.rejected || 0;
                                else if (b.key === 'revoked') totalKategori = dataMonitoringWilayah.muatanStatus.revoked || 0;
                                else if (b.key === 'approved') totalKategori = dataMonitoringWilayah.muatanStatus.approved || 0;
                                else if (b.key === 'edited') totalKategori = dataMonitoringWilayah.muatanStatus.edited || 0;
                                else if (b.key === 'edited_admin') totalKategori = dataMonitoringWilayah.muatanStatus.edited_admin || 0;
                                else if (b.key === 'complete_admin') totalKategori = dataMonitoringWilayah.muatanStatus.complete_admin || 0;
                                else if (b.key === 'open') totalKategori = finalOpen;

                                const persenKategori = totalSeluruhMuatan > 0 ? ((totalKategori / totalSeluruhMuatan) * 100).toFixed(2) : "0.00";

                                return (
                                    <div key={b.key} className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-xl border border-slate-200/60 shadow-2xs text-[10px] shrink-0">
                                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: b.fill }}></span>
                                        <span className="font-bold text-slate-500 uppercase text-[9px]">
                                            {b.label.toUpperCase().replace(" BY PENCACAH", "").replace(" BY PENGAWAS", "").replace("SUBMITTED ", "").replace(" BY", "").replace(" KABUPATEN", "")}
                                        </span>
                                        <span className="font-mono font-black text-slate-800 border-l border-slate-200 pl-1.5 ml-0.5">
                                            {totalKategori.toLocaleString('id-ID')} <span className="text-[9px] font-sans font-bold text-slate-600 ml-0.5">({persenKategori}%)</span>
                                        </span>
                                    </div>
                                );
                            })}
                        </div>

                        {/* BARIS 2: Panel Kontrol Dinamis (Switch Draft, Switch % SLS, & Indikator Warna Sumbu X) */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2.5">
                            <div className="flex flex-wrap items-center gap-3">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Opsi Tampilan:</span>

                                {/* SWITCH DRAFT */}
                                <div className="flex items-center gap-2 bg-white px-2.5 py-1 rounded-xl border border-slate-200/60 shadow-2xs h-7">
                                    <span className="text-[9px] font-bold text-slate-600 uppercase tracking-wide">Perhitungkan Draft</span>
                                    <button
                                        type="button"
                                        onClick={() => setIncludeDraft(!includeDraft)}
                                        className={`relative inline-flex h-4 w-9 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-200 ease-in-out focus:outline-none items-center ${includeDraft ? 'bg-indigo-600 border-indigo-600' : 'bg-slate-200 border-slate-300'}`}
                                    >
                                        <span className={`absolute text-[6px] font-black font-sans text-white uppercase tracking-tighter transition-all ${includeDraft ? 'left-1 opacity-100' : 'left-3 opacity-0'}`}>YA</span>
                                        <span className={`absolute text-[6px] font-black font-sans text-slate-400 uppercase tracking-tighter transition-all ${includeDraft ? 'right-3 opacity-0' : 'right-1 opacity-100'}`}>TDK</span>
                                        <span className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-xs transition duration-200 ease-in-out ${includeDraft ? 'translate-x-5' : 'translate-x-0'}`} />
                                    </button>
                                </div>

                                {/* SWITCH LIHAT % SLS */}
                                {viewModeTab === "PETUGAS" && (
                                    <div className="flex items-center gap-2 bg-white px-2.5 py-1 rounded-xl border border-slate-200/60 shadow-2xs h-7 animate-fade-in">
                                        <span className="text-[9px] font-bold text-slate-600 uppercase tracking-wide">Lihat % SLS</span>
                                        <button
                                            type="button"
                                            onClick={() => setViewSlsPercentage(!viewSlsPercentage)}
                                            className={`relative inline-flex h-4 w-9 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-200 ease-in-out focus:outline-none items-center ${viewSlsPercentage ? 'bg-emerald-600 border-emerald-600' : 'bg-slate-200 border-slate-300'}`}
                                        >
                                            <span className={`absolute text-[6px] font-black font-sans text-white uppercase tracking-tighter transition-all ${viewSlsPercentage ? 'left-1 opacity-100' : 'left-3 opacity-0'}`}>SLS</span>
                                            <span className={`absolute text-[6px] font-black font-sans text-slate-400 uppercase tracking-tighter transition-all ${viewSlsPercentage ? 'right-3 opacity-0' : 'right-1 opacity-100'}`}>DOK</span>
                                            <span className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-xs transition duration-200 ease-in-out ${viewSlsPercentage ? 'translate-x-5' : 'translate-x-0'}`} />
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* INDIKATOR WARNA SUMBU X PETUGAS */}
                            {viewModeTab === "PETUGAS" && (
                                <div className="flex flex-wrap items-center gap-2 text-[9px] font-black uppercase tracking-wider animate-fade-in">
                                    <span className="text-slate-400 mr-1">Indikator Warna Sumbu X:</span>
                                    <div className="flex items-center gap-1 bg-slate-200/80 border border-slate-300/40 text-slate-700 px-2 py-0.5 rounded-lg font-bold">
                                        <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                                        <span>Sesuai Target</span>
                                    </div>
                                    <div className="flex items-center gap-1 bg-orange-50 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-lg font-black">
                                        <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse"></span>
                                        <span>&lt; Target</span>
                                    </div>
                                    <div className="flex items-center gap-1 bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded-lg font-black relative">
                                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping absolute opacity-75"></span>
                                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 relative"></span>
                                        <span>&lt; 50%</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    /* 2. LEGENDA KHUSUS MODE PML (SETIAP ITEM DAPAT DIKLIK UNTUK SORTING) */
                    <div className="bg-slate-50 border border-slate-200/60 p-3 rounded-2xl mb-6 text-[10px] flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in">

                        {/* ITEMS LEGENDA SEBAGAI BUTTON SORTING */}
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider mr-1">
                                Urutkan Berdasarkan:
                            </span>

                            {/* 1. BUTTON APPROVE */}
                            <button
                                type="button"
                                onClick={() => handlePmlSortClick("approve")}
                                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border transition-all cursor-pointer select-none ${pmlSortBy === "approve"
                                        ? "bg-emerald-50 border-emerald-400 text-emerald-800 font-black shadow-xs ring-2 ring-emerald-300/40"
                                        : "bg-white border-slate-200 text-slate-600 hover:border-emerald-300"
                                    }`}
                            >
                                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500"></span>
                                <span className="uppercase text-[9px] font-bold">
                                    Approve ({pmlTimeframeMode === "TODAY" ? "Hari Ini" : "Total"})
                                </span>
                                {pmlSortBy === "approve" && (
                                    <span className="text-[10px] font-mono ml-0.5">{pmlSortDirection === "ASC" ? "▲" : "▼"}</span>
                                )}
                            </button>

                            {/* 2. BUTTON REJECT */}
                            <button
                                type="button"
                                onClick={() => handlePmlSortClick("reject")}
                                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border transition-all cursor-pointer select-none ${pmlSortBy === "reject"
                                        ? "bg-rose-50 border-rose-400 text-rose-800 font-black shadow-xs ring-2 ring-rose-300/40"
                                        : "bg-white border-slate-200 text-slate-600 hover:border-rose-300"
                                    }`}
                            >
                                <span className="w-2.5 h-2.5 rounded-sm bg-rose-500"></span>
                                <span className="uppercase text-[9px] font-bold">
                                    Reject ({pmlTimeframeMode === "TODAY" ? "Hari Ini" : "Total"})
                                </span>
                                {pmlSortBy === "reject" && (
                                    <span className="text-[10px] font-mono ml-0.5">{pmlSortDirection === "ASC" ? "▲" : "▼"}</span>
                                )}
                            </button>

                            {/* 3. BUTTON PENDING ANTREAN */}
                            <button
                                type="button"
                                onClick={() => handlePmlSortClick("pending")}
                                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border transition-all cursor-pointer select-none ${pmlSortBy === "pending"
                                        ? "bg-blue-50 border-blue-400 text-blue-800 font-black shadow-xs ring-2 ring-blue-300/40"
                                        : "bg-white border-slate-200 text-slate-600 hover:border-blue-300"
                                    }`}
                            >
                                <span className="w-2.5 h-2.5 rounded-sm bg-blue-500"></span>
                                <span className="uppercase text-[9px] font-bold">Antrean Diperiksa</span>
                                {pmlSortBy === "pending" && (
                                    <span className="text-[10px] font-mono ml-0.5">{pmlSortDirection === "ASC" ? "▲" : "▼"}</span>
                                )}
                            </button>

                            {/* 4. BUTTON REJECT RATE */}
                            <button
                                type="button"
                                onClick={() => handlePmlSortClick("rate")}
                                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border transition-all cursor-pointer select-none ${pmlSortBy === "rate"
                                        ? "bg-purple-50 border-purple-400 text-purple-800 font-black shadow-xs ring-2 ring-purple-300/40"
                                        : "bg-white border-slate-200 text-slate-600 hover:border-purple-300"
                                    }`}
                            >
                                <span className="w-3 h-0.5 bg-purple-500"></span>
                                <span className="uppercase text-[9px] font-bold">Reject Rate (%)</span>
                                {pmlSortBy === "rate" && (
                                    <span className="text-[10px] font-mono ml-0.5">{pmlSortDirection === "ASC" ? "▲" : "▼"}</span>
                                )}
                            </button>
                        </div>

                        {/* TOGGLE SWITCH TIMEFRAME PML (HARI INI VS TOTAL AKUMULASI) */}
                        <div className="flex items-center bg-slate-200/80 p-1 rounded-xl border border-slate-300/60 w-fit self-start sm:self-auto shrink-0">
                            <button
                                type="button"
                                onClick={() => setPmlTimeframeMode("TODAY")}
                                className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase transition-all cursor-pointer ${pmlTimeframeMode === "TODAY"
                                        ? "bg-white text-purple-700 shadow-xs"
                                        : "text-slate-500 hover:text-slate-800"
                                    }`}
                            >
                                📅 Hari Ini
                            </button>
                            <button
                                type="button"
                                onClick={() => setPmlTimeframeMode("TOTAL")}
                                className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase transition-all cursor-pointer ${pmlTimeframeMode === "TOTAL"
                                        ? "bg-white text-purple-700 shadow-xs"
                                        : "text-slate-500 hover:text-slate-800"
                                    }`}
                            >
                                📊 Total Akumulasi
                            </button>
                        </div>
                    </div>
                )}

                {/* AREA GRAFIK UTAMA & REKAP STATUS WILAYAH */}
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
                    {/* Kolom Kiri: Bar Chart PCL atau Composed Chart PML */}
                    <div className="lg:col-span-3 w-full overflow-x-auto overflow-y-hidden scrollbar-thin">
                        <div className="h-[420px] w-full min-w-[500px] md:min-w-0">
                            {dashboardMode === "PCL" ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    {memoizedBarChartElement}
                                </ResponsiveContainer>
                            ) : (
                                memoizedPmlChartElement
                            )}
                        </div>
                    </div>

                    {/* Kolom Kanan: Diagram Lingkaran & Target SLS */}
                    <div className="lg:col-span-1 space-y-4 border-l border-slate-100 pl-2 lg:pl-4 flex flex-col justify-between h-full">
                        <div>
                            <div className="text-[10px] font-black text-slate-400 tracking-widest text-center lg:text-left uppercase">Status Assignment</div>
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

                        {/* Target Progres Wilayah SLS */}
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
                                className="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white py-2 rounded-xl text-[10px] font-black uppercase tracking-wider shadow-md transition-all duration-150 mt-3 flex items-center justify-center gap-1.5 cursor-pointer"
                                title="Unduh data volume realisasi saat ini dalam bentuk berkas Excel"
                            >
                                <span>📥</span> Export Data Realisasi
                            </button>

                            {/* TOMBOL EXPORT ADMIN */}
                            {profile?.role === 'admin' && (
                                <button
                                    onClick={handleExportAllSlsKabupatenExcel}
                                    className="w-full bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white py-2 rounded-xl text-[10px] font-black uppercase tracking-wider shadow-md transition-all duration-150 mt-2 flex items-center justify-center gap-1.5 animate-fade-in cursor-pointer"
                                    title="Fitur Khusus Admin: Unduh seluruh data SLS se-kabupaten"
                                >
                                    <span>🏢</span> Export Realisasi per SLS (Admin)
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-white p-5 border border-slate-200 rounded-3xl shadow-sm">
                <div className="mb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4">
                    <div>
                        <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                            📈 Grafik Penambahan Kirim Assignment per Hari (2 Minggu Terakhir)
                        </h4>

                        {/* GRUP SUB-HEADER KIRI: Lokasi Penempatan Tombol Paling Strategis */}
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                            <p className="text-[10px] text-slate-400 font-bold uppercase">
                                Wilayah: {selectedKecTab === "SEMUA" ? "Satu Kabupaten Boyolali" : selectedPetugasEmail ? `PCL ${selectedPetugas}` : selectedDesaCode ? `Desa ${selectedDesaName}` : `Kecamatan ${namaKecamatanTerpilihText}`}
                            </p>
                            <span className="text-slate-300 hidden sm:inline text-[10px] font-bold">•</span>

                            {/* 🌟 TOMBOL TOGGLE ESTIMASI PERPANJANG LAJU (SELALU MUNCUL DI SEMUA MODE) */}
                            <button
                                onClick={() => setTampilkanPrediksi(prev => !prev)}
                                className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md border font-sans font-black text-[9px] uppercase tracking-wider transition-all duration-200 cursor-pointer select-none shadow-sm ${tampilkanPrediksi
                                        ? "bg-emerald-50 border-emerald-200 text-emerald-600 hover:bg-emerald-100" // 🟢 Hijau saat aktif
                                        : "bg-amber-50 border-amber-200 text-amber-600 hover:bg-amber-100"       // 🟠 Oranye saat nonaktif
                                    }`}
                                title={tampilkanPrediksi ? "Klik untuk menyembunyikan grafik proyeksi" : "Klik untuk melihat proyeksi kirim harian ke depan"}
                            >
                                <span className={`w-1.5 h-1.5 rounded-full ${tampilkanPrediksi ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></span>
                                {tampilkanPrediksi ? "Sembunyikan Proyeksi" : "Tampilkan Proyeksi Kirim Harian"}
                            </button>
                        </div>
                    </div>

                    {/* METRIK HEADER ATAS SEBELAH KANAN */}
                    <div className="flex flex-col sm:items-end justify-center select-none text-right">
                        <div className="flex items-center sm:justify-end gap-2 text-[11px] font-black uppercase tracking-wide">
                            <span className="relative flex h-2 w-2">
                                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${metrikEstimasiProyek.isTerlambat ? 'bg-rose-500' : 'bg-emerald-500'}`}></span>
                                <span className={`relative inline-flex rounded-full h-2 w-2 ${metrikEstimasiProyek.isTerlambat ? 'bg-rose-500' : 'bg-emerald-500'}`}></span>
                            </span>
                            <span className={metrikEstimasiProyek.isTerlambat ? 'text-rose-600' : 'text-emerald-600'}>
                                Perkiraan Selesai: {metrikEstimasiProyek.tanggalPrediksi}
                            </span>
                        </div>

                        <p className="text-[10px] font-bold uppercase mt-0.5">
                            {metrikEstimasiProyek.isTerlambat ? (
                                <span className="text-rose-500/90">
                                    ⚠️ {metrikEstimasiProyek.isModeIndividu ? "Petugas" : "Wilayah"} Terancam Mundur ±{metrikEstimasiProyek.selisihDariDeadline} Hari Dari Target
                                </span>
                            ) : (
                                <span className="text-emerald-600">
                                    Status Aman (Estimasi Selesai dalam {metrikEstimasiProyek.sisaHariDibutuhkan} Hari)
                                </span>
                            )}
                        </p>

                        <div className="text-[11px] text-slate-600 mt-1 flex items-center gap-x-2 tracking-wide">
                            <span>
                                Rata-rata Kirim 3 hari terakhir: <strong className="font-semibold text-slate-800">+{metrikEstimasiProyek.rataKirimHarian.toLocaleString('id-ID')}</strong> kirim/hari
                            </span>
                            <span className="text-slate-300">•</span>
                            <span>
                                Sisa Open: <strong className="font-semibold text-slate-800">{metrikEstimasiProyek.totalSisaOpenAktif.toLocaleString('id-ID')}</strong> Assignment
                            </span>
                        </div>
                    </div>
                </div>

                {/* KONTEN UTAMA GRAFIK + PANEL SAMPING */}
                <div className="flex flex-col lg:flex-row gap-4 h-64 w-full">
                    {/* Kontainer Area Chart Grafik */}
                    <div className="flex-1 h-full">
                        <ResponsiveContainer width="100%" height="100%">
                            {memoizedAreaChartElement}
                        </ResponsiveContainer>
                    </div>

                    {/* Panel Daftar Petugas Kanan (Hanya muncul jika trendKeys > 1) */}
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
                                            className={`flex items-center justify-between px-2 py-1.5 rounded-xl cursor-pointer transition-all duration-150 select-none ${isFocused ? 'bg-slate-900 text-white shadow-sm scale-[1.02]' : 'bg-white border border-slate-100 text-slate-700 hover:bg-slate-100 hover:scale-[1.01]'
                                                }`}
                                            style={{ opacity: isDimmed ? 0.25 : 1 }}
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
                                        <tr
                                            key={p.email}
                                            onClick={() => {
                                                if (p.email) {
                                                    setSelectedPetugasEmail(p.email);
                                                    setSelectedPetugas(p.nama_asli);
                                                    setViewModeTab("SLS");
                                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                                }
                                            }}
                                            /* 🌟 PERBAIKAN 1: Wajib tambahkan 'group relative' di sini agar hover terdeteksi */
                                            className="hover:bg-emerald-50/70 cursor-pointer transition-colors group relative"
                                        >
                                            <td className="p-2 text-center font-mono font-bold text-slate-400">{idx + 1}</td>

                                            {/* 🌟 PERBAIKAN 2: Tambahkan 'relative' pada <td> agar batas koordinat tooltip presisi */}
                                            <td className="p-2 font-bold text-slate-800 whitespace-nowrap relative">
                                                {p.nama_asli}

                                                {/* 💡 TOOLTIP ESTETIK TEMA EMERALD */}
                                                <div className="invisible group-hover:visible opacity-0 group-hover:opacity-100 absolute left-8 -top-6 z-30 bg-slate-900 text-white text-[9px] font-bold px-2 py-1 rounded-md shadow-md pointer-events-none transition-all duration-200 whitespace-nowrap tracking-wide flex items-center gap-1">
                                                    <span className="text-emerald-400">📊</span> Klik untuk melihat progres harian petugas
                                                    {/* Segitiga panah kecil di bawah tooltip */}
                                                    <div className="absolute top-full left-4 -mt-1 border-4 border-transparent border-t-slate-900"></div>
                                                </div>
                                            </td>

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
                    <div className="border-b border-slate-100 pb-3 mb-3 flex justify-between items-center gap-4">
                        {/* Sisi Kiri: Judul Tabel */}
                        <span className="text-[11px] font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5 shrink-0">
                            ⚠️ Bottom {limitPetugas} Realisasi Paling Sedikit
                        </span>

                        {/* Sisi Kanan: Aksi Kontrol & Lencana Wilayah */}
                        <div className="flex items-center gap-2 select-none shrink-0">
                            {selectedPetugasEmail && (
                                <button
                                    onClick={() => {
                                        // Reset filter petugas individu
                                        setSelectedPetugas(null);
                                        setSelectedPetugasEmail(null);

                                        // Kembalikan ke mode list petugas di tingkat kecamatan saat ini
                                        setViewModeTab("KECAMATAN");
                                        setSelectedDesaCode(null);
                                        setSelectedDesaName("");
                                    }}
                                    className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200/60 text-[9px] font-black px-2.5 py-1 rounded-xl transition-all uppercase tracking-wider shadow-2xs flex items-center gap-1 cursor-pointer active:scale-95"
                                >
                                    <span className="text-[11px] leading-none">✕</span> Reset Filter
                                </button>
                            )}

                            <span className="bg-rose-50 text-rose-600 text-[9px] font-mono font-black px-2 py-0.5 rounded-full border border-rose-100/40">
                                {selectedKecTab === "SEMUA" ? "KABUPATEN" : "KECAMATAN"}
                            </span>
                        </div>
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
                                        <tr
                                            key={p.email}
                                            onClick={() => {
                                                if (p.email) {
                                                    setSelectedPetugasEmail(p.email);
                                                    setSelectedPetugas(p.nama_asli);
                                                    setViewModeTab("SLS");
                                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                                }
                                            }}
                                            /* 🌟 Tambahkan class 'group' dan 'relative' untuk basis posisi tooltip */
                                            className="hover:bg-rose-50/70 cursor-pointer transition-colors group relative"
                                        >
                                            <td className="p-2 text-center font-mono font-bold text-slate-400">{idx + 1}</td>

                                            {/* 🌟 Kolom Nama: Disisipi komponen Tooltip kontras tinggi yang melayang saat di-hover */}
                                            <td className="p-2 font-bold text-slate-800 whitespace-nowrap flex items-center gap-2 relative">
                                                {p.nama_asli}

                                                {/* 💡 TOOLTIP ESTETIK */}
                                                <div className="invisible group-hover:visible opacity-0 group-hover:opacity-100 absolute left-8 -top-6 z-30 bg-slate-900 text-white text-[9px] font-bold px-2 py-1 rounded-md shadow-md pointer-events-none transition-all duration-200 whitespace-nowrap tracking-wide flex items-center gap-1">
                                                    <span className="text-rose-400">📊</span> Klik untuk melihat progres harian petugas
                                                    {/* Segitiga panah kecil di bawah tooltip */}
                                                    <div className="absolute top-full left-4 -mt-1 border-4 border-transparent border-t-slate-900"></div>
                                                </div>
                                            </td>

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

            {/* MODAL DRILL-DOWN KPI KINERJA */}
            {showKpiModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-[100] p-4 animate-fade-in">
                    <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
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
            {/* MODAL DRILL-DOWN UNIVERSAL: DETAIL PML & PCL */}
            {criticalModalConfig.show && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-[110] p-4 animate-fade-in">
                    <div className="bg-white w-full max-w-5xl rounded-3xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">

                        {/* HEADER MODAL */}
                        <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50">
                            <div>
                                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                                    {criticalModalConfig.title}
                                </h3>
                                <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">
                                    {criticalModalConfig.type.startsWith("pml_")
                                        ? "Rekapitulasi Kinerja & Kualitas Pemeriksaan Pengawas Lapangan (PML)"
                                        : "Menampilkan rekam pengiriman assignment harian petugas dalam 3 hari terakhir (H-1 s.d H-3)"}
                                </p>
                            </div>
                            <button
                                onClick={() => {
                                    if (criticalModalConfig.type === "detil_pml_pcl") {
                                        const pmlCardElement = document.querySelector('[class*="border-indigo-500"]');
                                        if (pmlCardElement) pmlCardElement.click();
                                    } else {
                                        setCriticalModalConfig({ show: false, type: "", title: "", data: [] });
                                    }
                                }}
                                className="bg-slate-200 hover:bg-slate-300 text-slate-600 font-black text-xs px-2.5 py-1.5 rounded-xl transition-all uppercase tracking-wide cursor-pointer"
                            >
                                {criticalModalConfig.type === "detil_pml_pcl" ? "◀ Kembali" : "✕ Tutup"}
                            </button>
                        </div>

                        {/* BODY TABEL MODAL */}
                        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
                            <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                                <table className="w-full text-left border-collapse min-w-[800px]">
                                    <thead>
                                        <tr className="bg-slate-800 text-white text-[9px] font-black uppercase tracking-wider border-b border-slate-700">
                                            <th className="p-3 text-center w-12 sticky top-0 bg-slate-800">No</th>

                                            {/* TABEL HEADER KHUSUS MODE PML (5 CARD PML BARU) */}
                                            {criticalModalConfig.type.startsWith("pml_") && criticalModalConfig.type !== "pml_critical" ? (
                                                <>
                                                    <th className="p-3 sticky top-0 bg-slate-800">Nama Pengawas (PML)</th>
                                                    <th className="p-3 sticky top-0 bg-slate-800">Kecamatan</th>
                                                    <th className="p-3 text-center bg-emerald-900 text-emerald-100 sticky top-0 font-bold">Approve (Hari Ini)</th>
                                                    <th className="p-3 text-center bg-rose-900 text-rose-100 sticky top-0 font-bold">Reject (Hari Ini)</th>
                                                    <th className="p-3 text-center bg-blue-900 text-blue-100 sticky top-0 font-bold">Antrean Pending</th>
                                                    <th className="p-3 text-center bg-purple-900 text-purple-100 sticky top-0 font-bold">Reject Rate (%)</th>
                                                </>
                                            ) : criticalModalConfig.type === "pml_critical" ? (
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
                                                            Tidak ada data terdeteksi pada indikator ini.
                                                        </td>
                                                    </tr>
                                                );
                                            }

                                            // 1. RENDER UNTUK MODAL 5 CARD PML BARU
                                            if (criticalModalConfig.type.startsWith("pml_") && criticalModalConfig.type !== "pml_critical") {
                                                return pagedData.map((item, idx) => (
                                                    <tr key={idx} className="hover:bg-slate-50 transition-colors odd:bg-white even:bg-slate-50/20">
                                                        <td className="p-3 text-center font-mono font-bold text-slate-400">{cIdxFirst + idx + 1}</td>
                                                        <td className="p-3 font-black text-slate-800 uppercase">
                                                            {item.nama_petugas || item.nama}
                                                            <div className="text-[9px] text-slate-400 font-mono font-normal lowercase">{item.email}</div>
                                                        </td>
                                                        <td className="p-3 font-bold text-slate-600">
                                                            <span className="bg-slate-100 border border-slate-200 text-slate-700 px-2 py-0.5 rounded-md text-[10px] uppercase font-bold">
                                                                {item.kecamatan || "-"}
                                                            </span>
                                                        </td>
                                                        <td className="p-3 text-center font-mono font-black text-emerald-600 bg-emerald-50/50">
                                                            +{item.approveHariIni || 0} Dok
                                                        </td>
                                                        <td className="p-3 text-center font-mono font-black text-rose-600 bg-rose-50/50">
                                                            +{item.rejectHariIni || 0} Dok
                                                        </td>
                                                        <td className="p-3 text-center font-mono font-black text-blue-600 bg-blue-50/50">
                                                            {item.pendingPml || 0} Dok
                                                        </td>
                                                        <td className="p-3 text-center font-mono font-black text-purple-600 bg-purple-50/50">
                                                            {item.rejectRate || "0.0"}%
                                                        </td>
                                                    </tr>
                                                ));
                                            }

                                            // 2. RENDER UNTUK MODAL PML CRITICAL (DRILLDOWN DENGAN ACTION BTN)
                                            if (criticalModalConfig.type === "pml_critical") {
                                                return pagedData.map((item, idx) => (
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

                                                            const petugasBermasalahPmlIni = dataMonitoringWilayah.petugas
                                                                .filter(p => {
                                                                    const pmlPetugasClean = (p.emailPml || "").toLowerCase().trim();
                                                                    return pmlPetugasClean === emailPmlTerpilih && (criticalPcl.macet.includes(p.email) || criticalPcl.melambat.includes(p.email));
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
                                                        <td className="p-3 text-center font-mono font-bold text-slate-400 group-hover:text-indigo-600">{cIdxFirst + idx + 1}</td>
                                                        <td className="p-3 font-black text-slate-800 uppercase group-hover:text-indigo-600">{item.nama}</td>
                                                        <td className="p-3 text-slate-400 font-bold uppercase tracking-wider text-[10px]">PML Pengawas</td>
                                                        <td className="p-3 font-bold text-slate-500">{item.kecamatan}</td>
                                                        <td className={`p-3 text-center font-mono font-black ${item.h3 > 0 ? 'bg-rose-100 text-rose-700' : 'bg-slate-50/50 text-slate-400'}`}>{item.h3} Petugas</td>
                                                        <td className={`p-3 text-center font-mono font-black ${item.h2 > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-50/50 text-slate-400'}`}>{item.h2} Petugas</td>
                                                        <td className="p-3 text-center font-mono font-black bg-indigo-50 text-indigo-700">{item.h1} Petugas</td>
                                                        <td className="p-3 text-right pr-6">
                                                            <span className="inline-block bg-indigo-600 text-white font-sans text-[9px] font-black uppercase px-2 py-0.5 rounded-md tracking-wider">👁️ Lihat</span>
                                                        </td>
                                                    </tr>
                                                ));
                                            }

                                            // 3. RENDER DEFAULT UNTUK PETUGAS (PCL MACET / MELAMBAT)
                                            return pagedData.map((item, idx) => {
                                                const totalPersen = item.target > 0 ? Math.round((item.totalRealisasi / item.target) * 100) : 0;
                                                const getCellClassName = (val) => val === 0 || val === "0"
                                                    ? "p-3 text-center font-mono bg-rose-100 text-rose-700 font-black border border-rose-200"
                                                    : "p-3 text-center font-mono font-bold bg-slate-50/50 text-slate-700";

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

                        {/* FOOTER PAGINATION MODAL */}
                        <div className="p-4 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-3 bg-slate-50">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                                Menampilkan <span className="font-mono text-slate-700">{criticalModalConfig.data.length > 0 ? ((criticalCurrentPage - 1) * 15) + 1 : 0}</span> - <span className="font-mono text-slate-700">{Math.min(criticalCurrentPage * 15, criticalModalConfig.data.length)}</span> dari <span className="font-mono text-indigo-600">{criticalModalConfig.data.length}</span> Data
                            </div>

                            {Math.ceil(criticalModalConfig.data.length / 15) > 1 && (
                                <div className="flex items-center gap-1.5">
                                    <button
                                        disabled={criticalCurrentPage === 1}
                                        onClick={() => setCriticalCurrentPage(prev => Math.max(prev - 1, 1))}
                                        className="bg-white border border-slate-200 text-slate-700 px-3 py-1.5 rounded-xl font-black text-[9px] uppercase tracking-wider shadow-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 transition-all cursor-pointer"
                                    >
                                        ◀ Prev
                                    </button>
                                    <div className="bg-white border border-slate-200 px-3 py-1.5 rounded-xl text-[10px] font-mono font-black text-slate-700 min-w-[70px] text-center">
                                        {criticalCurrentPage} / {Math.ceil(criticalModalConfig.data.length / 15)}
                                    </div>
                                    <button
                                        disabled={criticalCurrentPage === Math.ceil(criticalModalConfig.data.length / 15)}
                                        onClick={() => setCriticalCurrentPage(prev => Math.min(prev + 1, Math.ceil(criticalModalConfig.data.length / 15)))}
                                        className="bg-white border border-slate-200 text-slate-700 px-3 py-1.5 rounded-xl font-black text-[9px] uppercase tracking-wider shadow-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 transition-all cursor-pointer"
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