import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import {
    Users, MapPin, AlertTriangle, CheckCircle2,
    Save, RefreshCw, Search, ChevronDown, ChevronUp, 
    Navigation, Camera, WifiOff, CloudLightning, Filter, LogOut, Send, HelpCircle, ShieldAlert
} from 'lucide-react';

// =========================================================================
// ENGINE INITIALIZATION: INDEXEDDB UNTUK ANTREAN INPUT REALISASI OFFLINE PML
// =========================================================================
const initPmlOfflineDB = () => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("BpsPmlOfflineDB", 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains("pending_realisasi")) {
                db.createObjectStore("pending_realisasi", { keyPath: "id", autoIncrement: true });
            }
        };
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
};

// 🏃‍♂️ SUB-KOMPONEN BARIS SLS: Isolasi State Input untuk Performa Tinggi Lapangan (Zero-Lag)
const SlsCardRow = React.memo(({ sls, initialValue, onSave, onToggleSelesai, actionLoading }) => {
    const [inputValue, setInputValue] = useState(initialValue);

    useEffect(() => {
        setInputValue(initialValue);
    }, [initialValue]);

    const realisasi = sls.realisasi_pencacahan || 0;
    const muatan = sls.jml_muatan || 0;
    const persen = muatan > 0 ? Math.min(Math.round((realisasi / muatan) * 100), 100) : 0;
    
    const isSelesaiMutlak = sls.is_selesai === true;
    const isClean = realisasi >= muatan && muatan > 0;
    const isTouched = realisasi > 0;
    
    const borderWarna = isSelesaiMutlak ? 'border-l-emerald-500' : isTouched ? 'border-l-amber-500' : 'border-l-rose-500';

    return (
        <div className={`bg-white border border-slate-200 border-l-4 ${borderWarna} rounded-xl p-3 shadow-2xs flex flex-col gap-2 relative ${isSelesaiMutlak ? 'bg-emerald-50/10' : ''}`}>
            <div className="flex justify-between items-start gap-2">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${isSelesaiMutlak ? 'bg-emerald-500 animate-pulse' : isClean ? 'bg-emerald-500' : isTouched ? 'bg-amber-400' : 'bg-rose-500'}`}></span>
                        <h5 className="font-black text-slate-800 text-xs uppercase truncate">
                            ({sls.kdsls}) {sls.nmsls}
                        </h5>
                    </div>
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tight mt-0.5">
                        Desa: <span className="text-slate-600 font-black">{sls.nmdesa}</span>
                    </p>
                </div>
                
                <button
                    disabled={actionLoading === `status-${sls.idsubsls}`}
                    onClick={() => onToggleSelesai(sls.idsubsls, isSelesaiMutlak)}
                    className={`px-2 py-1 rounded-lg font-black text-[9px] uppercase tracking-wider active:scale-95 transition-all flex items-center justify-center border shrink-0 ${
                        isSelesaiMutlak 
                            ? 'bg-rose-500 border-rose-600 text-white shadow-xs' 
                            : 'bg-emerald-600 border-emerald-700 text-white shadow-xs'
                    }`}
                >
                    {actionLoading === `status-${sls.idsubsls}` ? (
                        <RefreshCw className="animate-spin" size={10} />
                    ) : isSelesaiMutlak ? (
                        <span>Batal Selesai</span>
                    ) : (
                        <span>Tandai Selesai</span>
                    )}
                </button>
            </div>

            <div className="w-full bg-slate-100 rounded-full h-1 overflow-hidden">
                <div 
                    className={`h-full rounded-full transition-all duration-300 ${isSelesaiMutlak || isClean ? 'bg-emerald-500' : isTouched ? 'bg-amber-500' : 'bg-rose-500'}`}
                    style={{ width: `${isSelesaiMutlak ? 100 : persen}%` }}
                ></div>
            </div>

            <div className="flex items-center justify-between gap-2 mt-1 pt-1.5 border-t border-slate-100">
                <div className="flex flex-col">
                    <span className="text-[9px] font-bold text-slate-400 font-mono">
                        Realisasi: <span className="font-black text-slate-700">{realisasi}</span> / {muatan} Muatan
                    </span>
                    <span className="text-[9px] font-mono font-black text-indigo-600">
                        Progres: {isSelesaiMutlak ? '100' : persen}%
                    </span>
                </div>
                
                <div className="flex items-center gap-1.5 shrink-0">
                    <input
                        type="number"
                        disabled={isSelesaiMutlak}
                        placeholder="Hasil"
                        className="w-12 bg-slate-50 border border-slate-200 rounded-lg py-1 text-center font-black text-xs text-slate-800 outline-none focus:bg-white focus:border-indigo-500 transition-all disabled:opacity-40"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                    />

                    <button
                        disabled={isSelesaiMutlak || actionLoading === sls.idsubsls}
                        onClick={() => onSave(sls.idsubsls, inputValue)}
                        className="bg-slate-800 active:bg-slate-900 text-white px-2.5 py-1 rounded-lg text-[10px] font-black active:scale-95 transition-all disabled:bg-slate-100 disabled:text-slate-300 flex items-center gap-1 shadow-xs"
                    >
                        {actionLoading === sls.idsubsls ? <RefreshCw className="animate-spin" size={10} /> : <Save size={10} />}
                        <span>SIMPAN</span>
                    </button>
                </div>
            </div>
        </div>
    );
});
SlsCardRow.displayName = 'SlsCardRow';

export default function PmlMonitoringPage() {
    const { user, profile, loading: authLoading, logout } = useAuth();

    // Ref khusus pemicu instant camera trigger
    const pmlFileInputRef = useRef(null);

    // MANAGEMENT STATE NAVIGASI HALAMAN (0: TIM PCL, 1: CAPAIAN PER SLS)
    const [activeTab, setActiveTab] = useState(0);

    const [loading, setLoading] = useState(true);
    const [pcls, setPcls] = useState([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [actionLoading, setActionLoading] = useState(null);
    const [pmlCheckingIn, setPmlCheckingIn] = useState(false);
    const [pmlCheckedInToday, setPmlCheckedInToday] = useState(false);

    // KELOMPOK RINGKASAN METRIK AKTIF TIM
    const [rekapStatusTim, setRekapStatusTim] = useState({ aktif: 0, absen: 0 });

    // CONTROL FOTO MANDIRI PML & KOORDINAT GPS PML
    const [pmlPhotoBase64, setPmlPhotoBase64] = useState(null);
    const [rawPmlPhotoFile, setRawPmlPhotoFile] = useState(null); 
    const [pmlCoords, setPmlCoords] = useState(null);
    const [showPmlCameraCard, setShowPmlCameraCard] = useState(false);

    // CONTROL MODE DARURAT UPLOAD MANUAL UNTUK PML
    const [allowManualMode, setAllowManualMode] = useState(false);
    const [manualMode, setManualMode] = useState(false);
    const [selectedManualSls, setSelectedManualSls] = useState("");
    const [selectedManualDate, setSelectedManualDate] = useState("");

    // STATE KONTROL INPUT DAN ANTRIAN OFFLINE
    const [offlineInputCount, setOfflineInputCount] = useState(0);
    const [isSyncingInput, setIsSyncingInput] = useState(false);

    // PENDUKUNG HALAMAN KE-2 (CAPAIAN PER SLS)
    const [allSlsFlat, setAllSlsFlat] = useState([]);
    const [desaList, setDesaList] = useState([]);
    const [selectedDesa, setSelectedDesa] = useState("SEMUA");
    const [slsInputs, setSlsInputs] = useState({});

    // STATE GERAKAN SWIPE & TIMELINE
    const [last7Dates, setLast7Dates] = useState([]);
    const [touchStart, setTouchStart] = useState(null);
    const [touchEnd, setTouchEnd] = useState(null);
    const [expandedPetugasSls, setExpandedPetugasSls] = useState(null);
    
    // State kontrol dialog peringatan wilayah untuk PML
    const [showPmlValidationDialog, setShowPmlValidationDialog] = useState(false);
    const [isPmlOutsideBorder, setIsPmlOutsideBorder] = useState(false);
    
    const [submitSiklusLoading, setSubmitSiklusLoading] = useState(false);
    
    const getTodayDateString = () => {
        return new Date().toLocaleString("sv-SE", { timeZone: "Asia/Jakarta" }).split(" ")[0];
    };

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

    const getKecamatanCode = () => {
        if (!profile?.kecamatan_tugas) return null;
        const match = profile.kecamatan_tugas.match(/^\d+/);
        return match ? match[0] : null;
    };

    const checkOfflineInputQueueCount = async () => {
        try {
            const db = await initPmlOfflineDB();
            const tx = db.transaction("pending_realisasi", "readonly");
            const store = tx.objectStore("pending_realisasi");
            const countRequest = store.count();
            countRequest.onsuccess = () => setOfflineInputCount(countRequest.result);
        } catch (err) {
            console.error("Gagal membaca storage offline PML:", err);
        }
    };

    // FIX BUG: Bersihkan nilai fisik DOM input agar re-upload file di luar wilayah tidak macet
    const resetPmlForm = useCallback(() => {
        setPmlCoords(null);
        setSelectedManualSls("");
        setManualMode(false);
        setPmlPhotoBase64(null);
        setRawPmlPhotoFile(null);
        setIsPmlOutsideBorder(false);
        setShowPmlCameraCard(false);
        setShowPmlValidationDialog(false); 
        setPmlCheckingIn(false);
        if (pmlFileInputRef.current) {
            pmlFileInputRef.current.value = "";
        }
        setSelectedManualDate(getTodayDateString());
    }, []);

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
            }
            setLoading(false);
            return;
        }

        try {
            // 1. Cek log absen PML hari ini
            const { data: pmlCheckInLog } = await supabase
                .from('log_checkin_pml')
                .select('id')
                .eq('pml_email', cleanPmlEmail)
                .eq('tanggal', tglHariIni);

            const isCheckedIn = pmlCheckInLog && pmlCheckInLog.length > 0;
            setPmlCheckedInToday(isCheckedIn);
            localStorage.setItem(`cache_pml_checkedin_${cleanPmlEmail}_${tglHariIni}`, isCheckedIn);

            // 2. Ambil data master petugas PCL binaan
            const { data: petugasData, error: petugasError } = await supabase
                .from('petugas')
                .select('email, nama_petugas, kecamatan_tugas, posisi_tugas, id_pml_atasan')
                .eq('posisi_tugas', 'PCL')
                .eq('id_pml_atasan', cleanPmlEmail)
                .eq('status', 'Diterima');

            if (petugasError) throw petugasError;

            // 3. Ambil log check-in PCL dalam rentang 7 hari terakhir
            const { data: rentangLogs } = await supabase
                .from('log_checkin_pcl')
                .select('petugas_email, tanggal, idsubsls, foto_bukti')
                .gte('tanggal', tglHMinus6)
                .lte('tanggal', tglHariIni)
                .order('tanggal', { ascending: false });

            // 4. Ambil Master SLS untuk kebutuhan deteksi nama/desa global
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

            // 5. Kompilasi data gabungan untuk visualisasi monitoring tim PCL
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
        const handlePmlSignalToggle = () => checkOfflineInputQueueCount();
        window.addEventListener('online', handlePmlSignalToggle);
        window.addEventListener('offline', handlePmlSignalToggle);
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

    // =========================================================================
    // AUTOMATIC WATERMARK ENGINE UNTUK PML (GARANSI GPS KOORDINAT PATEN)
    // =========================================================================
    useEffect(() => {
        if (!rawPmlPhotoFile || pmlCheckingIn) return;

        const generateLivePmlWatermark = () => {
            const reader = new FileReader();

            reader.onerror = () => {
                console.error("FileReader Error: Gagal membaca berkas foto.");
                alert("Gagal memproses gambar. Silakan coba ambil foto ulang.");
            };

            reader.readAsDataURL(rawPmlPhotoFile);
            
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;

                img.onerror = () => {
                    console.error("Image Load Error: Gambar tidak valid.");
                };

                img.onload = () => {
                    const MAX_WIDTH = 800;
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
                    
                    if (!ctx) return; 
                    
                    ctx.drawImage(img, 0, 0, width, height);

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
                    } else if (pmlCoords?.idsubsls && pmlCoords.idsubsls !== 'WILAYAH-PML') {
                        const match = allSlsFlat.find(s => String(s.idsubsls).trim() === String(pmlCoords.idsubsls).trim());
                        if (match) {
                            if (!nmsls) nmsls = match.nmsls;
                            if (!nmdesa) nmdesa = match.nmdesa;
                        }
                    }

                    let wilayahTeks = "MEMINDAI WILAYAH...";
                    if (manualMode) {
                        wilayahTeks = nmsls;
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
                    ctx.fillText(`LOKASI   : ${String(wilayahTeks).toUpperCase()}`, 20, height - 60);

                    ctx.fillStyle = "#cbd5e1"; 
                    ctx.font = "11px monospace";
                    ctx.fillText(`WAKTU    : ${tglTeks} WIB`, 20, height - 38);
                    ctx.fillText(`KOORDINAT: LAT ${latTeks} | LON ${lonTeks}`, 20, height - 18);

                    const compressedBase64 = canvas.toDataURL("image/jpeg", 0.6);
                    setPmlPhotoBase64(compressedBase64);
                };
            };
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

    const prosesPencarianGeojson = async (latitude, longitude) => {
        const kodeKec = getKecamatanCode();
        if (!kodeKec) return null;

        try {
            const response = await fetch(`/geojson/${kodeKec}.geojson`);
            const geojsonData = await response.json();

            for (let feature of geojsonData.features) {
                const geometri = feature.geometry;

                if (geometri.type === "Polygon") {
                    const koordinatPoligon = geometri.coordinates[0];
                    if (isPointInPolygon([longitude, latitude], koordinatPoligon)) {
                        return {
                            idsubsls: feature.properties.idsubsls || feature.properties.IDSUBSLS,
                            nmsls: feature.properties.nmsls || feature.properties.NMSLS || "SLS Terdeteksi",
                            nmdesa: feature.properties.nmdesa || feature.properties.NMDESA || "Desa Terdeteksi"
                        };
                    }
                } 
                else if (geometri.type === "MultiPolygon") {
                    for (let polygon of geometri.coordinates) {
                        if (isPointInPolygon([longitude, latitude], polygon[0])) {
                            return {
                                idsubsls: feature.properties.idsubsls || feature.properties.IDSUBSLS,
                                nmsls: feature.properties.nmsls || feature.properties.NMSLS,
                                nmdesa: feature.properties.nmdesa || feature.properties.NMDESA
                            };
                        }
                    }
                }
            }
        } catch (err) {
            console.error("Gagal membaca berkas spasial luring PML:", err.message);
        }
        return null;
    };

    // ⚡ BYPASS SIKLUS INSTAN KAMERA + BACKGROUND GPS TRACKING
    const handleTriggerPmlLocation = () => {
        if (!navigator.geolocation) {
            alert("HP Anda memblokir fitur lokasi.");
            return;
        }

        // FIX BUG: Reset nilai fisik input file DOM agar penekanan absen ulang tidak macet luring
        if (pmlFileInputRef.current) {
            pmlFileInputRef.current.value = "";
        }

        setPmlCheckingIn(true);
        setIsPmlOutsideBorder(false);
        setShowPmlValidationDialog(false);
        setManualMode(false);
        setSelectedManualSls("");
        setPmlPhotoBase64(null);
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
                        nmdesa: hasilSlsMandiri.nmdesa 
                    });

                    const kecTerdeteksi = String(hasilSlsMandiri.idsubsls).substring(0, 6);

                    if (kecTerdeteksi !== kodeKecTugas) {
                        setIsPmlOutsideBorder(true);
                        setShowPmlValidationDialog(true); 
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

        pmlFileInputRef.current?.click();
    };

    const submitPmlCheckIn = async () => {
        if (submitSiklusLoading) return; 

        const pmlEmail = user?.email || profile?.email;
        const tglHariIni = manualMode ? selectedManualDate : getTodayDateString();

        if (!pmlPhotoBase64) {
            alert("Wajib mengambil foto bukti pengawasan lapangan atau tunggu hingga watermark selesai dibakar!");
            return;
        }

        setSubmitSiklusLoading(true);

        const idSlsClean = manualMode ? String(selectedManualSls).trim() : (pmlCoords?.idsubsls ? String(pmlCoords.idsubsls).trim() : 'WILAYAH-PML');
        const namaClean = profile?.nama_pengguna ? profile.nama_pengguna.replace(/\s+/g, '_').toUpperCase() : 'PENGAWAS';
        const tglClean = tglHariIni.replace(/-/g, ''); 
        
        const namaFileUnik = `SE26_PML_${idSlsClean}_${namaClean}_${tglClean}.jpg`;
        let finalFotoUrl = "OFFLINE_LINK";

        if (!navigator.onLine) {
            localStorage.setItem(`cache_pml_checkedin_${pmlEmail.toLowerCase().trim()}_${tglHariIni}`, 'true');
            localStorage.setItem(`cache_pml_last_idsls_${pmlEmail.toLowerCase().trim()}_${tglHariIni}`, idSlsClean);
            
            setPmlCheckedInToday(true);
            alert("💾 Absen Pendampingan PML disimpan offline di memori HP!");
            resetPmlForm();
            setSubmitSiklusLoading(false);
            return;
        }

        try {
            const gasUrl = "https://script.google.com/macros/s/AKfycbwtBgrsYjqda1azzjFTaZRPrjh5Unv1bleWjdnwua3lQrRfR_AIjTDmR-5NIGKrSEM/exec";
            const responseGas = await fetch(gasUrl, {
                method: "POST",
                body: JSON.stringify({
                    fotoBase64: pmlPhotoBase64,
                    namaFile: namaFileUnik
                })
            });
            const hasilGas = await responseGas.json();
            if (hasilGas.status === "success") finalFotoUrl = hasilGas.url;

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

            setPmlCheckedInToday(true);
            localStorage.setItem(`cache_pml_checkedin_${pmlEmail.toLowerCase().trim()}_${tglHariIni}`, 'true');
            alert("Absen Pengawasan Lapangan Berhasil Tersimpan!");
            resetPmlForm();
        } catch (err) {
            alert("Gagal mengirim data online, absen disimpan lokal di HP: " + err.message);
            localStorage.setItem(`cache_pml_checkedin_${pmlEmail.toLowerCase().trim()}_${tglHariIni}`, 'true');
            localStorage.setItem(`cache_pml_last_idsls_${pmlEmail.toLowerCase().trim()}_${tglHariIni}`, idSlsClean);
            setPmlCheckedInToday(true);
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

    const handleSubmitRealisasiSiklus = async () => {
        if (submitSiklusLoading) return; 

        const pmlEmail = user?.email || profile?.email;
        const now = new Date();
        const tglHariIni = now.toISOString().split('T')[0];

        if (!filteredSlsInputs || filteredSlsInputs.length === 0) {
            alert("Tidak ada data SLS untuk dilaporkan!");
            return;
        }

        const konfirmasi = window.confirm(
            `Kirim rangkuman realisasi ${filteredSlsInputs.length} SLS untuk evaluasi tanggal ${tglHariIni}? Data tanggal yang sama akan diperbarui.`
        );
        if (!konfirmasi) return;

        setSubmitSiklusLoading(true);

        try {
            const dataRealisasiFormatted = filteredSlsInputs.map(sls => ({
                idsubsls: sls.idsubsls,
                realisasi: slsInputs[sls.idsubsls] !== undefined ? parseInt(slsInputs[sls.idsubsls]) : (sls.realisasi_pencacahan || 0)
            }));

            const { error } = await supabase
                .from('log_realisasi_pml')
                .upsert({
                    tanggal: tglHariIni,
                    pml_email: pmlEmail.toLowerCase().trim(),
                    data_realisasi: dataRealisasiFormatted
                }, { onConflict: 'tanggal,pml_email' });

            if (error) throw error;
            alert("🚀 Progres Realisasi Lapangan Berhasil Dikirim ke Dashboard Kabupaten!");
        } catch (err) {
            console.error("Gagal mengirim realisasi siklus:", err.message);
            alert("Gagal mengirim laporan: " + err.message);
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

    const handleSyncPmlOfflineInputs = async () => {
        setIsSyncingInput(true);
        try {
            const db = await initPmlOfflineDB();
            const txRead = db.transaction("pending_realisasi", "readonly");
            const storeRead = txRead.objectStore("pending_realisasi");
            const getAllRequest = storeRead.getAll();

            getAllRequest.onsuccess = async () => {
                const records = getAllRequest.result;
                if (records.length === 0) {
                    setIsSyncingInput(false);
                    return;
                }

                let suksesPmlCount = 0;
                const idToDelete = [];

                for (let record of records) {
                    try {
                        let error = null;
                        if (record.isDirectSls) {
                            const res = await supabase.from('muatan_sls').update({ realisasi_pencacahan: record.realisasi_pencacahan }).eq('idsubsls', record.idsubsls);
                            error = res.error;
                        } else if (record.isStatusToggle) { 
                            const res = await supabase.from('muatan_sls').update({ 
                                is_selesai: record.is_selesai,
                                pml_validator: record.is_selesai ? record.pml_validator : null,
                                validated_at: record.is_selesai ? record.validated_at : null
                            }).eq('idsubsls', record.idsubsls);
                            error = res.error;
                        }

                        if (!error) {
                            suksesPmlCount++;
                            idToDelete.push(record.id);
                        }
                    } catch (loopErr) {
                        console.error(loopErr);
                    }
                }

                if (idToDelete.length > 0) {
                    const txDelete = db.transaction("pending_realisasi", "readwrite");
                    const storeDelete = txDelete.objectStore("pending_realisasi");
                    idToDelete.forEach(id => storeDelete.delete(id));
                    
                    txDelete.oncomplete = () => {
                        alert(`📡 Sinkronisasi Selesai! Berhasil mengunggah ${suksesPmlCount} antrean perubahan SLS ke server.`);
                        checkOfflineInputQueueCount();
                        fetchPmlData();
                    };
                } else {
                    setIsSyncingInput(false);
                }
            };
        } catch (err) {
            alert("Gagal sinkronisasi data: " + err.message);
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
            {/* HIDDEN INPUT KAMERA UNTUK PML (LEPAS CAPTURE USER JIKA ADMIN PERBOLEHKAN BYPASS MANUAL) */}
            <input 
                type="file" 
                ref={pmlFileInputRef} 
                accept="image/*" 
                capture="user"
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
                        {pmlCheckedInToday ? (
                            <div className="w-full bg-emerald-600/10 text-emerald-400 border border-emerald-500/20 rounded-2xl py-2.5 px-4 flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wide">
                                <CheckCircle2 size={14} className="text-emerald-400" />
                                Anda Sudah Melakukan Pengawasan Hari Ini
                            </div>
                        ) : (
                            <>
                                {!showPmlCameraCard ? (
                                    <button
                                        onClick={handleTriggerPmlLocation}
                                        className="w-full bg-orange-500 hover:bg-orange-600 text-white rounded-2xl py-3 px-4 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20 active:scale-[0.98] transition-all"
                                    >
                                        <Navigation size={14} className="fill-white" />
                                        <span>Absen Pendampingan Lapangan</span>
                                    </button>
                                ) : (
                                    <div className="bg-slate-800 border border-slate-700 p-3 rounded-2xl space-y-3 animate-fadeIn">
                                        <span className="text-[9px] font-black uppercase text-slate-400 bg-slate-700 px-1.5 py-0.5 rounded block text-center">
                                            {manualMode ? "Form Input Pendampingan Manual" : "Rangkuman Foto & Deteksi Lokasi"}
                                        </span>

                                        {pmlPhotoBase64 ? (
                                            <div className="relative rounded-xl overflow-hidden border border-slate-600">
                                                <img src={pmlPhotoBase64} alt="PML Bukti" className="w-full h-32 object-cover" />
                                                <button 
                                                    onClick={() => {
                                                        if(pmlFileInputRef.current) pmlFileInputRef.current.value = "";
                                                        pmlFileInputRef.current?.click();
                                                    }} 
                                                    className="absolute bottom-2 right-2 bg-slate-900/90 text-white px-2.5 py-1.5 rounded-xl text-[9px] font-black cursor-pointer uppercase"
                                                >
                                                    Ulangi Foto / File
                                                </button>
                                            </div>
                                        ) : rawPmlPhotoFile ? (
                                            <div className="flex items-center justify-center gap-2 py-5 text-xs font-bold text-slate-400 uppercase tracking-widest bg-slate-900 rounded-xl border border-slate-700/50">
                                                <RefreshCw className="animate-spin text-orange-500" size={14} />
                                                <span>Membuat Watermark Spasial...</span>
                                            </div>
                                        ) : manualMode ? (
                                            <div className="p-4 bg-slate-900 border border-slate-700 rounded-xl text-center space-y-2 animate-fadeIn">
                                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Dokumen Bukti Diperlukan</p>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if(pmlFileInputRef.current) pmlFileInputRef.current.value = "";
                                                        pmlFileInputRef.current?.click();
                                                    }}
                                                    className="bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all inline-flex items-center gap-1.5 shadow-sm"
                                                >
                                                    <Camera size={14} />
                                                    <span>Ambil Kamera / Galeri</span>
                                                </button>
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

                                        {/* FORM MANUAL KETIKA SATELIT DOWN ATAU ADMIN AKTIFKAN BYPASS */}
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
                                                        <option value="">-- Pilih SLS Binaan Anda --</option>
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
                                                disabled={(manualMode ? !selectedManualSls : !pmlCoords) || !pmlPhotoBase64 || pmlCheckingIn || submitSiklusLoading}
                                                onClick={submitPmlCheckIn}
                                                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-2 rounded-xl text-xs uppercase disabled:bg-slate-700 disabled:text-slate-500 flex items-center justify-center gap-1"
                                            >
                                                {submitSiklusLoading ? <RefreshCw className="animate-spin" size={12} /> : null}
                                                <span>Kirim Absen Pendampingan</span>
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {/* SAKELAR INTERAKTIF TOGGLE MODE MANUAL (HANYA AKTIF JIKA DI-ALLOW DI HALAMAN SETTING ADMIN) */}
                {allowManualMode && !pmlCheckedInToday && (
                    <div 
                        onClick={() => {
                            const nextState = !manualMode;
                            setPmlCoords(null);
                            setPmlPhotoBase64(null);
                            setRawPmlPhotoFile(null);
                            setIsPmlOutsideBorder(false);
                            setSelectedManualSls("");
                            if (pmlFileInputRef.current) pmlFileInputRef.current.value = "";
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
                                <p className="text-xs font-black text-indigo-900 uppercase tracking-tight">Pindah Mode Upload Manual</p>
                                <p className="text-[10px] text-indigo-700/80 truncate font-medium">Klik untuk mengaktifkan galeri & tanggal manual</p>
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
                {offlineInputCount > 0 && (
                    <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-2xl flex items-center justify-between text-xs font-bold animate-fadeIn">
                        <div className="flex items-center gap-2">
                            <WifiOff size={16} className="text-amber-600 shrink-0 animate-pulse" />
                            <span>Ada {offlineInputCount} Realisasi Belum Diunggah</span>
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

                {/* TAB 0: DAFTAR PANTAU PETUGAS PCL */}
                {activeTab === 0 && (
                    <div className="animate-fadeIn space-y-3">
                        <div className="relative">
                            <Search className="absolute left-4 top-3 text-slate-400" size={16} />
                            <input
                                type="text"
                                placeholder="Cari nama PCL..."
                                className="w-full bg-white border border-slate-200 rounded-2xl py-2.5 pl-11 pr-4 text-xs font-semibold outline-none focus:border-indigo-500 transition-all"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
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
                        <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-2xl flex gap-2.5 items-start shadow-3xs">
                            <div className="bg-amber-100 p-1 rounded-xl text-amber-700 shrink-0 mt-0.5">
                                <HelpCircle size={14} className="font-bold" />
                            </div>
                            <div className="text-[10px] leading-relaxed">
                                <span className="font-black uppercase block mb-0.5">📋 Panduan Menginput Realisasi:</span>
                                <p className="font-medium text-amber-700/90">
                                    1. Klik <strong className="font-black text-slate-800">Nama Petugas</strong> di bawah untuk menginput realisasi dan menekan tombol <strong className="font-black text-slate-800">SIMPAN</strong> untuk menyimpan realisasi lapangan tiap SLS (bisa dilakukan secara rutin).<br />
                                    2. Tombol <strong className="font-black text-indigo-600 bg-indigo-50 px-1 py-0.5 rounded">Kirim Rekap Untuk Evaluasi</strong> <span className="underline font-black">HANYA</span> digunakan ketika jadwal evaluasi. (2-1-2-1 dan pertemuan wajib)<br />
                                    3. Klik tombol <strong className="font-black text-emerald-700 bg-emerald-50 px-1 py-0.5 rounded">Tandai Selesai</strong> pada masing-masing SLS jika semua muatan di SLS tersebut sudah selesai didata semua.
                                </p>
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
                                    onClick={handleSubmitRealisasiSiklus}
                                    className="bg-indigo-600 hover:bg-indigo-700 active:scale-95 disabled:bg-slate-200 disabled:text-slate-400 text-white px-4 py-2.5 rounded-2xl text-xs font-black tracking-wider transition-all shadow-xs flex items-center justify-center gap-2 uppercase w-full"
                                >
                                    {submitSiklusLoading ? <RefreshCw className="animate-spin" size={14} /> : <Send size={14} />}
                                    <span>{submitSiklusLoading ? "Mengirim..." : "Kirim Rekap Untuk Evaluasi"}</span>
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

                                return (
                                    <div key={namaPetugas} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs transition-all">
                                        
                                        {/* HEADER AKORDION */}
                                        <div 
                                            onClick={() => setExpandedPetugasSls(isExpanded ? null : namaPetugas)}
                                            className={`p-3 flex items-center justify-between gap-2 cursor-pointer transition-colors active:bg-slate-100 ${isExpanded ? 'bg-slate-50 border-b border-slate-100' : ''}`}
                                        >
                                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                                <div className="w-7 h-7 rounded-full bg-indigo-600 text-white font-black text-xs flex items-center justify-center shrink-0 uppercase shadow-xs">
                                                    {namaPetugas.charAt(0)}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <h4 className="text-xs font-black text-slate-800 uppercase truncate tracking-tight">{namaPetugas}</h4>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <span className="text-[9px] font-bold text-slate-400 uppercase font-mono">
                                                            {listSlsPetugas.length} SLS
                                                        </span>
                                                        <span className="text-[9px] font-black text-slate-400">•</span>
                                                        <span className="text-[9px] font-mono font-black text-indigo-600">
                                                            {totalRealisasiPcl}/{totalMuatanPcl} Assignment ({persenPcl}%)
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            <div className="shrink-0 text-slate-400 p-1">
                                                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                            </div>
                                        </div>

                                        {/* ISI ACCORDION DENGAN ROW INPUT MEMOIZED */}
                                        {isExpanded && (
                                            <div className="p-2.5 bg-slate-50/50 space-y-2 animate-fadeIn border-t border-slate-100">
                                                {listSlsPetugas.map((sls) => (
                                                    <SlsCardRow 
                                                        key={sls.idsubsls}
                                                        sls={sls}
                                                        initialValue={slsInputs[sls.idsubsls] !== undefined ? slsInputs[sls.idsubsls] : ""}
                                                        onSave={handleSaveSlsProgressDirect}
                                                        onToggleSelesai={handleToggleSlsSelesai}
                                                        actionLoading={actionLoading}
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
                                className="flex-1 bg-rose-500 hover:bg-rose-600 active:scale-95 text-white font-black py-2.5 rounded-xl text-xs uppercase tracking-wider transition-all shadow-md shadow-rose-500/10 disabled:bg-slate-400 cursor-pointer"
                            >
                                Tetap Lanjutkan
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
                    <Navigation size={18} className={activeTab === 0 ? "text-indigo-400" : "text-slate-500"} />
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