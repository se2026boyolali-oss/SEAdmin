import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import {
    Users, MapPin, AlertTriangle, CheckCircle2,
    Save, RefreshCw, Search, ChevronDown, ChevronUp, 
    Navigation, Camera, WifiOff, CloudLightning, Filter, LogOut, Send, HelpCircle, ShieldAlert, Image
} from 'lucide-react';

// Cache global memori untuk menampung file GeoJSON kecamatan agar tidak di-fetch berulang kali
const geojsonCache = {};

// =========================================================================
// ENGINE INITIALIZATION: INDEXEDDB UNTUK ANTREAN INPUT REALISASI OFFLINE PML
// =========================================================================
const initPmlOfflineDB = () => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("BpsPmlOfflineDB", 2); // Naikkan versi ke 2
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains("pending_realisasi")) {
                db.createObjectStore("pending_realisasi", { keyPath: "id", autoIncrement: true });
            }
            // Tambahkan store baru untuk absen pml
            if (!db.objectStoreNames.contains("pending_absen_pml")) {
                db.createObjectStore("pending_absen_pml", { keyPath: "id", autoIncrement: true });
            }
        };
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
};

const simpanAbsenKeOfflineDB = async (payload) => {
    try {
        const db = await initPmlOfflineDB();
        const tx = db.transaction("pending_absen_pml", "readwrite");
        await tx.objectStore("pending_absen_pml").add(payload);
        // Update hitungan antrean jika diperlukan state baru
    } catch (err) {
        console.error("Gagal mengamankan absen ke IndexedDB:", err);
    }
};

// 🏃‍♂️ SUB-KOMPONEN BARIS SLS: Isolasi State Input untuk Performa Tinggi Lapangan (Zero-Lag)
// ====== BG-6: REWORK TOTAL KOMPONEN ANAK SLS CARD ROW (GRID MONITORING OTOMATIS) ======
// ====== PERBAIKAN BG-6: PARSING DATA JSONB STATUS PROGRES ======
const SlsCardRow = React.memo(({ sls, progressData }) => {
    // Cari data progress milik SLS ini
    const matchProgress = progressData?.find(p => String(p.idsubsls).trim() === String(sls.idsubsls).trim());
    
    // Ekstraksi objek status_progres dari baris database
    const statusObj = matchProgress?.status_progres || {};

    // Ambil nilai dari key JSON secara presisi (jika tidak ada/0, default ke 0)
    const approved = statusObj["APPROVED BY Pengawas"] || 0;
    const submitted = statusObj["SUBMITTED BY Pencacah"] || 0;
    const draft = statusObj["DRAFT"] || 0;
    const rejected = statusObj["REJECTED BY Pengawas"] || 0; 
    const revoked = statusObj["REVOKED BY Pengawas"] || 0;
    const open = statusObj["OPEN"] || 0;
    
    // Target total diambil dari key 'total' di JSON, jika kosong gunakan target muatan master
    const totalTarget = statusObj["total"] || sls.jml_muatan || 0;

    // Hitung total realisasi yang sudah dikerjakan (tidak berstatus OPEN)
    const totalRealisasi = approved + submitted + draft + rejected + revoked;
    
    // Hitung persentase capaian riil terhadap target total
    const persen = totalTarget > 0 ? Math.min(Math.round((totalRealisasi / totalTarget) * 100), 100) : 0;
    
    // SLS otomatis dianggap selesai mutlak jika disetujui (Approved) sudah memenuhi target muatan
    // Atau jika total pengerjaan sudah menyamai total target
    const isSelesaiOtomatis = totalRealisasi >= totalTarget && totalTarget > 0;

    const borderWarna = isSelesaiOtomatis 
        ? 'border-l-emerald-500 bg-emerald-50/10' 
        : totalRealisasi > 0 
            ? 'border-l-amber-500' 
            : 'border-l-slate-300';

    return (
        <div className={`bg-white border border-slate-200 border-l-4 ${borderWarna} rounded-2xl p-3 shadow-2xs flex flex-col gap-2.5 relative`}>
            
            {/* Bagian Atas: Info SLS & Badge Status */}
            <div className="flex justify-between items-start gap-2">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${isSelesaiOtomatis ? 'bg-emerald-500 animate-pulse' : totalRealisasi > 0 ? 'bg-amber-400' : 'bg-slate-300'}`}></span>
                        <h5 className="font-black text-slate-800 text-xs uppercase truncate">
                            ({sls.kdsls}) {sls.nmsls}
                        </h5>
                    </div>
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tight mt-0.5">
                        Desa: <span className="text-slate-600 font-black">{sls.nmdesa}</span>
                    </p>
                </div>
                
                {/* Auto Badge Status Selesai */}
                {isSelesaiOtomatis ? (
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg font-black text-[8px] uppercase tracking-wider">
                        ✓ Selesai
                    </span>
                ) : totalRealisasi > 0 ? (
                    <span className="px-2 py-0.5 bg-amber-50 text-amber-600 border border-amber-100 rounded-lg font-black text-[8px] uppercase tracking-wider">
                    {totalRealisasi} Assignment
                    </span>
                ) : (
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-400 border border-slate-200 rounded-lg font-black text-[8px] uppercase tracking-wider">
                        Kosong
                    </span>
                )}
            </div>

            {/* Bagian Tengah: Progress Bar Capaian */}
            <div className="space-y-1">
                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div 
                        className={`h-full rounded-full transition-all duration-300 ${isSelesaiOtomatis ? 'bg-emerald-500' : 'bg-amber-500'}`}
                        style={{ width: `${persen}%` }}
                    ></div>
                </div>
                <div className="flex justify-between items-center text-[9px] font-mono font-bold text-slate-400">
                    <span>Progres: <strong className="text-slate-700 font-black">{totalRealisasi}</strong> / {totalTarget} target</span>
                    <span className={isSelesaiOtomatis ? "text-emerald-600 font-black" : "text-amber-600 font-black"}>{persen}%</span>
                </div>
            </div>

            {/* 🌟 Bagian Bawah: Mengganti Grid Kotak Besar Menjadi Baris Keterangan Simpel Semisal List Petugas */}
            <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100 text-[10px] font-mono font-bold text-slate-400">
                <span>Draft: <strong className="text-amber-600 font-black">{draft}</strong></span>
                <span>Submit: <strong className="text-blue-600 font-black">{submitted}</strong></span>
                <span>Approve: <strong className="text-emerald-600 font-black">{approved}</strong></span>
                {(rejected + revoked) > 0 && <span>Reject: <strong className="text-rose-600 font-black">{rejected + revoked}</strong></span>}
            </div>
            
        </div>
    );
});
// ====== AKHIR PERBAIKAN BG-6 ======
// ====== AKHIR DARI BG-6 ======

export default function PmlMonitoringPage() {
    const { user, profile, loading: authLoading, logout } = useAuth();

    const pmlCameraInputRef = useRef(null);
    const pmlGalleryInputRef = useRef(null);

    const [activeTab, setActiveTab] = useState(0);

    const [loading, setLoading] = useState(true);
    const [pcls, setPcls] = useState([]);
    
    const [searchInputValue, setSearchInputValue] = useState("");
    const [searchTerm, setSearchTerm] = useState("");
    
    const [actionLoading, setActionLoading] = useState(null);
    const [pmlCheckingIn, setPmlCheckingIn] = useState(false);
    const [pmlCheckedInToday, setPmlCheckedInToday] = useState(false);

    const [rekapStatusTim, setRekapStatusTim] = useState({ aktif: 0, absen: 0 });

    // OPTIMALISASI MEMORI: Menggunakan Object URL Preview (Blob) untuk menggantikan Base64 di State
    const [pmlPhotoPreview, setPmlPhotoPreview] = useState(null);
    const [rawPmlPhotoFile, setRawPmlPhotoFile] = useState(null); 
    const [pmlCoords, setPmlCoords] = useState(null);
    const [showPmlCameraCard, setShowPmlCameraCard] = useState(false);

    const [allowManualMode, setAllowManualMode] = useState(false);
    const [manualMode, setManualMode] = useState(false);
    const [selectedManualSls, setSelectedManualSls] = useState("");
    const [selectedManualDate, setSelectedManualDate] = useState("");

    const [offlineInputCount, setOfflineInputCount] = useState(0);
    const [isSyncingInput, setIsSyncingInput] = useState(false);

    const [allSlsFlat, setAllSlsFlat] = useState([]);
    const [desaList, setDesaList] = useState([]);
    const [selectedDesa, setSelectedDesa] = useState("SEMUA");
    const [slsInputs, setSlsInputs] = useState({});
// ====== SUNTIKAN 1A: TAMBAHKAN STATE BARU DI BAWAH DEKLARASI STATE FLAT SLS ======
const [realtimeProgressData, setRealtimeProgressData] = useState([]);
// ====== AKHIR SUNTIKAN 1A ======
// ====== SUNTIKAN STATE BARU UNTUK WAKTU SINKRONISASI SERVER ======
const [lastSyncProgressTime, setLastSyncProgressTime] = useState("Memuat...");
// ====== AKHIR SUNTIKAN STATE BARU ======
    const [last7Dates, setLast7Dates] = useState([]);
    const [touchStart, setTouchStart] = useState(null);
    const [touchEnd, setTouchEnd] = useState(null);
    const [expandedPetugasSls, setExpandedPetugasSls] = useState(null);

    const [showEvaluasiModal, setShowEvaluasiModal] = useState(false);
    const [kendalaLapangan, setKendalaLapangan] = useState("");
    const [solusiLapangan, setSolusiLapangan] = useState("");
    const [fotoEvaluasiBase64, setFotoEvaluasiBase64] = useState(null);
    const [uploadFotoEvaluasiLoading, setUploadFotoEvaluasiLoading] = useState(false);

    const evaluasiCameraRef = useRef(null);

    const [showPmlValidationDialog, setShowPmlValidationDialog] = useState(false);
    const [isPmlOutsideBorder, setIsPmlOutsideBorder] = useState(false);
    
    const [submitSiklusLoading, setSubmitSiklusLoading] = useState(false);
    
    // Objek Canvas tersembunyi yang persisten untuk merender watermark on-demand saat kirim absen
    const canvasRef = useRef(null);
    if (!canvasRef.current) {
        canvasRef.current = document.createElement('canvas');
    }
    
    const getTodayDateString = () => {
        return new Date().toLocaleString("sv-SE", { timeZone: "Asia/Jakarta" }).split(" ")[0];
    };

    useEffect(() => {
        const delayDebounceFn = setTimeout(() => {
            setSearchTerm(searchInputValue);
        }, 300);
        return () => clearTimeout(delayDebounceFn);
    }, [searchInputValue]);

    useEffect(() => {
        setSelectedManualDate(getTodayDateString());
    }, []);

    const generateLast7Days = useCallback(() => {
        const dates = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dString = d.toLocaleString("sv-SE", { timeZone: "Asia/Jakarta" }).split(" ")[0];
            dates.push(dString);
        }
        return dates;
    }, []);

    const getKecamatanCode = useCallback(() => {
        if (!profile?.kecamatan_tugas) return null;
        const match = profile.kecamatan_tugas.match(/^\d+/);
        return match ? match[0] : null;
    }, [profile?.kecamatan_tugas]);

const checkOfflineInputQueueCount = async () => {
        try {
            const db = await initPmlOfflineDB();
            
            // 1. Hitung antrean realisasi SLS
            const countRealisasi = await new Promise((resolve) => {
                const tx = db.transaction("pending_realisasi", "readonly");
                const store = tx.objectStore("pending_realisasi");
                const req = store.count();
                req.onsuccess = () => resolve(req.result || 0);
                req.onerror = () => resolve(0);
            });

            // 2. Hitung antrean absen PML
            const countAbsen = await new Promise((resolve) => {
                if (!db.objectStoreNames.contains("pending_absen_pml")) return resolve(0);
                const tx = db.transaction("pending_absen_pml", "readonly");
                const store = tx.objectStore("pending_absen_pml");
                const req = store.count();
                req.onsuccess = () => resolve(req.result || 0);
                req.onerror = () => resolve(0);
            });

            // Set total gabungan antrean ke state
            setOfflineInputCount(countRealisasi + countAbsen);
        } catch (err) {
            console.error("Gagal membaca storage offline PML:", err);
        }
    };

    const resetPmlForm = useCallback(() => {
        setPmlCoords(null);
        setSelectedManualSls("");
        setManualMode(false);
        
        // Bersihkan memori object URL preview lama agar tidak terjadi memory leak di HP lapangan
        if (pmlPhotoPreview) {
            URL.revokeObjectURL(pmlPhotoPreview);
        }
        setPmlPhotoPreview(null);
        setRawPmlPhotoFile(null);
        setIsPmlOutsideBorder(false);
        setShowPmlCameraCard(false);
        setShowPmlValidationDialog(false); 
        setPmlCheckingIn(false);
        
        if (pmlCameraInputRef.current) pmlCameraInputRef.current.value = "";
        if (pmlGalleryInputRef.current) pmlGalleryInputRef.current.value = "";
        
        setSelectedManualDate(getTodayDateString());
    }, [pmlPhotoPreview]);

    // =========================================================================
    // MANAGEMENT DATA: AMBIL DATA DARI SERVER SUPABASE / STORAGE LOKAL
    // =========================================================================
    const fetchPmlData = async () => {
        const pmlEmail = user?.email || profile?.email;
        if (!pmlEmail) return;

        setLoading(true);
        const tglHariIni = getTodayDateString();
        const cleanPmlEmail = pmlEmail.toLowerCase().trim();

        const rentangTanggal = generateLast7Days();
        setLast7Dates(rentangTanggal); 
        const tglHMinus6 = rentangTanggal[0];

        await checkOfflineInputQueueCount();

        if (navigator.onLine) {
            try {
                const { data: remoteConfig } = await supabase
                    .from('app_settings')
                    .select('value_boolean')
                    .eq('key', 'allow_manual_upload')
                    .single();
                if (remoteConfig) {
                    const isAllowed = remoteConfig.value_boolean === true;
                    setAllowManualMode(isAllowed);
                    localStorage.setItem('cache_allow_manual_upload', isAllowed ? 'true' : 'false');
                }
            } catch (cfgErr) {
                console.warn("Gagal lookup remote admin config settings:", cfgErr.message);
            }
        } else {
            const cachedConfig = localStorage.getItem('cache_allow_manual_upload');
            setAllowManualMode(cachedConfig === 'true');
        }

        if (!navigator.onLine) {
            console.warn("⚠️ Mode Luring PML: Mengambil status pengawasan dari cache lokal HP.");
            const pmlCheckInStatus = localStorage.getItem(`cache_pml_checkedin_${cleanPmlEmail}_${tglHariIni}`);
            setPmlCheckedInToday(pmlCheckInStatus === 'true');

            const cachedPclList = localStorage.getItem(`cache_pml_monitoring_list_${cleanPmlEmail}`);
            if (cachedPclList) {
                const parsedPcls = JSON.parse(cachedPclList);
                setPcls(parsedPcls);
                const aktif = parsedPcls.filter(p => p.statusHariIni === 'AKTIF').length;
                setRekapStatusTim({ aktif, absen: parsedPcls.length - aktif });
            }
// ====== BG-5: SUNTIKAN CACHE PROGRESS DI BLOK LURING (OFFLINE) ======
            const cachedFlatSls = localStorage.getItem(`cache_pml_flat_sls_${cleanPmlEmail}`);
            if (cachedFlatSls) {
                const flatData = JSON.parse(cachedFlatSls);
                setAllSlsFlat(flatData);
                setDesaList([...new Set(flatData.map(s => s.nmdesa))]);
                
                const initialSlsInputs = {};
                flatData.forEach(s => {
                    initialSlsInputs[s.idsubsls] = s.realisasi_pencacahan || 0;
                });
                setSlsInputs(initialSlsInputs);

                // 🌟 BACA CACHE PROGRESS SAAT OFFLINE
                const cachedProgress = localStorage.getItem(`cache_pml_realtime_progress_${cleanPmlEmail}`);
                if (cachedProgress) setRealtimeProgressData(JSON.parse(cachedProgress));
            }
            setLoading(false);
            return;
// ====== AKHIR DARI BG-5 ======
        }

        try {
            const { data: pmlCheckInLog } = await supabase
                .from('log_checkin_pml')
                .select('id')
                .eq('pml_email', cleanPmlEmail)
                .eq('tanggal', tglHariIni);

            const isCheckedIn = pmlCheckInLog && pmlCheckInLog.length > 0;
            setPmlCheckedInToday(isCheckedIn);
            localStorage.setItem(`cache_pml_checkedin_${cleanPmlEmail}_${tglHariIni}`, isCheckedIn);

            const { data: petugasData, error: petugasError } = await supabase
                .from('petugas')
                .select('email, nama_petugas, kecamatan_tugas, posisi_tugas, id_pml_atasan')
                .eq('posisi_tugas', 'PCL')
                .eq('id_pml_atasan', cleanPmlEmail)
                .eq('status', 'Diterima');

            if (petugasError) throw petugasError;

            const { data: rentangLogs } = await supabase
                .from('log_checkin_pcl')
                .select('petugas_email, tanggal, idsubsls, foto_bukti')
                .gte('tanggal', tglHMinus6)
                .lte('tanggal', tglHariIni)
                .order('tanggal', { ascending: false });

            const { data: masterSls } = await supabase
                .from('muatan_sls')
                .select('idsubsls, kdsls, nmsls, nmdesa, petugas_id, jml_muatan, realisasi_pencacahan, is_selesai');

            const allMasterSlsArray = masterSls || [];
            const masterSlsMap = new Map(allMasterSlsArray.map(m => [String(m.idsubsls).trim(), m]));

            const logsPclMap = new Map();
            (rentangLogs || []).forEach(log => {
                const emailKey = log.petugas_email.toLowerCase().trim();
                if (!logsPclMap.has(emailKey)) logsPclMap.set(emailKey, []);
                logsPclMap.get(emailKey).push(log);
            });

            const daftarEmailBinaan = (petugasData || []).map(pcl => pcl.email.toLowerCase().trim());

            const slsKhususBinaan = allMasterSlsArray.filter(sls => {
                if (!sls.petugas_id) return false;
                return daftarEmailBinaan.includes(sls.petugas_id.toLowerCase().trim());
            });

            setAllSlsFlat(slsKhususBinaan);
            setDesaList([...new Set(slsKhususBinaan.map(s => s.nmdesa))]);
            localStorage.setItem(`cache_pml_flat_sls_${cleanPmlEmail}`, JSON.stringify(slsKhususBinaan));
// 🌟 AWAL SUNTIKAN: Tarik data volume realisasi otomatis (Approved, Submitted, dll)
            // ====== PERBAIKAN SUNTIKAN 1B: QUERY HANYA KOLOM ID SUBSLS DAN STATUS PROGRES ======
            if (navigator.onLine && slsKhususBinaan.length > 0) {
                try {
                    const idsubslsBinaanArray = slsKhususBinaan.map(s => String(s.idsubsls).trim());
                    const { data: progressData, error: progressError } = await supabase
                        .from('progress_boyolali')
                        .select('idsubsls, status_progres') // 🌟 Diperbaiki di sini
                        .in('idsubsls', idsubslsBinaanArray);

                    if (!progressError && progressData) {
                        setRealtimeProgressData(progressData);
                        localStorage.setItem(`cache_pml_realtime_progress_${cleanPmlEmail}`, JSON.stringify(progressData));
                        // ====== PERBAIKAN FORMAT: DD/MM/YYYY JAM LENGKAP PADA LOOKUP SINKRONISASI ======
                        try {
                            const { data: syncData } = await supabase
                                .from('sync_status')
                                .select('last_update')
                                .eq('nama_tabel', 'progress_boyolali')
                                .single();
                                
                            if (syncData?.last_update) {
                                const d = new Date(syncData.last_update);
                                
                                // Helper internal untuk memaksa dua digit angka (pad zero)
                                const pad = (num) => String(num).padStart(2, '0');
                                
                                // Ekstraksi komponen tanggal local waktu Asia/Jakarta
                                const tanggalHari = pad(d.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric" }));
                                const bulanHari = pad(d.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta", month: "numeric" }));
                                const tahunHari = d.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta", year: "numeric" });
                                
                                // Format jam: HH:MM:SS
                                const jam = d.toLocaleTimeString("id-ID", { hour12: false, timeZone: "Asia/Jakarta" }).replace(/\./g, ':');
                                
                                // Gabungkan menjadi format DD/MM/YYYY HH:MM:SS
                                const formatLengkap = `${tanggalHari}/${bulanHari}/${tahunHari} ${jam}`; 
                                // Hasil akhir: 24/06/2026 21:32:22
                                
                                setLastSyncProgressTime(formatLengkap);
                                localStorage.setItem(`cache_pml_last_sync_text_${cleanPmlEmail}`, formatLengkap);
                            }
                        } catch (errSync) {
                            console.warn("Gagal lookup timestamp sync_status:", errSync.message);
                        }
// ====== AKHIR PERBAIKAN FORMAT ======
                    }
                } catch (errProgress) {
                    console.warn("Gagal otomatisasi database progress dashboard:", errProgress.message);
                }
            }
// ====== AKHIR PERBAIKAN SUNTIKAN 1B ======
            // 🌟 AKHIR SUNTIKAN
            let countAktif = 0;
            const combinedData = (petugasData || []).map(pcl => {
                const cleanPclEmail = pcl.email.toLowerCase().trim();
                const logsPcl = logsPclMap.get(cleanPclEmail) || [];
                
                const semuaAbsenHariIni = logsPcl.filter(l => {
                    const stringTanggalLog = l.tanggal ? l.tanggal.substring(0, 10) : "";
                    return stringTanggalLog === tglHariIni;
                });
                
                const checkInHariIni = semuaAbsenHariIni.length > 0 ? semuaAbsenHariIni[0] : null; 
                const totalCheckInHariIni = semuaAbsenHariIni.length;
                
                const tanggalMasukList = logsPcl.map(l => l.tanggal ? l.tanggal.substring(0, 10) : "");

                if (checkInHariIni) countAktif++;

                let hariTanpaKabar = 0;
                if (!checkInHariIni) {
                    if (logsPcl.length > 0 && logsPcl[0]?.tanggal) {
                        const tglTerakhir = new Date(logsPcl[0].tanggal.substring(0, 10));
                        const tglSkrg = new Date(tglHariIni);
                        const diffTime = Math.abs(tglSkrg - tglTerakhir);
                        hariTanpaKabar = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    } else {
                        hariTanpaKabar = 99;
                    }
                }

                const logTerpilih = checkInHariIni || logsPcl[0];
                const idSlsPetugas = logTerpilih?.idsubsls;
                const infoSlsGlobal = idSlsPetugas ? masterSlsMap.get(String(idSlsPetugas).trim()) : null;
                
                let isLuarWilayahLast = false;
                if (infoSlsGlobal && infoSlsGlobal.petugas_id) {
                    if (infoSlsGlobal.petugas_id.toLowerCase().trim() !== cleanPclEmail) {
                        isLuarWilayahLast = true;
                    }
                }

                return {
                    email: pcl.email,
                    nama_pengguna: pcl.nama_petugas || 'Tanpa Nama',
                    kecamatan_tugas: pcl.kecamatan_tugas,
                    statusHariIni: checkInHariIni ? 'AKTIF' : 'ABSEN',
                    lastSls: idSlsPetugas || 'Belum Masuk SLS',
                    namaSlsLast: infoSlsGlobal?.nmsls || idSlsPetugas || 'Belum Masuk SLS',
                    namaDesaLast: infoSlsGlobal?.nmdesa || 'Kec. Ampel',
                    isLuarWilayahLast: isLuarWilayahLast, 
                    totalAbsenHariIni: totalCheckInHariIni,
                    absenDays: hariTanpaKabar,
                    history7Hari: tanggalMasukList, 
                    fotoBuktiHariIni: checkInHariIni?.foto_bukti || null
                };
            });

            setPcls(combinedData);
            setRekapStatusTim({ aktif: countAktif, absen: combinedData.length - countAktif });
            localStorage.setItem(`cache_pml_monitoring_list_${cleanPmlEmail}`, JSON.stringify(combinedData));

            const initialSlsInputs = {};
            slsKhususBinaan.forEach(s => {
                initialSlsInputs[s.idsubsls] = s.realisasi_pencacahan || 0;
            });
            setSlsInputs(initialSlsInputs);

        } catch (err) {
            console.error("Gagal memuat data online:", err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!authLoading) {
            fetchPmlData();
        }
    }, [authLoading]); 

useEffect(() => {
        const handlePmlSignalToggle = () => {
            checkOfflineInputQueueCount();
        };
        
        window.addEventListener('online', handlePmlSignalToggle);
        window.addEventListener('offline', handlePmlSignalToggle);
        
        // Jalankan sekali saat pertama kali aplikasi dimuat
        checkOfflineInputQueueCount();

        return () => {
            window.removeEventListener('online', handlePmlSignalToggle);
            window.removeEventListener('offline', handlePmlSignalToggle);
        };
    }, []);

    const handlePmlCapturePhoto = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setRawPmlPhotoFile(file);
    };

    const handleCaptureFotoEvaluasi = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setUploadFotoEvaluasiLoading(true);
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new window.Image();
            img.onload = () => {
                const MAX_WIDTH = 700; 
                let width = img.width;
                let height = img.height;

                if (width > MAX_WIDTH) {
                    height = Math.round((height * MAX_WIDTH) / width);
                    width = MAX_WIDTH;
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(img, 0, 0, width, height);
                    const compressedBase64 = canvas.toDataURL("image/jpeg", 0.6);
                    setFotoEvaluasiBase64(compressedBase64);
                }
                setUploadFotoEvaluasiLoading(false);
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    };

    // =========================================================================
    // OPTIMALISASI 2: WATERMARK ENGINE RAMAH MEMORI (OBJECT URL PREVIEW BLOB)
    // =========================================================================
    // =========================================================================
    // OPTIMALISASI 2: WATERMARK ENGINE RAMAH MEMORI (OBJECT URL PREVIEW BLOB)
    // =========================================================================
// =========================================================================
// OPTIMALISASI LIVE WATERMARK ENGINE - LEAN OBJECT URL (ANTI-STUCK GALERI)
// =========================================================================
useEffect(() => {
    if (!rawPmlPhotoFile || pmlCheckingIn) return;

    const batalkanKarenaError = (pesan) => {
        alert(pesan);
        setRawPmlPhotoFile(null);
        if (pmlPhotoPreview) URL.revokeObjectURL(pmlPhotoPreview);
        setPmlPhotoPreview(null);
        if (pmlCameraInputRef.current) pmlCameraInputRef.current.value = "";
        if (pmlGalleryInputRef.current) pmlGalleryInputRef.current.value = "";
    };

    const generateLivePmlWatermark = () => {
        // 🌟 PERBAIKAN UTAMA: Gunakan CreateObjectURL menggantikan FileReader raksasa
        const blobObjectUrl = URL.createObjectURL(rawPmlPhotoFile);
        const img = new window.Image();
        
        img.onerror = () => {
            URL.revokeObjectURL(blobObjectUrl);
            batalkanKarenaError("Berkas galeri tidak dapat didecode atau memori webview HP penuh. Silakan coba foto lain.");
        };

        img.onload = () => {
            try {
                // Keamanan dimensi: Mencegah canvas 0x0 jika file korup
                const MAX_WIDTH = 800;
                let width = img.width || MAX_WIDTH;
                let height = img.height || MAX_WIDTH;

                if (width > MAX_WIDTH) {
                    height = Math.round((height * MAX_WIDTH) / width);
                    width = MAX_WIDTH;
                }

                const canvas = canvasRef.current;
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                
                if (!ctx) {
                    URL.revokeObjectURL(blobObjectUrl);
                    batalkanKarenaError("Gagal menginisialisasi sistem rendering grafis canvas.");
                    return; 
                }
                
                ctx.drawImage(img, 0, 0, width, height);

                // Setelah berhasil digambar ke canvas, langsung bebaskan pointer memori blob
                URL.revokeObjectURL(blobObjectUrl);

                let nmsls = pmlCoords?.nmsls || "";
                let nmdesa = pmlCoords?.nmdesa || "";
                let nmkec = profile?.kecamatan_tugas ? profile.kecamatan_tugas.replace(/^\d+\s*/, '') : "";

                if (manualMode && selectedManualSls) {
                    const match = allSlsFlat.find(s => String(s.idsubsls).trim() === String(selectedManualSls).trim());
                    if (match) {
                        nmsls = match.nmsls;
                        nmdesa = match.nmdesa;
                    } else {
                        nmsls = "PENGAWASAN MANUAL";
                    }
                }

                // Antisipasi jika user upload foto di awal sebelum memilih dropdown SLS manual
                let wilayahTeks = "MEMINDAI WILAYAH...";
                if (manualMode) {
                    wilayahTeks = nmsls || "PENGAWASAN MANUAL (SLS BELUM DIPILIH)";
                    if (nmdesa) wilayahTeks += ` - DESA ${nmdesa}`;
                    if (nmkec) wilayahTeks += ` - KEC. ${nmkec}`;
                } else if (pmlCoords?.idsubsls === 'WILAYAH-PML' || isPmlOutsideBorder) {
                    wilayahTeks = nmsls || "DI LUAR WILAYAH TUGAS RESMI";
                    if (nmdesa && nmdesa !== "Desa Terdeteksi") wilayahTeks += ` - DESA ${nmdesa}`;
                    if (nmkec) wilayahTeks += ` - KEC. ${nmkec}`;
                } else if (nmsls) {
                    wilayahTeks = nmsls;
                    if (nmdesa) wilayahTeks += ` - DESA ${nmdesa}`;
                    if (nmkec) wilayahTeks += ` - KEC. ${nmkec}`;
                }

                const tglTeks = manualMode 
                    ? `${selectedManualDate} (UPLOAD MANUAL)` 
                    : new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });

                const latTeks = pmlCoords?.latitude ? pmlCoords.latitude.toFixed(6) : "TIDAK TERDETEKSI";
                const lonTeks = pmlCoords?.longitude ? pmlCoords.longitude.toFixed(6) : "TIDAK TERDETEKSI";
                                
                const panelHeight = 135;
                ctx.fillStyle = "rgba(15, 23, 42, 0.88)"; 
                ctx.fillRect(0, height - panelHeight, width, panelHeight);
                ctx.fillStyle = "#f97316"; 
                ctx.fillRect(0, height - panelHeight, width, 4);

                ctx.fillStyle = "#ffffff";
                ctx.font = "bold 15px sans-serif";
                ctx.fillText(`PENGAWASAN SENSUS EKONOMI 2026`, 20, height - 105);

                ctx.fillStyle = "#38bdf8"; 
                ctx.font = "bold 12px sans-serif";
                ctx.fillText(`NAMA PETUGAS : ${String(profile?.nama_pengguna || 'PENGAWAS LAPANGAN').toUpperCase()}`, 20, height - 82);

                ctx.fillStyle = "#fbbf24"; 
                ctx.font = "bold 12px sans-serif";
                ctx.fillText(`LOKASI    : ${String(wilayahTeks).toUpperCase()}`, 20, height - 60);

                ctx.fillStyle = "#cbd5e1"; 
                ctx.font = "11px monospace";
                ctx.fillText(`WAKTU    : ${tglTeks} WIB`, 20, height - 38);
                ctx.fillText(`KOORDINAT: LAT ${latTeks} | LON ${lonTeks}`, 20, height - 18);

                canvas.toBlob((blob) => {
                    if (blob) {
                        if (pmlPhotoPreview) URL.revokeObjectURL(pmlPhotoPreview);
                        const previewUrl = URL.createObjectURL(blob);
                        setPmlPhotoPreview(previewUrl);
                    }
                }, "image/jpeg", 0.6);

            } catch (canvasErr) {
                URL.revokeObjectURL(blobObjectUrl);
                console.error("Canvas Crash:", canvasErr);
                batalkanKarenaError("Gagal menempelkan watermark karena batasan memori HP.");
            }
        };

        // Pasang pointer virtual langsung ke src objek image
        img.src = blobObjectUrl;
    };

    generateLivePmlWatermark();
}, [rawPmlPhotoFile, pmlCheckingIn, pmlCoords, profile, allSlsFlat, isPmlOutsideBorder, manualMode, selectedManualSls, selectedManualDate]);

    const isPointInPolygon = (point, vs) => {
        const x = point[0], y = point[1];
        let inside = false;
        for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
            const xi = vs[i][0], yi = vs[i][1];
            const xj = vs[j][0], yj = vs[j][1];
            const intersect = ((yi > y) !== (yj > y))
                && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    };

    // =========================================================================
    // OPTIMALISASI 1: FUNGSIONAL PROSES GEOJSON DENGAN INTERNAL IN-MEMORY CACHE
    // =========================================================================
 // =========================================================================
    // OPTIMALISASI 1: FUNGSIONAL PROSES GEOJSON DENGAN INTERNAL IN-MEMORY CACHE
    // =========================================================================
    const prosesPencarianGeojson = async (latitude, longitude) => {
        const kodeKec = getKecamatanCode();
        if (!kodeKec) return null;

        try {
            let geojsonData;
            // Jika data geojson sudah ada di cache memory, pakai langsung tanpa fetch ulang HTTP
            if (geojsonCache[kodeKec]) {
                geojsonData = geojsonCache[kodeKec];
            } else {
                const response = await fetch(`/geojson/${kodeKec}.geojson`);
                geojsonData = await response.json();
                geojsonCache[kodeKec] = geojsonData; // Kunci data ke cache global
            }

            // Loop linear pencarian poligon wilayah SLS BPS
            for (let feature of geojsonData.features) {
                const geometri = feature.geometry;
                const props = feature.properties;

                // Helper format agar seragam menampung properti kdkec
                const formatOutput = (p) => ({
                    idsubsls: p.idsubsls || p.IDSUBSLS,
                    nmsls: p.nmsls || p.NMSLS || "SLS Terdeteksi",
                    nmdesa: p.nmdesa || p.NMDESA || "Desa Terdeteksi",
                    kdkec: p.kdkec || p.KDKEC // 🌟 Menangkap kode kecamatan murni (ex: "010")
                });

                if (geometri.type === "Polygon") {
                    const koordinatPoligon = geometri.coordinates[0];
                    if (isPointInPolygon([longitude, latitude], koordinatPoligon)) {
                        return formatOutput(props);
                    }
                } 
                else if (geometri.type === "MultiPolygon") {
                    for (let polygon of geometri.coordinates) {
                        if (isPointInPolygon([longitude, latitude], polygon[0])) {
                            return formatOutput(props);
                        }
                    }
                }
            }
        } catch (err) {
            console.error("Gagal membaca berkas spasial luring PML:", err.message);
        }
        return null;
    };

const handleTriggerPmlLocation = () => {
        if (!navigator.geolocation) {
            alert("HP Anda memblokir fitur lokasi.");
            return;
        }

        if (pmlCameraInputRef.current) pmlCameraInputRef.current.value = "";
        if (pmlGalleryInputRef.current) pmlGalleryInputRef.current.value = "";

        setPmlCheckingIn(true);
        setIsPmlOutsideBorder(false);
        setShowPmlValidationDialog(false);
        setManualMode(false);
        setSelectedManualSls("");
        if (pmlPhotoPreview) URL.revokeObjectURL(pmlPhotoPreview);
        setPmlPhotoPreview(null);
        setRawPmlPhotoFile(null);
        setShowPmlCameraCard(true); 

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude } = position.coords;
                const hasilSlsMandiri = await prosesPencarianGeojson(latitude, longitude);
                const kodeKecTugas = getKecamatanCode(); 

                if (hasilSlsMandiri) {
                    setPmlCoords({
                        latitude,
                        longitude,
                        idsubsls: hasilSlsMandiri.idsubsls,
                        nmsls: hasilSlsMandiri.nmsls,
                        nmdesa: hasilSlsMandiri.nmdesa,
                        kdkec: hasilSlsMandiri.kdkec // Simpan ke state koordinat pml
                    });

                    // 🌟 PERBAIKAN UTAMA: Bandingkan kode kecamatan murni ("010" === "010")
                    const kecTerdeteksi = String(hasilSlsMandiri.kdkec).trim();
                    const kecTugasClean = String(kodeKecTugas).trim();

                    if (kecTerdeteksi !== kecTugasClean) {
                        setIsPmlOutsideBorder(true);
                        setShowPmlValidationDialog(true); 
                    } else {
                        setIsPmlOutsideBorder(false);
                        setShowPmlValidationDialog(false);
                    }
                } else {
                    setPmlCoords({
                        latitude,
                        longitude,
                        idsubsls: 'WILAYAH-PML',
                        nmsls: 'Di Luar Poligon SLS',
                        nmdesa: 'Desa Terdeteksi'
                    });
                    setIsPmlOutsideBorder(true);
                    setShowPmlValidationDialog(true); 
                }
                setPmlCheckingIn(false);
            },
            () => {
                setPmlCoords({ latitude: null, longitude: null, idsubsls: 'WILAYAH-PML', nmsls: 'Sinyal GPS Lemah', nmdesa: 'Desa Terdeteksi' });
                setManualMode(true);
                setPmlCheckingIn(false);
                alert("⚠️ Sinyal satelit GPS lemah. Aplikasi beralih otomatis ke mode pilihan manual.");
            },
            { enableHighAccuracy: true, timeout: 25000 }
        );

        pmlCameraInputRef.current?.click();
    };

const submitPmlCheckIn = async () => {
    if (submitSiklusLoading) return; 

    const pmlEmail = user?.email || profile?.email;
    if (!pmlEmail) {
        alert("Email pengguna tidak terdeteksi. Silakan masuk log kembali.");
        return;
    }

    const tglHariIni = manualMode ? selectedManualDate : getTodayDateString();
    const tglRealtimeHariIni = getTodayDateString(); // Kunci penentu realtime hari ini

    if (!pmlPhotoPreview) {
        alert("Wajib mengambil foto bukti pengawasan lapangan atau tunggu hingga sistem selesai memproses gambar!");
        return;
    }

    setSubmitSiklusLoading(true);

    const idSlsClean = manualMode ? String(selectedManualSls).trim() : (pmlCoords?.idsubsls ? String(pmlCoords.idsubsls).trim() : 'WILAYAH-PML');
    const namaClean = profile?.nama_pengguna ? profile.nama_pengguna.replace(/\s+/g, '_').toUpperCase() : 'PENGAWAS';
    const tglClean = tglHariIni.replace(/-/g, ''); 
    
    const namaFileUnik = `SE26_PML_${idSlsClean}_${namaClean}_${tglClean}.jpg`;
    
    // Ambil data Base64 dari canvas persisten untuk diamankan ke IndexedDB jika luring/gagal
    const canvas = canvasRef.current;
    const livePhotoBase64 = canvas ? canvas.toDataURL("image/jpeg", 0.6) : null;

    // Siapkan struktur data offline terpadu (Sesuai skema tabel Supabase + metadata pendukung)
    const payloadOffline = {
        tanggal: tglHariIni,
        pml_email: pmlEmail.toLowerCase().trim(),
        idsubsls: idSlsClean,
        latitude: pmlCoords?.latitude || null,
        longitude: pmlCoords?.longitude || null,
        foto_base64: livePhotoBase64, // Disimpan lokal untuk diupload saat online nanti
        nama_file: namaFileUnik,
        created_at: new Date().toISOString()
    };

    // Helper internal untuk mengunci data absen ke IndexedDB secara aman
    const simpanAbsenKeIndexedDB = async () => {
        try {
            const db = await initPmlOfflineDB();
            const tx = db.transaction("pending_absen_pml", "readwrite");
            await tx.objectStore("pending_absen_pml").add(payloadOffline);
            
            // Perbarui jumlah antrean di dashboard (pastikan fungsi ini eksis di state utama)
            if (typeof checkOfflineInputQueueCount === "function") {
                await checkOfflineInputQueueCount();
            }
        } catch (dbErr) {
            console.error("Gagal mengunci database IndexedDB:", dbErr.message);
            alert("⚠️ Memori browser/HP penuh, gagal menyimpan backup luring.");
        }
    };

    // ==========================================
    // BLOK KONDISI LURING / OFFLINE
    // ==========================================
    if (!navigator.onLine) {
        // Amankan data menyeluruh beserta fotonya ke IndexedDB
        await simpanAbsenKeIndexedDB();

        localStorage.setItem(`cache_pml_last_idsls_${pmlEmail.toLowerCase().trim()}_${tglHariIni}`, idSlsClean);
        
        if (tglHariIni === tglRealtimeHariIni) {
            localStorage.setItem(`cache_pml_checkedin_${pmlEmail.toLowerCase().trim()}_${tglHariIni}`, 'true');
            setPmlCheckedInToday(true);
        }
        
        alert("💾 Absen & Foto Pendampingan PML berhasil dikunci offline di HP!");
        resetPmlForm();
        setSubmitSiklusLoading(false);
        return;
    }

    // ==========================================
    // BLOK KONDISI DARING / ONLINE
    // ==========================================
    try {
        let finalFotoUrl = "OFFLINE_LINK";

        // 1. Unggah gambar ke server Google Drive via GAS
        const gasUrl = "https://script.google.com/macros/s/AKfycbwtBgrsYjqda1azzjFTaZRPrjh5Unv1bleWjdnwua3lQrRfR_AIjTDmR-5NIGKrSEM/exec";
        const responseGas = await fetch(gasUrl, {
            method: "POST",
            body: JSON.stringify({
                fotoBase64: livePhotoBase64,
                namaFile: namaFileUnik
            })
        });
        
        const hasilGas = await responseGas.json();
        
        // Validasi respon dari sistem GAS agar tidak lolos saat kuota limit/error script Google
        if (hasilGas && hasilGas.status === "success") {
            finalFotoUrl = hasilGas.url;
        } else {
            throw new Error(hasilGas?.message || "Google Apps Script menolak unggahan berkas.");
        }

        // 2. Insert log koordinat dan URL gambar akhir ke Supabase
        const { error } = await supabase
            .from('log_checkin_pml')
            .insert({
                tanggal: tglHariIni,
                pml_email: pmlEmail.toLowerCase().trim(),
                idsubsls: idSlsClean,
                latitude: pmlCoords?.latitude || null,
                longitude: pmlCoords?.longitude || null,
                foto_bukti: finalFotoUrl
            });

        if (error) throw error;

        if (tglHariIni === tglRealtimeHariIni) {
            localStorage.setItem(`cache_pml_checkedin_${pmlEmail.toLowerCase().trim()}_${tglHariIni}`, 'true');
            setPmlCheckedInToday(true);
        }

        alert("✅ Absen Pengawasan Lapangan Berhasil Tersimpan ke Server!");
        resetPmlForm();
    } catch (err) {
        console.warn("Gangguan koneksi daring, mengalihkan ke sistem backup lokal:", err.message);
        
        // Jika skrip macet di tengah jalan saat upload online, amankan ke antrean IndexedDB
        await simpanAbsenKeIndexedDB();

        localStorage.setItem(`cache_pml_last_idsls_${pmlEmail.toLowerCase().trim()}_${tglHariIni}`, idSlsClean);
        
        if (tglHariIni === tglRealtimeHariIni) {
            localStorage.setItem(`cache_pml_checkedin_${pmlEmail.toLowerCase().trim()}_${tglHariIni}`, 'true');
            setPmlCheckedInToday(true);
        }

        alert("⚠️ Gagal mengirim data online, absen & FOTO disimpan aman di lokal HP!");
        resetPmlForm();
    } finally {
        setSubmitSiklusLoading(false);
    }
};

    // =========================================================================
    // ACTION HANDLERS: SIMPAN REALISASI LANGSUNG PER SLS DAN VERIFIKASI SIKLUS
    // =========================================================================
    const handleSaveSlsProgressDirect = useCallback(async (idsubsls, jumlah) => {
        const pmlEmail = user?.email || profile?.email;

        if (jumlah === undefined || jumlah < 0 || jumlah === "") {
            alert("Masukkan angka capaian realisasi yang valid.");
            return;
        }

        setActionLoading(idsubsls);
        const payload = {
            idsubsls,
            realisasi_pencacahan: parseInt(jumlah),
            pml_updater: pmlEmail.toLowerCase().trim(),
            updated_at: new Date().toISOString()
        };

        if (!navigator.onLine) {
            try {
                const db = await initPmlOfflineDB();
                const tx = db.transaction("pending_realisasi", "readwrite");
                tx.objectStore("pending_realisasi").add({ ...payload, isDirectSls: true });

                setAllSlsFlat(prev => prev.map(s => s.idsubsls === idsubsls ? { ...s, realisasi_pencacahan: parseInt(jumlah) } : s));
                setSlsInputs(prev => ({ ...prev, [idsubsls]: parseInt(jumlah) }));
                alert("💾 Data Capaian SLS Berhasil Dikunci Offline di HP!");
                await checkOfflineInputQueueCount();
            } catch (e) { alert(e.message); } finally { setActionLoading(null); }
            return;
        }

        try {
            const { error } = await supabase.from('muatan_sls').update({ realisasi_pencacahan: parseInt(jumlah) }).eq('idsubsls', idsubsls);
            if (error) throw error;
            setSlsInputs(prev => ({ ...prev, [idsubsls]: parseInt(jumlah) }));
            setAllSlsFlat(prev => prev.map(s => s.idsubsls === idsubsls ? { ...s, realisasi_pencacahan: parseInt(jumlah) } : s));
            alert("✅ Progres SLS Sukses Diunggah!");
        } catch (err) { alert(err.message); } finally { setActionLoading(null); }
    }, [user, profile]);

    const handleTriggerEvaluasiFlow = () => {
        if (!filteredSlsInputs || filteredSlsInputs.length === 0) {
            alert("Tidak ada data SLS untuk dilaporkan!");
            return;
        }
        setShowEvaluasiModal(true);
    };

    const handleFinalSubmitEvaluasi = async () => {
        if (submitSiklusLoading) return;
        if (!kendalaLapangan.trim() || !solusiLapangan.trim() || !fotoEvaluasiBase64) {
            alert("Wajib mengisi Kendala Lapangan, Solusi Terpilih, dan Foto sebelum mengirim evaluasi!");
            return;
        }

        const pmlEmail = user?.email || profile?.email;
        const now = new Date();
        const tglHariIni = now.toISOString().split('T')[0];

        setSubmitSiklusLoading(true);

        try {
            let finalFotoEvaluasiUrl = null;

            if (fotoEvaluasiBase64 && navigator.onLine) {
                const namaClean = profile?.nama_pengguna ? profile.nama_pengguna.replace(/\s+/g, '_').toUpperCase() : 'PML';
                const namaFileEvaluasi = `EVAL_SE26_${namaClean}_${tglHariIni.replace(/-/g, '')}.jpg`;
                const gasUrl = "https://script.google.com/macros/s/AKfycbwtBgrsYjqda1azzjFTaZRPrjh5Unv1bleWjdnwua3lQrRfR_AIjTDmR-5NIGKrSEM/exec";
                
                const responseGas = await fetch(gasUrl, {
                    method: "POST",
                    body: JSON.stringify({
                        fotoBase64: fotoEvaluasiBase64,
                        namaFile: namaFileEvaluasi
                    })
                });
                const hasilGas = await responseGas.json();
                
                if (hasilGas.status === "success") {
                    finalFotoEvaluasiUrl = hasilGas.url;
                }
            }

// ====== SUNTIKAN 4: AGREGASI OTOMATIS DATA REALISASI DARI JSONB DASHBOARD ======
            const dataRealisasiFormatted = filteredSlsInputs.map(sls => {
                // Cari cocok data progress JSONB di memori untuk SLS ini
                const match = realtimeProgressData?.find(p => String(p.idsubsls).trim() === String(sls.idsubsls).trim());
                const statusObj = match?.status_progres || {};

                // Hitung total akumulasi dokumen riil lapangan (Approved + Submitted + Draft + Rejected + Revoked)
                const totalAkumulasiOtomatis = 
                    (statusObj["APPROVED BY Pengawas"] || 0) +
                    (statusObj["SUBMITTED BY Pencacah"] || 0) +
                    (statusObj["DRAFT"] || 0) +
                    (statusObj["REJECTED BY Pengawas"] || 0) +
                    (statusObj["REVOKED BY Pengawas"] || 0);

                return {
                    idsubsls: sls.idsubsls,
                    realisasi: totalAkumulasiOtomatis // Otomatis menggunakan angka agregasi riil database
                };
            });
// ====== AKHIR SUNTIKAN 4 ======
            const { error } = await supabase
                .from('log_realisasi_pml')
                .upsert({
                    tanggal: tglHariIni,
                    pml_email: pmlEmail.toLowerCase().trim(),
                    data_realisasi: dataRealisasiFormatted,
                    kendala_lapangan: kendalaLapangan,
                    solusi_lapangan: solusiLapangan,
                    foto_evaluasi: finalFotoEvaluasiUrl || "KOSONG_ATAU_OFFLINE"
                }, { onConflict: 'tanggal,pml_email' });

            if (error) throw error;
            
            alert("Laporan Evaluasi Lapangan Berhasil Dikirim ke Kabupaten!");
            
            setKendalaLapangan("");
            setSolusiLapangan("");
            setFotoEvaluasiBase64(null);
            setShowEvaluasiModal(false);

        } catch (err) {
            console.error("Gagal mengirim data evaluasi menyeluruh:", err.message);
            alert("Gagal mengirim laporan evaluasi: " + err.message);
        } finally {
            setSubmitSiklusLoading(false);
        }
    };

    const handleToggleSlsSelesai = useCallback(async (idsubsls, currentStatus) => {
        const pmlEmail = user?.email || profile?.email;
        const nextStatus = !currentStatus;

        setActionLoading(`status-${idsubsls}`);
        const tglSekarang = new Date().toISOString();

        if (!navigator.onLine) {
            try {
                const db = await initPmlOfflineDB();
                const tx = db.transaction("pending_realisasi", "readwrite");
                tx.objectStore("pending_realisasi").add({
                    idsubsls,
                    is_selesai: nextStatus,
                    pml_validator: pmlEmail.toLowerCase().trim(),
                    validated_at: tglSekarang,
                    isStatusToggle: true 
                });

                setAllSlsFlat(prev => prev.map(s => s.idsubsls === idsubsls ? { 
                    ...s, 
                    is_selesai: nextStatus,
                    pml_validator: pmlEmail.toLowerCase().trim(),
                    validated_at: tglSekarang
                } : s));

                alert(`💾 Status SLS Berhasil Ditandai ${nextStatus ? 'SELESAI' : 'BELUM SELESAI'} (Lokal/Offline)!`);
                await checkOfflineInputQueueCount();
            } catch (e) { 
                alert("Gagal menyimpan offline: " + e.message); 
            } finally { 
                setActionLoading(null); 
            }
            return;
        }

        try {
            const { error } = await supabase
                .from('muatan_sls')
                .update({ 
                    is_selesai: nextStatus,
                    pml_validator: nextStatus ? pmlEmail.toLowerCase().trim() : null,
                    validated_at: nextStatus ? tglSekarang : null
                })
                .eq('idsubsls', idsubsls);

            if (error) throw error;
            setAllSlsFlat(prev => prev.map(s => s.idsubsls === idsubsls ? { 
                ...s, 
                is_selesai: nextStatus,
                pml_validator: nextStatus ? pmlEmail.toLowerCase().trim() : null,
                validated_at: tglSekarang
            } : s));
            alert(`SLS Berhasil Diperbarui Menjadi: ${nextStatus ? 'SELESAI' : 'BELUM SELESAI'}`);
        } catch (err) { 
            alert(err.message); 
        } finally { 
            setActionLoading(null); 
        }
    }, [user, profile]);

    // =========================================================================
    // OPTIMALISASI 3: PROSES SINKRONISASI MASSAL MENGGUNAKAN TEKNIK BULK UPSERT
    // =========================================================================
const handleSyncPmlOfflineInputs = async () => {
    setIsSyncingInput(true);
    try {
        const db = await initPmlOfflineDB();
        let totalSuksesCount = 0;

        // =========================================================================
        // SINKRONISASI 1: AMBIL & PROSES ANTREAN REALISASI SLS (STORE: pending_realisasi)
        // =========================================================================
        const recordsRealisasi = await new Promise((resolve) => {
            const txRead = db.transaction("pending_realisasi", "readonly");
            const storeRead = txRead.objectStore("pending_realisasi");
            const req = storeRead.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
        });

        const bulkProgressRecords = [];
        const statusToggleRecords = [];
        const idRealisasiToDelete = [];

        recordsRealisasi.forEach(record => {
            if (record.isDirectSls) {
                bulkProgressRecords.push({
                    idsubsls: record.idsubsls,
                    realisasi_pencacahan: record.realisasi_pencacahan,
                    pml_updater: record.pml_updater,
                    updated_at: record.updated_at
                });
                idRealisasiToDelete.push(record.id);
            } else if (record.isStatusToggle) {
                statusToggleRecords.push(record);
                idRealisasiToDelete.push(record.id);
            }
        });

        // Eksekusi Bulk Upsert Realisasi ke Supabase
        if (bulkProgressRecords.length > 0) {
            const { error: progressBulkError } = await supabase
                .from('muatan_sls')
                .upsert(bulkProgressRecords, { onConflict: 'idsubsls' });
            
            if (!progressBulkError) {
                totalSuksesCount += bulkProgressRecords.length;
            } else {
                console.error("Gagal melakukan bulk progress:", progressBulkError.message);
            }
        }

        // Eksekusi Update Status Selesai SLS satu per satu
        for (let statusRecord of statusToggleRecords) {
            try {
                const { error: statusErr } = await supabase
                    .from('muatan_sls')
                    .update({
                        is_selesai: statusRecord.is_selesai,
                        pml_validator: statusRecord.is_selesai ? statusRecord.pml_validator : null,
                        validated_at: statusRecord.is_selesai ? statusRecord.validated_at : null
                    })
                    .eq('idsubsls', statusRecord.idsubsls);

                if (!statusErr) totalSuksesCount++;
            } catch (err) {
                console.error("Gagal sync status selesai SLS:", err);
            }
        }

        // Bersihkan data antrean realisasi yang sukses terunggah dari IndexedDB
        if (idRealisasiToDelete.length > 0) {
            const txDelete = db.transaction("pending_realisasi", "readwrite");
            const storeDelete = txDelete.objectStore("pending_realisasi");
            idRealisasiToDelete.forEach(id => storeDelete.delete(id));
        }

        // =========================================================================
        // SINKRONISASI 2: AMBIL & PROSES ANTREAN ABSEN PML (STORE: pending_absen_pml)
        // =========================================================================
        const recordsAbsen = await new Promise((resolve) => {
            if (!db.objectStoreNames.contains("pending_absen_pml")) return resolve([]);
            const txAbsenRead = db.transaction("pending_absen_pml", "readonly");
            const storeAbsenRead = txAbsenRead.objectStore("pending_absen_pml");
            const req = storeAbsenRead.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
        });

        const idAbsenToDelete = [];

        // Loop berurutan (for...of) untuk mencegah lonjakan request upload gambar (antrean ramah memori)
        for (let absenRecord of recordsAbsen) {
            try {
                let finalFotoUrl = "OFFLINE_LINK";

                // 1. Kirim ulang gambar Base64 ke Google Apps Script
                if (absenRecord.foto_base64) {
                    const gasUrl = "https://script.google.com/macros/s/AKfycbwtBgrsYjqda1azzjFTaZRPrjh5Unv1bleWjdnwua3lQrRfR_AIjTDmR-5NIGKrSEM/exec";
                    const responseGas = await fetch(gasUrl, {
                        method: "POST",
                        body: JSON.stringify({
                            fotoBase64: absenRecord.foto_base64,
                            namaFile: absenRecord.nama_file
                        })
                    });
                    const hasilGas = await responseGas.json();
                    if (hasilGas && hasilGas.status === "success") {
                        finalFotoUrl = hasilGas.url;
                    }
                }

                // 2. Lempar rekap koordinat dan URL gambar Google Drive ke Supabase
                const { error: supabaseAbsenErr } = await supabase
                    .from('log_checkin_pml')
                    .insert({
                        tanggal: absenRecord.tanggal,
                        pml_email: absenRecord.pml_email,
                        idsubsls: absenRecord.idsubsls,
                        latitude: absenRecord.latitude,
                        longitude: absenRecord.longitude,
                        foto_bukti: finalFotoUrl
                    });

                if (!supabaseAbsenErr) {
                    totalSuksesCount++;
                    idAbsenToDelete.push(absenRecord.id);
                } else {
                    console.error("Supabase menolak log checkin absen:", supabaseAbsenErr.message);
                }
            } catch (singleAbsenErr) {
                console.error("Gagal menyinkronkan 1 item absen PML:", singleAbsenErr.message);
            }
        }

        // Bersihkan data antrean absen yang sukses terunggah dari IndexedDB
        if (idAbsenToDelete.length > 0) {
            const txAbsenDelete = db.transaction("pending_absen_pml", "readwrite");
            const storeAbsenDelete = txAbsenDelete.objectStore("pending_absen_pml");
            idAbsenToDelete.forEach(id => storeAbsenDelete.delete(id));
        }

        // =========================================================================
        // FINALISASI: SELESAI SINKRONISASI MASAL
        // =========================================================================
        alert(`📡 Sinkronisasi Selesai! Berhasil mengunggah total ${totalSuksesCount} perubahan data lapangan (SLS & Absen) ke server.`);
        
        // Refresh indikator antrean dan rekap dashboard
        if (typeof checkOfflineInputQueueCount === "function") await checkOfflineInputQueueCount();
        if (typeof fetchPmlData === "function") await fetchPmlData();

    } catch (err) {
        console.error("Kegagalan total sistem sinkronisasi masal:", err.message);
        alert("Gagal sinkronisasi data: " + err.message);
    } finally {
        setIsSyncingInput(false);
    }
};

    // =========================================================================
    // FILTERING & MEMOIZATION DATA FILTER ARRAY
    // =========================================================================
    const filteredPcls = useMemo(() => {
        const lowerSearch = searchTerm.toLowerCase();
        return pcls.filter(p => p.nama_pengguna.toLowerCase().includes(lowerSearch));
    }, [pcls, searchTerm]);

    const filteredSlsInputs = useMemo(() => {
        return selectedDesa === "SEMUA" ? allSlsFlat : allSlsFlat.filter(s => s.nmdesa === selectedDesa);
    }, [allSlsFlat, selectedDesa]);

    const groupedSlsByPetugas = useMemo(() => {
        const sortedSls = [...filteredSlsInputs].sort((a, b) => {
            const compareDesa = (a.nmdesa || "").localeCompare(b.nmdesa || "");
            if (compareDesa !== 0) return compareDesa;
            return (a.kdsls || "").localeCompare(b.kdsls || "");
        });

        const pclsMap = new Map(pcls.map(p => [p.email.toLowerCase().trim(), p.nama_pengguna]));
        const groups = {};
        
        sortedSls.forEach((sls) => {
            const petugasKey = sls.petugas_id ? sls.petugas_id.toLowerCase().trim() : "BELUM ADA PETUGAS";
            const namaTampil = pclsMap.get(petugasKey) || sls.petugas_id || "BELUM ADA PETUGAS";

            if (!groups[namaTampil]) {
                groups[namaTampil] = [];
            }
            groups[namaTampil].push(sls);
        });

        return groups;
    }, [filteredSlsInputs, pcls]);

    const handleTouchStart = (e) => { setTouchEnd(null); setTouchStart(e.targetTouches[0].clientX); };
    const handleTouchMove = (e) => { setTouchEnd(e.targetTouches[0].clientX); };
    const handleTouchEnd = () => {
        if (!touchStart || !touchEnd) return;
        const distance = touchStart - touchEnd;
        if (distance > 60 && activeTab === 0) setActiveTab(1);
        if (distance < -60 && activeTab === 1) setActiveTab(0);
    };

    if (authLoading || loading) {
        return (
            <div className="h-screen bg-slate-50 flex flex-col justify-center items-center p-6 text-center">
                <RefreshCw className="animate-spin text-indigo-600 mb-3" size={32} />
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Memuat Dashboard Pengawasan...</p>
            </div>
        );
    }

    return (
        <div
            className="h-[100dvh] w-screen bg-slate-50 font-sans flex flex-col relative overflow-hidden text-slate-800"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            {/* HIDDEN INPUT UTAMA: Selalu dipaksa membuka hardware kamera secara mutlak */}
            <input 
                type="file" 
                ref={pmlCameraInputRef} 
                accept="image/*" 
                capture="user" 
                className="hidden" 
                onChange={handlePmlCapturePhoto} 
            />

            {/* HIDDEN INPUT GALERI: Polosan tanpa capture untuk memberikan akses ke album media galeri */}
            <input 
                type="file" 
                ref={pmlGalleryInputRef} 
                accept="image/*" 
                className="hidden" 
                onChange={handlePmlCapturePhoto} 
            />

            <div className="flex-1 overflow-y-auto px-4 pt-4 pb-24">

                {/* BOX PROFIL UTAMA */}
                <div className="bg-slate-900 text-white rounded-3xl p-5 shadow-xl border border-slate-800 mb-4">
                    <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0 flex-1">
                            <span className="text-[9px] bg-indigo-600 text-white px-2 py-0.5 rounded-full font-black uppercase tracking-wider">
                                Pengawas Lapangan (PML) {!navigator.onLine && "- LURING"}
                            </span>
                            <h2 className="text-base font-black mt-1 uppercase tracking-tight truncate max-w-[180px]">
                                {profile?.nama_pengguna}
                            </h2>
                            <p className="text-[10px] text-slate-400 font-medium mt-0.5 truncate max-w-[180px]">
                                Kecamatan: <span className="text-indigo-400">{profile?.kecamatan_tugas}</span>
                            </p>
                        </div>
                        
                        <div className="flex items-center gap-1.5 shrink-0">
                            <button
                                disabled={!navigator.onLine}
                                onClick={fetchPmlData}
                                className="p-2 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-400 rounded-xl transition-all disabled:opacity-30"
                                title="Sinkron Data"
                            >
                                <RefreshCw size={16} />
                            </button>
                            
                            <button
                                onClick={logout} 
                                className="p-2 bg-rose-500/10 hover:bg-rose-500/20 active:scale-95 text-rose-400 rounded-xl border border-rose-500/20 transition-all"
                                title="Keluar Akun"
                            >
                                <LogOut size={16} />
                            </button>
                        </div>
                    </div>

                    {/* ABSEN PENGAWASAN */}
<div className="mt-4 pt-4 border-t border-slate-800/60 space-y-3">
    {/* 1. Tampilkan Banner Sukses secara Mandiri (Hanya muncul jika sudah absen hari ini) */}
    {pmlCheckedInToday && (
        <div className="w-full bg-emerald-600/10 text-emerald-400 border border-emerald-500/20 rounded-2xl py-2.5 px-4 flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wide">
            <CheckCircle2 size={14} className="text-emerald-400" />
            <span>Anda Sudah Melakukan Pengawasan Hari Ini</span>
        </div>
    )}

    {/* 2. Logika Alur Kamera / Form Manual & Tombol Utama (Sekarang terbuka bebas) */}
    {!showPmlCameraCard ? (
        <button
            onClick={handleTriggerPmlLocation}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white rounded-2xl py-3 px-4 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20 active:scale-[0.98] transition-all"
        >
            <Navigation size={14} className="fill-white" />
            <span>{pmlCheckedInToday ? "Tambah Lokasi / Absen Lagi" : "Absen Pendampingan Lapangan"}</span>
        </button>
    ) : (
        <div className="bg-slate-800 border border-slate-700 p-3 rounded-2xl space-y-3 animate-fadeIn">
            <span className="text-[9px] font-black uppercase text-slate-400 bg-slate-700 px-1.5 py-0.5 rounded block text-center">
                {manualMode ? "Form Input Pendampingan Manual" : "Rangkuman Foto & Deteksi Lokasi"}
            </span>

            {pmlPhotoPreview ? (
                <div className="relative rounded-xl overflow-hidden border border-slate-600">
                    <img src={pmlPhotoPreview} alt="PML Bukti" className="w-full h-32 object-cover" />
                    <div className="absolute bottom-2 right-2 flex gap-1.5">
                        <button 
                            onClick={() => {
                                if(pmlCameraInputRef.current) pmlCameraInputRef.current.value = "";
                                pmlCameraInputRef.current?.click();
                            }} 
                            className="bg-orange-500/90 text-white px-2 py-1.5 rounded-xl text-[9px] font-black cursor-pointer uppercase flex items-center gap-1"
                        >
                            <Camera size={10} /> Kamera
                        </button>
                        <button 
                            onClick={() => {
                                if(pmlGalleryInputRef.current) pmlGalleryInputRef.current.value = "";
                                pmlGalleryInputRef.current?.click();
                            }} 
                            className="bg-indigo-600/90 text-white px-2 py-1.5 rounded-xl text-[9px] font-black cursor-pointer uppercase flex items-center gap-1"
                        >
                            <Image size={10} /> Galeri
                        </button>
                    </div>
                </div>
            ) : rawPmlPhotoFile ? (
                <div className="flex items-center justify-center gap-2 py-5 text-xs font-bold text-slate-400 uppercase tracking-widest bg-slate-900 rounded-xl border border-slate-700/50">
                    <RefreshCw className="animate-spin text-orange-500" size={14} />
                    <span>Membuat Watermark Spasial...</span>
                </div>
            ) : manualMode ? (
                <div className="p-4 bg-slate-900 border border-slate-700 rounded-xl text-center space-y-2.5 animate-fadeIn">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Dokumen Bukti Diperlukan</p>
                    <div className="flex gap-2 justify-center">
                        <button
                            type="button"
                            onClick={() => {
                                if(pmlCameraInputRef.current) pmlCameraInputRef.current.value = "";
                                pmlCameraInputRef.current?.click();
                            }}
                            className="flex-1 bg-orange-500 hover:bg-orange-600 active:scale-95 text-white px-3 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all inline-flex items-center justify-center gap-1.5 shadow-sm"
                        >
                            <Camera size={14} />
                            <span>Kamera</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                if(pmlGalleryInputRef.current) pmlGalleryInputRef.current.value = "";
                                pmlGalleryInputRef.current?.click();
                            }}
                            className="flex-1 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white px-3 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all inline-flex items-center justify-center gap-1.5 shadow-sm"
                        >
                            <Image size={14} />
                            <span>Galeri</span>
                        </button>
                    </div>
                </div>
            ) : (
                <div className="flex items-center justify-center gap-2 py-5 text-xs font-bold text-slate-400 uppercase tracking-widest bg-slate-900 rounded-xl border border-slate-700/50">
                    <RefreshCw className="animate-spin text-orange-500" size={14} />
                    <span>{pmlCheckingIn ? "Mengunci Satelit..." : "Membuat Watermark Spasial..."}</span>
                </div>
            )}

            {!pmlCheckingIn && pmlCoords && !manualMode && (
                <div className="text-[10px] text-slate-300 font-bold px-1 space-y-0.5 text-left">
                    <p>SLS Terkunci: <span className="text-orange-400 font-black uppercase">{pmlCoords.nmsls}</span></p>
                </div>
            )}

            {manualMode && (
                <div className="bg-slate-900 border border-slate-700 rounded-xl p-3 text-left space-y-2.5 animate-fadeIn">
                    <div>
                        <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Pilih Tanggal Pengawasan</label>
                        <input 
                            type="date"
                            max={getTodayDateString()}
                            className="w-full p-2 bg-slate-800 border border-slate-600 rounded-xl text-xs font-semibold text-slate-200 outline-none"
                            value={selectedManualDate}
                            onChange={(e) => setSelectedManualDate(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Pilih Target SLS Pendampingan</label>
                        <select
                            className="w-full p-2 bg-slate-800 border border-slate-600 rounded-xl text-xs font-semibold text-slate-200 outline-none"
                            value={selectedManualSls}
                            onChange={(e) => setSelectedManualSls(e.target.value)}
                        >
                            <option value="">-- Pilih SLS Pengawasan Anda --</option>
                            {allSlsFlat.map(s => (
                                <option key={s.idsubsls} value={s.idsubsls}>
                                    ({s.kdsls}) {s.nmsls} - {s.nmdesa}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            )}

            <div className="flex gap-2">
                <button 
                    disabled={submitSiklusLoading}
                    onClick={resetPmlForm} 
                    className="flex-1 bg-slate-700 text-slate-300 font-bold py-2 rounded-xl text-xs uppercase disabled:opacity-40"
                >
                    Batal
                </button>
                <button
                    disabled={(manualMode ? !selectedManualSls : !pmlCoords) || !pmlPhotoPreview || pmlCheckingIn || submitSiklusLoading}
                    onClick={submitPmlCheckIn}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-2 rounded-xl text-xs uppercase disabled:bg-slate-700 disabled:text-slate-500 flex items-center justify-center gap-1"
                >
                    {submitSiklusLoading ? <RefreshCw className="animate-spin" size={12} /> : null}
                    <span>Kirim Absen</span>
                </button>
            </div>
        </div>
    )}
</div>
                </div>

                {/* SAKELAR INTERAKTIF TOGGLE MODE MANUAL */}
                {allowManualMode && (
                    <div 
                        onClick={() => {
                            const nextState = !manualMode;
                            setPmlCoords(null);
                            if (pmlPhotoPreview) URL.revokeObjectURL(pmlPhotoPreview);
                            setPmlPhotoPreview(null);
                            setRawPmlPhotoFile(null);
                            setIsPmlOutsideBorder(false);
                            setSelectedManualSls("");
                            if (pmlCameraInputRef.current) pmlCameraInputRef.current.value = "";
                            if (pmlGalleryInputRef.current) pmlGalleryInputRef.current.value = "";
                            setSelectedManualDate(getTodayDateString());
                            setManualMode(nextState);
                            if (nextState) {
                                setShowPmlCameraCard(true);
                            } else {
                                setShowPmlCameraCard(false);
                            }
                        }}
                        className="mb-4 bg-indigo-50/80 border border-indigo-200 rounded-2xl p-3.5 text-left shadow-2xs flex items-center justify-between gap-3 cursor-pointer hover:bg-indigo-100/50 active:scale-99 transition-all animate-fadeIn"
                    >
                        <div className="flex gap-2.5 items-center min-w-0">
                            <ShieldAlert size={18} className="text-indigo-600 shrink-0" />
                            <div className="min-w-0">
                                <p className="text-xs font-black text-indigo-900 uppercase tracking-tight">Mode Pendampingan Manual</p>
                                <p className="text-[10px] text-indigo-700/80 truncate font-medium">Klik untuk menggunakan Galeri Foto & Pilihan Tanggal/SLS manual</p>
                            </div>
                        </div>
                        <div className={`w-9 h-5 shrink-0 rounded-full p-0.5 transition-colors duration-200 ease-in-out flex items-center ${
                            manualMode ? 'bg-indigo-600' : 'bg-slate-300'
                        }`}>
                            <div className={`bg-white w-4 h-4 rounded-full shadow-sm transform transition-transform duration-200 ease-in-out ${
                                manualMode ? 'translate-x-4' : 'translate-x-0'
                            }`} />
                        </div>
                    </div>
                )}

                {/* NOTIFIKASI OFFLINE QUEUE */}
{/* NOTIFIKASI OFFLINE QUEUE */}
{offlineInputCount > 0 && (
    <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-2xl flex items-center justify-between text-xs font-bold animate-fadeIn">
        <div className="flex items-center gap-2">
            <WifiOff size={16} className="text-amber-600 shrink-0 animate-pulse" />
            {/* PERBAIKAN TEKS BANNER */}
            <span>Ada {offlineInputCount} Data Lapangan (Absen/SLS) Belum Diunggah</span>
        </div>
        <button
            disabled={isSyncingInput || !navigator.onLine}
            onClick={handleSyncPmlOfflineInputs}
            className="bg-amber-600 hover:bg-amber-700 text-white px-3 py-1 rounded-xl flex items-center gap-1 text-[11px] font-black transition-all disabled:bg-slate-300 disabled:text-slate-500"
        >
            {isSyncingInput ? <RefreshCw className="animate-spin" size={12} /> : <CloudLightning size={12} />}
            {navigator.onLine ? "SINKRON" : "LURING"}
        </button>
    </div>
)}

                {/* TAB 0: DAFTAR PANTAU PETUGAS LAPANAGAN PCL */}
                {activeTab === 0 && (
                    <div className="animate-fadeIn space-y-3">
                        <div className="relative">
                            <Search className="absolute left-4 top-3 text-slate-400" size={16} />
                            <input
                                type="text"
                                placeholder="Cari nama PCL..."
                                className="w-full bg-white border border-slate-200 rounded-2xl py-2.5 l-11 pr-4 text-xs font-semibold outline-none focus:border-indigo-500 transition-all pl-11"
                                value={searchInputValue}
                                onChange={(e) => setSearchInputValue(e.target.value)}
                            />
                        </div>

                        <div className="space-y-2">
                            <div className="flex justify-between items-center px-1 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                                <h3>Petugas ({filteredPcls.length})</h3>
                                <div className="flex gap-3">
                                    <span className="text-emerald-500">● {rekapStatusTim.aktif} Aktif</span>
                                    <span className="text-rose-500">● {rekapStatusTim.absen} Absen</span>
                                </div>
                            </div>

                            {filteredPcls.map((pcl) => {
                                const isAktif = pcl.statusHariIni === 'AKTIF';
                                const isPclLuarWilayah = isAktif && pcl.isLuarWilayahLast;

                                return (
                                    <div 
                                        key={pcl.email} 
                                        className={`bg-white border rounded-2xl p-3 shadow-xs flex flex-col gap-2.5 transition-all ${
                                            isPclLuarWilayah ? 'border-orange-200 bg-orange-50/10' : 'border-slate-200'
                                        }`}
                                    >
                                        <div className="flex justify-between items-start gap-2">
                                            <div className="min-w-0 flex-1">
                                                <h4 className="font-black text-slate-800 text-xs uppercase truncate">
                                                    {pcl.nama_pengguna}
                                                </h4>
                                                
                                                {isAktif ? (
                                                    <div className="space-y-0.5 mt-1">
                                                        <p className="text-[10px] text-slate-600 font-bold truncate flex items-center gap-1.5">
                                                            <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${isPclLuarWilayah ? 'bg-orange-500' : 'bg-emerald-500'}`}></span>
                                                            SLS: <span className="text-slate-800">{pcl.namaSlsLast || '-'}</span>
                                                            {pcl.totalAbsenHariIni > 1 && (
                                                                <span className="text-[8px] bg-slate-100 text-slate-500 px-1 py-0.2 rounded-sm font-mono">
                                                                    +{pcl.totalAbsenHariIni - 1} lokasi lain
                                                                </span>
                                                            )}
                                                        </p>
                                                        <p className="text-[9px] text-slate-400 font-extrabold pl-3 uppercase tracking-tight">
                                                            Desa / Kel: <span className="text-slate-500">{pcl.namaDesaLast || 'Kec. Ampel'}</span>
                                                        </p>
                                                    </div>
                                                ) : (
                                                    <p className="text-[9px] text-slate-400 font-mono truncate mt-0.5 pl-3">
                                                        {pcl.email}
                                                    </p>
                                                )}
                                            </div>

                                            <div className="shrink-0 flex flex-col items-end gap-1">
                                                {isAktif ? (
                                                    isPclLuarWilayah ? (
                                                        <span className="text-[8px] font-black text-orange-600 bg-orange-100 border border-orange-200/60 px-2 py-0.5 rounded-md uppercase tracking-tight animate-pulse">
                                                            ⚠️ Luar Wilayah
                                                        </span>
                                                    ) : (
                                                        <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100 uppercase tracking-tight">
                                                            ✓ Jalan Lapangan
                                                        </span>
                                                    )
                                                ) : (
                                                    <span className="text-[9px] font-black text-rose-500 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-100 uppercase tracking-tight">
                                                        🗙 Belum Lapangan
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* KOTAK HISTORI MINI KALENDER */}
                                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                                            <span className="text-[9px] font-black uppercase text-slate-400 tracking-tight">History Absensi Lapangan:</span>
                                            <div className="flex gap-1">
                                                {last7Dates.map((tgl, idx) => {
                                                    const masukPadaTanggalIni = pcl.history7Hari.includes(tgl);
                                                    const isHariIni = idx === 6;
                                                    const angkaTanggal = tgl.split('-')[2];
                                                    
                                                    return (
                                                        <div
                                                            key={tgl}
                                                            title={`Tanggal: ${tgl}`}
                                                            className={`w-[19px] h-[19px] rounded-md text-[9px] font-black flex items-center justify-center border transition-all ${
                                                                masukPadaTanggalIni
                                                                    ? 'bg-emerald-500 border-emerald-600 text-white shadow-xs' 
                                                                    : isHariIni && !isAktif
                                                                        ? 'bg-rose-500 border-rose-600 text-white animate-pulse' 
                                                                        : 'bg-slate-100 border-slate-200 text-slate-400' 
                                                            }`}
                                                        >
                                                            {angkaTanggal}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        
                        <div className="p-3 bg-slate-100/70 border border-slate-200 rounded-2xl flex flex-wrap gap-x-4 gap-y-1.5 text-[9px] font-black text-slate-500 uppercase tracking-wide justify-center">
                            <div className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-emerald-500"></span> Sudah Absen Lapangan</div>
                            <div className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-rose-500"></span> Belum Absen Lapangan</div>
                            <div className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-slate-200"></span> Tidak Kerja</div>
                        </div>
                    </div>
                )}

                {/* TAB 1: INPUT CAPAIAN PER SLS */}
                {activeTab === 1 && (
                    <div className="space-y-3 animate-fadeIn">
                        
                        {/* BANNER PANDUAN UTAMA */}
{/* BANNER PANDUAN UTAMA - VERSI MONITORING & LIVE SYNC */}
                        <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-2xl flex gap-2.5 items-start shadow-3xs">
                            <div className="bg-amber-100 p-1 rounded-xl text-amber-700 shrink-0 mt-0.5">
                                <HelpCircle size={14} className="font-bold" />
                            </div>
                            <div className="text-[10px] leading-relaxed w-full">
                                <span className="font-black uppercase block mb-0.5">📋 Komando & Tactical Monitoring PML:</span>
                                <p className="font-medium text-amber-700/90">
                                    1. Seluruh volume capaian dokumen (*Draft, Submit, Approve, Reject*) ditarik otomatis dari aplikasi Fasih secara berkala. Anda tidak perlu lagi melakukan entri data manual per SLS. Klik nama petugas untuk melihat progress per SLS.<br />

                                    2. Tombol <strong className="font-black text-indigo-600 bg-indigo-50 px-1 py-0.5 rounded">Kirim Rekap Untuk Evaluasi</strong> digunakan saat jadwal evaluasi berkala (pola 2-1-2-1) dan jadwal evaluasi lainnya untuk mengirim rekaman kendala dan solusi tim ke Kabupaten.
                                </p>
                                
                                {/* INDIKATOR TERAKHIR SINKRONISASI SERVER */}
                                <div className="mt-2 pt-1.5 border-t border-amber-200/60 flex items-center justify-between text-[9px] text-amber-800/80 font-mono font-bold">
                                    <span className="flex items-center gap-1">🔄 Pembaruan Data Terakhir:</span>
                                    <span className="bg-amber-200/70 text-amber-900 px-2 py-0.5 rounded-md font-black">
                                        {lastSyncProgressTime}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* FILTER DESA & TOMBOL BATCH SUBMIT */}
                        <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-stretch">
                            <div className="flex-1 bg-white border border-slate-200 p-2.5 rounded-2xl shadow-xs flex items-center gap-2 w-full">
                                <div className="bg-indigo-50 p-1.5 rounded-xl text-indigo-600 shrink-0">
                                    <Filter size={14} className="font-bold" />
                                </div>
                                <select
                                    className="flex-1 bg-transparent p-1 text-xs font-black text-slate-700 outline-none appearance-none cursor-pointer"
                                    value={selectedDesa}
                                    onChange={(e) => {
                                        setSelectedDesa(e.target.value);
                                        setExpandedPetugasSls(null); 
                                    }}
                                >
                                    <option value="SEMUA">Semua Desa / Kelurahan</option>
                                    {desaList.map(d => <option key={d} value={d}>Desa {d}</option>)}
                                </select>
                                <ChevronDown size={14} className="text-slate-400 mr-1 shrink-0 pointer-events-none" />
                            </div>

                            <div className="flex flex-col gap-1 w-full sm:w-auto shrink-0">
                                <button
                                    disabled={submitSiklusLoading || filteredSlsInputs.length === 0}
                                    onClick={handleTriggerEvaluasiFlow}
                                    className="bg-indigo-600 hover:bg-indigo-700 active:scale-95 disabled:bg-slate-200 disabled:text-slate-400 text-white px-4 py-2.5 rounded-2xl text-xs font-black tracking-wider transition-all shadow-xs flex items-center justify-center gap-2 uppercase w-full"
                                >
                                    <Send size={14} />
                                    <span>Kirim Rekap Untuk Evaluasi</span>
                                </button>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="px-1 flex justify-between items-center text-[10px] font-black uppercase text-slate-400 tracking-wider">
                                <span>Beban Kerja SLS</span>
                                <span className="bg-slate-200 text-slate-600 px-2 py-0.5 rounded-md font-mono">{filteredSlsInputs.length} SLS</span>
                            </div>


                            {Object.keys(groupedSlsByPetugas).map((namaPetugas) => {
                                const isExpanded = expandedPetugasSls === namaPetugas;
                                const listSlsPetugas = groupedSlsByPetugas[namaPetugas];
                                
                                const totalMuatanPcl = listSlsPetugas.reduce((acc, curr) => acc + (curr.jml_muatan || 0), 0);
                                const totalRealisasiPcl = listSlsPetugas.reduce((acc, curr) => acc + (curr.realisasi_pencacahan || 0), 0);
                                const persenPcl = totalMuatanPcl > 0 ? Math.min(Math.round((totalRealisasiPcl / totalMuatanPcl) * 100), 100) : 0;

                                // Hitung akumulasi status dokumen dari JSONB per petugas untuk ringkasan
                                let draftPcl = 0, submitPcl = 0, appPcl = 0, rejPcl = 0;
                                listSlsPetugas.forEach(sls => {
                                    const match = realtimeProgressData?.find(p => String(p.idsubsls).trim() === String(sls.idsubsls).trim());
                                    const obj = match?.status_progres || {};
                                    draftPcl += (obj["DRAFT"] || 0);
                                    submitPcl += (obj["SUBMITTED BY Pencacah"] || 0);
                                    appPcl += (obj["APPROVED BY Pengawas"] || 0) + (obj["APPROVED BY PEMERIKSA"] || 0);
                                    rejPcl += (obj["REJECTED BY Pengawas"] || 0) + (obj["REVOKED BY Pengawas"] || 0);
                                });

                                return (
                                    <div key={namaPetugas} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs transition-all">
                                        
                                        {/* HEADER AKORDION SIMPEL */}
                                        <div 
                                            onClick={() => setExpandedPetugasSls(isExpanded ? null : namaPetugas)}
                                            className={`p-3 flex flex-col gap-2 cursor-pointer transition-colors active:bg-slate-100 ${isExpanded ? 'bg-slate-50 border-b border-slate-100' : ''}`}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                                    <div className="w-7 h-7 rounded-full bg-indigo-600 text-white font-black text-xs flex items-center justify-center shrink-0 uppercase shadow-xs">
                                                        {namaPetugas.charAt(0)}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <h4 className="text-xs font-black text-slate-800 uppercase truncate tracking-tight">{namaPetugas}</h4>
                                                        <p className="text-[9px] font-bold text-slate-400 font-mono mt-0.5">
                                                            {listSlsPetugas.length} SLS • {totalRealisasiPcl}/{totalMuatanPcl} TARGET
                                                        </p>
                                                    </div>
                                                </div>
                                                
                                                <div className="shrink-0 flex items-center gap-2">
                                                    <span className="text-xs font-mono font-black text-indigo-600">
                                                        {persenPcl}%
                                                    </span>
                                                    <div className="text-slate-400">
                                                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* SUNTIKAN 1: PROGRESS BAR HORIZONTAL */}
                                            <div className="w-full bg-slate-100 rounded-full h-1 overflow-hidden">
                                                <div 
                                                    className="h-full bg-indigo-600 rounded-full transition-all duration-300"
                                                    style={{ width: `${persenPcl}%` }}
                                                ></div>
                                            </div>

                                            {/* SUNTIKAN 2: RINGKASAN STATUS DOKUMEN MINI */}
                                            <div className="flex justify-end gap-2 text-[9px] font-mono font-bold text-slate-400 border-t border-slate-50 pt-1">
                                                <span>Draft: <strong className="text-amber-600">{draftPcl}</strong></span>
                                                <span>Submit: <strong className="text-blue-600">{submitPcl}</strong></span>
                                                <span>Approve: <strong className="text-emerald-600">{appPcl}</strong></span>
                                                {rejPcl > 0 && <span>Reject: <strong className="text-rose-600">{rejPcl}</strong></span>}
                                            </div>
                                        </div>

                                        {/* ISI ACCORDION (KEMBALI KE STRUKTUR LAMA ANDA) */}
                                        {isExpanded && (
                                            <div className="p-2.5 bg-slate-50/50 space-y-2 animate-fadeIn border-t border-slate-100">
                                                {listSlsPetugas.map((sls) => (
                                                    <SlsCardRow 
                                                        key={sls.idsubsls}
                                                        sls={sls}
                                                        progressData={realtimeProgressData}
                                                    />
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}


                            {filteredSlsInputs.length === 0 && (
                                <div className="text-center text-[10px] text-slate-400 font-bold py-8 bg-white rounded-2xl border border-dashed border-slate-200">
                                    Belum ada alokasi muatan SLS untuk wilayah ini.
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* DIALOG POPUP WARNING WILAYAH */}
            {showPmlValidationDialog && (
                <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-5 z-50 animate-fadeIn">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-sm border border-slate-100 shadow-2xl text-center space-y-4">
                        <div className="mx-auto w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center text-rose-500">
                            <AlertTriangle size={24} className="animate-bounce text-rose-600" />
                        </div>
                        
                        <div>
                            <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Peringatan Wilayah Tugas</h3>
                            <p className="text-[11px] text-slate-500 leading-relaxed mt-1.5">
                                Aplikasi mendeteksi Anda saat ini berada di <span className="font-black text-rose-600">Luar Wilayah Tugas</span>.
                            </p>
                            <p className="text-[10px] text-slate-400 font-medium mt-1">
                                Apakah Anda Tetap Ingin Mengirimkan Absensi dengan Lokasi Saat Ini?
                            </p>
                        </div>

                        <div className="flex gap-2 pt-2">
                            <button
                                type="button"
                                disabled={submitSiklusLoading}
                                onClick={resetPmlForm}
                                className="flex-1 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider transition-all disabled:opacity-40 cursor-pointer border border-slate-200"
                            >
                                Batalkan
                            </button>
                            <button
                                type="button"
                                disabled={submitSiklusLoading}
                                onClick={() => setShowPmlValidationDialog(false)}
                                className="flex-1 bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-black py-2.5 rounded-xl text-xs uppercase tracking-wider transition-all shadow-md shadow-rose-500/10 disabled:bg-slate-400 cursor-pointer"
                            >
                                Tetap Lanjutkan
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* HIDDEN INPUT UNTUK FOTO EVALUASI KENDALA */}
            <input 
                type="file" 
                ref={evaluasiCameraRef} 
                accept="image/*" 
                className="hidden" 
                onChange={handleCaptureFotoEvaluasi} 
            />

            {/* DIALOG FORM MODAL EVALUASI, KENDALA & SOLUSI */}
            {showEvaluasiModal && (
                <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
                    <div className="bg-white rounded-3xl p-5 w-full max-w-md max-h-[85dvh] overflow-y-auto border border-slate-100 shadow-2xl flex flex-col gap-4">
                        
                        <div className="text-center border-b border-slate-100 pb-2">
                            <h3 className="text-xs font-black text-slate-800 uppercase tracking-wide">Form Evaluasi Lapangan</h3>
                            <p className="text-[10px] text-slate-400 font-medium mt-0.5">Pelaporan Kegiatan Lapangan Sensus Ekonomi 2026</p>
                        </div>

                        {/* INPUT TEKS KENDALA */}
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-tight block">
                                1. Masalah / Kendala Lapangan <span className="text-rose-500">*</span>
                            </label>
                            <textarea
                                rows={3}
                                placeholder="Contoh: Ada muatan SLS di desa Ampel susah ditemui karena bekerja di luar kota, cuaca hujan ekstrem..."
                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 outline-none focus:bg-white focus:border-indigo-500 transition-all resize-none"
                                value={kendalaLapangan}
                                onChange={(e) => setKendalaLapangan(e.target.value)}
                            />
                        </div>

                        {/* INPUT TEKS SOLUSI */}
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-tight block">
                                2. Solusi Pemecahan Masalah <span className="text-rose-500">*</span>
                            </label>
                            <textarea
                                rows={3}
                                placeholder="Contoh: Dilakukan kunjungan ulang pada malam hari / koordinasi dengan ketua RT setempat untuk konfirmasi keberadaan..."
                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 outline-none focus:bg-white focus:border-indigo-500 transition-all resize-none"
                                value={solusiLapangan}
                                onChange={(e) => setSolusiLapangan(e.target.value)}
                            />
                        </div>

                        {/* ATTACHMENT BUKTI FOTO */}
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-tight block">
                                3. Foto Kegiatan Evaluasi (Pendampingan Lapangan/Diskusi dengan Petugas) <span className="text-rose-500">*</span>
                            </label>
                            
{fotoEvaluasiBase64 ? (
    <div className="relative rounded-xl overflow-hidden border border-slate-200 h-28 bg-slate-100">
        <img src={fotoEvaluasiBase64} alt="Preview Evaluasi" className="w-full h-full object-cover" />
        <button
            type="button"
            onClick={() => {
                setFotoEvaluasiBase64(null);
                // FIX: Bersihkan juga value input HTML-nya agar bisa langsung jepret ulang tanpa tutup modal
                if (evaluasiCameraRef.current) evaluasiCameraRef.current.value = "";
            }}
            className="absolute top-2 right-2 bg-rose-500 text-white font-black text-[9px] px-2 py-1 rounded-lg uppercase tracking-wider shadow-xs"
        >
            Hapus
        </button>
    </div>
) : (
                                <button
                                    type="button"
                                    disabled={uploadFotoEvaluasiLoading}
                                    onClick={() => evaluasiCameraRef.current?.click()}
                                    className="w-full py-4 border-2 border-dashed border-slate-200 hover:border-indigo-400 bg-slate-50 text-slate-500 rounded-xl flex flex-col items-center justify-center gap-1 transition-all"
                                >
                                    {uploadFotoEvaluasiLoading ? (
                                        <RefreshCw className="animate-spin text-indigo-500" size={16} />
                                    ) : (
                                        <Camera size={16} className="text-slate-400" />
                                    )}
                                    <span className="text-[10px] font-black uppercase tracking-wider">
                                        {uploadFotoEvaluasiLoading ? "Memproses Gambar..." : "Ambil / Unggah Foto"}
                                    </span>
                                </button>
                            )}
                        </div>

                        {/* AKSI MODAL */}
<div className="flex gap-2 pt-2 border-t border-slate-100 mt-1">
    <button
        type="button"
        disabled={submitSiklusLoading}
        onClick={() => {
            // FIX UTAMA: Reset elemen input HTML kamera evaluasi agar cache filenya kosong kembali
            if (evaluasiCameraRef.current) evaluasiCameraRef.current.value = "";
            
            // Reset state modal seperti biasa
            setShowEvaluasiModal(false);
            setKendalaLapangan("");
            setSolusiLapangan("");
            setFotoEvaluasiBase64(null);
        }}
        className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider transition-all"
    >
        Kembali
    </button>
                            <button
                                type="button"
                                disabled={submitSiklusLoading || uploadFotoEvaluasiLoading}
                                onClick={handleFinalSubmitEvaluasi}
                                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-black py-2.5 rounded-xl text-xs uppercase tracking-wider transition-all shadow-md flex items-center justify-center gap-1.5"
                            >
                                {submitSiklusLoading ? <RefreshCw className="animate-spin" size={12} /> : null}
                                <span>Kirim Laporan</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* BOTTOM NAV BAR */}
            <div className="absolute bottom-0 left-0 right-0 w-full bg-slate-900 border-t border-slate-800 px-6 py-3 flex justify-around items-center rounded-t-[1.8rem] shadow-2xl z-50">
                <button
                    onClick={() => setActiveTab(0)}
                    className={`flex flex-col items-center gap-1.5 transition-all outline-none ${activeTab === 0 ? 'text-indigo-400 scale-105' : 'text-slate-500'}`}
                >
                    <Users size={18} className={activeTab === 0 ? "text-indigo-400" : "text-slate-500"} />
                    <span className="text-[9px] font-black uppercase tracking-wider">Absen Petugas</span>
                </button>

                <div className="w-px h-5 bg-slate-800"></div>

                <button
                    onClick={() => setActiveTab(1)}
                    className={`flex flex-col items-center gap-1.5 transition-all outline-none ${activeTab === 1 ? 'text-indigo-400 scale-105' : 'text-slate-500'}`}
                >
                    <Filter size={18} className={activeTab === 1 ? "text-indigo-400" : "text-slate-500"} />
                    <span className="text-[9px] font-black uppercase tracking-wider">Input Capaian SLS</span>
                </button>
            </div>
        </div>
    );
}