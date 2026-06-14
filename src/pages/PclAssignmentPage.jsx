import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import {
    MapPin, Navigation, RefreshCw, CheckCircle2, ShieldAlert,
    Calendar, ChevronLeft, ChevronRight, Camera, WifiOff,
    CloudLightning, AlertOctagon, LogOut, HelpCircle
} from 'lucide-react';

// =========================================================================
// ENGINE INITIALIZATION: INDEXEDDB UNTUK ANTREAN OFFLINE
// =========================================================================
const initOfflineDB = () => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("BpsOfflineBackupDB", 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains("pending_checkins")) {
                db.createObjectStore("pending_checkins", { keyPath: "id", autoIncrement: true });
            }
        };
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
};

export default function PclAssignmentPage() {
    const { user, profile, loading: authLoading, logout } = useAuth();

    // Reference untuk memicu jepret kamera / galeri instan
    const fileInputRef = useRef(null);

    // State Navigasi Slider
    const [activeTab, setActiveTab] = useState(0);
    const [touchStart, setTouchStart] = useState(null);
    const [touchEnd, setTouchEnd] = useState(null);

    // State Data & Loading
    const [loading, setLoading] = useState(true);
    const [gpsLoading, setGpsLoading] = useState(false); // State khusus background GPS tracking
    const [actionLoading, setActionLoading] = useState(false); // State untuk upload/sync jaringan
    const [allMySls, setAllMySls] = useState([]);
    const [todayCheckIns, setTodayCheckIns] = useState([]);
    const [historyDates, setHistoryDates] = useState([]);

    // State Hasil Deteksi Posisi GPS & Konfigurasi Fitur Admin
    const [detectedSls, setDetectedSls] = useState(null);
    const [currentCoords, setCurrentCoords] = useState(null);
    const [manualMode, setManualMode] = useState(false);
    const [selectedManualSls, setSelectedManualSls] = useState("");
    
    // State Baru: Kontrol Hak Akses Upload Manual dari Halaman Setting Admin
    const [allowManualMode, setAllowManualMode] = useState(false);
    const [selectedManualDate, setSelectedManualDate] = useState("");

    // BLOCKER JIKA PETUGAS DI LUAR WILAYAH KECAMATAN TUGAS
    const [isOutsideBorderBlock, setIsOutsideBorderBlock] = useState(false);

    // STATE: FOTO, WATERMARK, DAN OFFLINE STATUS
    const [photoBase64, setPhotoBase64] = useState(null);
    const [offlineCount, setOfflineCount] = useState(0);
    const [isSyncing, setIsSyncing] = useState(false);
    
    // State Baru: Memisahkan penampung berkas mentah sebelum dibakar watermark canvas
    const [rawPhotoFile, setRawPhotoFile] = useState(null);
    
    // State untuk kontrol modal peringatan luar wilayah tugas
    const [showValidationDialog, setShowValidationDialog] = useState(false);
    const [pendingTargetId, setPendingTargetId] = useState(null);
    
    // State Kalender Bulanan
    const [currentMonth, setCurrentMonth] = useState(new Date());

    const minSwipeDistance = 60;

    const getTodayDateString = () => {
        return new Date().toLocaleString("sv-SE", { timeZone: "Asia/Jakarta" }).split(" ")[0];
    };

    // Set default tanggal manual ke hari ini saat inisialisasi awal komponen
    useEffect(() => {
        setSelectedManualDate(getTodayDateString());
    }, []);

    const getKecamatanCode = () => {
        if (!profile?.kecamatan_tugas) return null;
        const match = profile.kecamatan_tugas.match(/^\d+/);
        return match ? match[0] : null;
    };

    const checkOfflineQueueCount = async () => {
        try {
            const db = await initOfflineDB();
            const tx = db.transaction("pending_checkins", "readonly");
            const store = tx.objectStore("pending_checkins");
            const countRequest = store.count();
            countRequest.onsuccess = () => setOfflineCount(countRequest.result);
        } catch (err) {
            console.error("Gagal membaca storage offline HP:", err);
        }
    };

    const downloadAndCacheGeoJson = async (kodeKec) => {
        try {
            if (!navigator.onLine) return;
            const res = await fetch(`/geojson/${kodeKec}.geojson`);
            const data = await res.json();
            localStorage.setItem(`cache_geojson_kec_${kodeKec}`, JSON.stringify(data));
        } catch (e) {
            console.error("Gagal melakukan pra-load data spasial kecamatan:", e);
        }
    };

    // Algoritma Ray-Casting untuk mencocokkan titik GPS ke dalam poligon SLS resmi luring
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
            let geojsonData = null;
            const localMap = localStorage.getItem(`cache_geojson_kec_${kodeKec}`);

            if (localMap) {
                geojsonData = JSON.parse(localMap);
            } else {
                if (!navigator.onLine) return null;
                const response = await fetch(`/geojson/${kodeKec}.geojson`);
                geojsonData = await response.json();
            }

            for (let feature of geojsonData.features) {
                const geometri = feature.geometry;

                if (geometri.type === "Polygon") {
                    const koordinatPoligon = geometri.coordinates[0];
                    if (isPointInPolygon([longitude, latitude], koordinatPoligon)) {
                        return {
                            idsubsls: feature.properties.idsubsls || feature.properties.IDSUBSLS,
                            nmsls: feature.properties.nmsls || feature.properties.NMSLS || "SLS Terdeteksi",
                            nmdesa: feature.properties.nmdesa || feature.properties.NMDESA || "Desa Terdeteksi",
                            kdsls: feature.properties.kdsls || feature.properties.KDSLS || "0000"
                        };
                    }
                } 
                else if (geometri.type === "MultiPolygon") {
                    for (let polygon of geometri.coordinates) {
                        if (isPointInPolygon([longitude, latitude], polygon[0])) {
                            return {
                                idsubsls: feature.properties.idsubsls || feature.properties.IDSUBSLS,
                                nmsls: feature.properties.nmsls || feature.properties.NMSLS,
                                nmdesa: feature.properties.nmdesa || feature.properties.NMDESA,
                                kdsls: feature.properties.kdsls || feature.properties.KDSLS || "0000"
                            };
                        }
                    }
                }
            }
        } catch (err) {
            console.error("Gagal membaca berkas spasial luring:", err.message);
        }
        return null;
    };

    const resetForm = useCallback(() => {
        setDetectedSls(null);
        setSelectedManualSls("");
        setManualMode(false);
        setPhotoBase64(null);
        setRawPhotoFile(null); // Reset simpanan gambar mentah
        setIsOutsideBorderBlock(false);
        setSelectedManualDate(getTodayDateString());
    }, []);

    // 🚀 ENGINE INJEKSI KIRIM DATA (ONLINE & OFFLINE) DENGAN PROTEKSI DOUBLE-TAP
    const eksekusiKirimBypass = useCallback(async (safeIdSubSls) => {
        if (actionLoading) return;

        const pclEmail = user?.email || profile?.email;
        // Gunakan tanggal pilihan manual jika dalam mode manual, jika tidak gunakan waktu hari ini
        const tglHariIni = manualMode ? selectedManualDate : getTodayDateString();
        const cleanEmail = pclEmail.toLowerCase().trim();

        setActionLoading(true);

        const namaClean = profile?.nama_pengguna ? profile.nama_pengguna.replace(/\s+/g, '_').toUpperCase() : 'PETUGAS';
        const tglClean = tglHariIni.replace(/-/g, ''); 
        const namaFileUnik = `SE26_PPL_${safeIdSubSls}_${namaClean}_${tglClean}.jpg`;

        const payloadOfflinePack = {
            tanggal: tglHariIni,
            idsubsls: safeIdSubSls,
            petugas_email: cleanEmail,
            latitude: currentCoords?.latitude || null,
            longitude: currentCoords?.longitude || null,
            is_within_range: !manualMode,
            fotoBase64Cadangan: photoBase64
        };

        const matchSlsLokal = allMySls.find(s => String(s.idsubsls).trim() === safeIdSubSls);
        let statusLuarWilayah = !matchSlsLokal;

        let objekHistoriBaru = {
            idsubsls: safeIdSubSls,
            nmsls: detectedSls?.nmsls || matchSlsLokal?.nmsls || "Memuat Nama SLS...",
            nmdesa: detectedSls?.nmdesa || matchSlsLokal?.nmdesa || "-",
            kdsls: detectedSls?.kdsls || matchSlsLokal?.kdsls || "0000",
            isLuarWilayah: statusLuarWilayah
        };

        if (statusLuarWilayah && navigator.onLine) {
            try {
                const { data: globalSls } = await supabase
                    .from('muatan_sls')
                    .select('nmsls, nmdesa, kdsls')
                    .eq('idsubsls', safeIdSubSls)
                    .single();
                
                if (globalSls) {
                    objekHistoriBaru.nmsls = globalSls.nmsls;
                    objekHistoriBaru.nmdesa = globalSls.nmdesa;
                    objekHistoriBaru.kdsls = globalSls.kdsls;
                } else {
                    objekHistoriBaru.nmsls = "SLS Tidak Dikenal Sistem";
                }
            } catch (e) {
                console.warn("Gagal lookup global SLS:", e.message);
            }
        }

        if (!navigator.onLine) {
            try {
                const db = await initOfflineDB();
                const tx = db.transaction("pending_checkins", "readwrite");
                tx.objectStore("pending_checkins").add(payloadOfflinePack);

                const updatedToday = [...todayCheckIns, objekHistoriBaru];
                setTodayCheckIns(updatedToday);
                localStorage.setItem(`cache_today_checkins_${cleanEmail}_${tglHariIni}`, JSON.stringify(updatedToday));

                alert("💾 Tersimpan Offline! Log absen dan berkas foto bukti Anda aman di memori lokal HP.");
                await checkOfflineQueueCount();
                resetForm();
            } catch (e) {
                alert("Gagal mengamankan data lokal internal: " + e.message);
            } finally {
                setActionLoading(false);
                setShowValidationDialog(false);
            }
            return;
        }

        try {
            const gasUrl = "https://script.google.com/macros/s/AKfycbwtBgrsYjqda1azzjFTaZRPrjh5Unv1bleWjdnwua3lQrRfR_AIjTDmR-5NIGKrSEM/exec";
            const responseGas = await fetch(gasUrl, {
                method: "POST",
                body: JSON.stringify({ fotoBase64: photoBase64, namaFile: namaFileUnik })
            });

            const hasilGas = await responseGas.json();
            if (hasilGas.status !== "success") throw new Error("Google API Drive menolak file.");

            const { error } = await supabase
                .from('log_checkin_pcl')
                .insert({
                    tanggal: tglHariIni,
                    idsubsls: safeIdSubSls,
                    petugas_email: cleanEmail,
                    latitude: currentCoords?.latitude || null,
                    longitude: currentCoords?.longitude || null,
                    is_within_range: !manualMode,
                    foto_bukti: hasilGas.url
                });

            if (error) throw error;

            const updatedCacheCheckins = [...todayCheckIns, objekHistoriBaru];
            setTodayCheckIns(updatedCacheCheckins);
            localStorage.setItem(`cache_today_checkins_${cleanEmail}_${tglHariIni}`, JSON.stringify(updatedCacheCheckins));

            setHistoryDates(prev => prev.includes(tglHariIni) ? prev : [...prev, tglHariIni]);
            alert("Absensi Lapangan Sukses Disimpan!");
            resetForm();

        } catch (err) {
            console.error("Gagal online, mengalihkan ke luring:", err.message);
            try {
                const db = await initOfflineDB();
                const tx = db.transaction("pending_checkins", "readwrite");
                tx.objectStore("pending_checkins").add(payloadOfflinePack);
                setTodayCheckIns(prev => [...prev, objekHistoriBaru]);
                await checkOfflineQueueCount();
                resetForm();
            } catch (e) {
                alert("Gagal menyimpan luring darurat: " + e.message);
            }
        } finally {
            setActionLoading(false);
            setShowValidationDialog(false); 
            setPendingTargetId(null);
        }
    }, [user, profile, currentCoords, manualMode, selectedManualDate, photoBase64, allMySls, detectedSls, todayCheckIns, resetForm, actionLoading]);

    const initPclPage = async () => {
        const pclEmail = user?.email || profile?.email;
        if (!pclEmail) return;

        setLoading(true);
        const tglHariIni = getTodayDateString();
        const cleanEmail = pclEmail.toLowerCase().trim();
        await checkOfflineQueueCount();

        // Ambil setingan control admin dari server Supabase
        if (navigator.onLine) {
            try {
                const { data: remoteConfig } = await supabase
                    .from('app_settings')
                    .select('value_boolean')
                    .eq('key', 'allow_manual_upload')
                    .single();
                if (remoteConfig) {
            // Karena tipenya sudah boolean (bool) di database, langsung ambil nilainya
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

        const kodeKec = getKecamatanCode();
        if (kodeKec) downloadAndCacheGeoJson(kodeKec);

        if (!navigator.onLine) {
            console.warn("🌐 [LURING] Memulihkan data penugasan dari memori cache HP.");
            const cachedSls = localStorage.getItem(`cache_sls_beban_${cleanEmail}`);
            if (cachedSls) setAllMySls(JSON.parse(cachedSls));

            const cachedToday = localStorage.getItem(`cache_today_checkins_${cleanEmail}_${tglHariIni}`);
            if (cachedToday) setTodayCheckIns(JSON.parse(cachedToday));

            const cachedHistory = localStorage.getItem(`cache_history_dates_${cleanEmail}`);
            if (cachedHistory) setHistoryDates(JSON.parse(cachedHistory));

            setLoading(false);
            return;
        }

        try {
            // 1. Ambil data master SLS beban kerja resmi PCL
            const { data: slsData } = await supabase
                .from('muatan_sls')
                .select('*')
                .eq('petugas_id', cleanEmail);
            
            const currentMySls = slsData || [];
            setAllMySls(currentMySls);
            localStorage.setItem(`cache_sls_beban_${cleanEmail}`, JSON.stringify(currentMySls));

            // 2. Ambil log check-in PCL harian
            const { data: allLogs } = await supabase
                .from('log_checkin_pcl')
                .select('tanggal, idsubsls')
                .eq('petugas_email', cleanEmail);

            if (allLogs) {
                const uniqueDates = [...new Set(allLogs.map(log => log.tanggal))];
                setHistoryDates(uniqueDates);
                localStorage.setItem(`cache_history_dates_${cleanEmail}`, JSON.stringify(uniqueDates));

                const todayLogsRaw = allLogs.filter(log => log.tanggal === tglHariIni);
                
                const missingIds = [];
                todayLogsRaw.forEach(log => {
                    const idString = String(log.idsubsls).trim();
                    const localMatch = currentMySls.find(s => String(s.idsubsls).trim() === idString);
                    if (!localMatch) missingIds.push(idString);
                });

                const globalSlsMap = new Map();
                if (missingIds.length > 0) {
                    const { data: globalSlsData } = await supabase
                        .from('muatan_sls')
                        .select('idsubsls, nmsls, nmdesa, kdsls')
                        .in('idsubsls', missingIds);
                    
                    if (globalSlsData) {
                        globalSlsData.forEach(s => globalSlsMap.set(String(s.idsubsls).trim(), s));
                    }
                }

                const formatHistoriHariIni = todayLogsRaw.map(log => {
                    const idString = String(log.idsubsls).trim();
                    let matchSls = currentMySls.find(s => String(s.idsubsls).trim() === idString);
                    let isLuarTugas = false;

                    if (!matchSls) {
                        isLuarTugas = true;
                        matchSls = globalSlsMap.get(idString);
                    }

                    return {
                        idsubsls: idString,
                        nmsls: matchSls?.nmsls || "SLS Tidak Dikenal Sistem",
                        nmdesa: matchSls?.nmdesa || "-",
                        kdsls: matchSls?.kdsls || "0000",
                        isLuarWilayah: isLuarTugas
                    };
                });

                setTodayCheckIns(formatHistoriHariIni);
                localStorage.setItem(`cache_today_checkins_${cleanEmail}_${tglHariIni}`, JSON.stringify(formatHistoriHariIni));
            }
        } catch (err) {
            console.error("Gagal memuat histori absensi:", err.message);
            const cachedSls = localStorage.getItem(`cache_sls_beban_${cleanEmail}`);
            if (cachedSls) setAllMySls(JSON.parse(cachedSls));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!authLoading && (user?.email || profile?.email)) {
            initPclPage();
        }
    }, [profile, authLoading, user]);

    useEffect(() => {
        const handleSignalToggle = () => checkOfflineQueueCount();
        window.addEventListener('online', handleSignalToggle);
        window.addEventListener('offline', handleSignalToggle);
        return () => {
            window.removeEventListener('online', handleSignalToggle);
            window.removeEventListener('offline', handleSignalToggle);
        };
    }, []);

    const onTouchStart = (e) => {
        setTouchEnd(null);
        setTouchStart(e.targetTouches[0].clientX);
    };

    const onTouchMove = (e) => {
        setTouchEnd(e.targetTouches[0].clientX);
    };

    const onTouchEnd = () => {
        if (!touchStart || !touchEnd) return;
        const distance = touchStart - touchEnd;
        const isLeftSwipe = distance > minSwipeDistance;
        const isRightSwipe = distance < -minSwipeDistance;

        if (isLeftSwipe && activeTab === 0) {
            setActiveTab(1);
        } else if (isRightSwipe && activeTab === 1) {
            setActiveTab(0);
        }
    };

    // ⚡ PROSES REKAM BERKAS FOTO MENTAH
    const handleCapturePhoto = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setRawPhotoFile(file);
    };

    // ⚡ AUTOMATIC WATERMARK ENGINE UNTUK PCL (TERKUNCI SATELIT GPS & ANTI-RACE CONDITION)
    useEffect(() => {
        if (!rawPhotoFile || gpsLoading) return;

        const generateLiveWatermark = () => {
            const reader = new FileReader();
            reader.readAsDataURL(rawPhotoFile);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
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
                    ctx.drawImage(img, 0, 0, width, height);

                    // 1. Inisialisasi Variabel Spasial Kontekstual
                    let nmsls = "";
                    let nmdesa = "";
                    let nmkec = profile?.kecamatan_tugas ? profile.kecamatan_tugas.replace(/^\d+\s*/, '') : "";

                    // 2. Ambil data berdasarkan engine tracker yang aktif
                    if (detectedSls) {
                        nmsls = detectedSls.nmsls;
                        nmdesa = detectedSls.nmdesa;
                    } else if (manualMode && selectedManualSls) {
                        const match = allMySls.find(s => String(s.idsubsls).trim() === String(selectedManualSls).trim());
                        if (match) {
                            nmsls = match.nmsls;
                            nmdesa = match.nmdesa;
                            if (match.nmkec) nmkec = match.nmkec; 
                        } else {
                            nmsls = "PILIHAN MANUAL";
                        }
                    }

                    // 3. Gabungkan Info Wilayah Menjadi 1 Baris Solid
                    let wilayahTeks = "MEMINDAI AREA...";
                    if (isOutsideBorderBlock) {
                        wilayahTeks = "DI LUAR WILAYAH TUGAS";
                    } else if (nmsls) {
                        wilayahTeks = nmsls;
                        if (nmdesa) wilayahTeks += ` - DESA ${nmdesa}`;
                        if (nmkec) wilayahTeks += ` - KEC. ${nmkec}`;
                    }

                    // Watermark tanggal dinamis menyesuaikan pilihan form manual
                    const tglTeks = manualMode 
                        ? `${selectedManualDate} (UPLOAD MANUAL)` 
                        : new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
                        
                    const latTeks = currentCoords ? currentCoords.latitude.toFixed(6) : "TIDAK TERDETEKSI";
                    const lonTeks = currentCoords ? currentCoords.longitude.toFixed(6) : "TIDAK TERDETEKSI";
                    
                    const labelSensus = `SENSUS EKONOMI 2026`;
                    const labelPcl = `NAMA PETUGAS : ${String(profile?.nama_pengguna || 'PETUGAS LAPANGAN').toUpperCase()}`;
                    const labelSls = `LOKASI   : ${String(wilayahTeks).toUpperCase()}`;

                    // 4. Render Background Panel Watermark (Slate Dark Elegant)
                    const panelHeight = 135;
                    ctx.fillStyle = "rgba(15, 23, 42, 0.88)"; 
                    ctx.fillRect(0, height - panelHeight, width, panelHeight);

                    // 5. Render Garis Aksen Atas Berwarna Oranye Jingga Khas BPS
                    ctx.fillStyle = "#f97316"; 
                    ctx.fillRect(0, height - panelHeight, width, 4);

                    // 6. Cetak Teks Utama: Sensus Ekonomi
                    ctx.fillStyle = "#ffffff";
                    ctx.font = "bold 15px sans-serif";
                    ctx.fillText(labelSensus, 20, height - 105);

                    // 7. Cetak Teks Kedua: Nama PCL Akurat (Sky Blue Accent)
                    ctx.fillStyle = "#38bdf8"; 
                    ctx.font = "bold 12px sans-serif";
                    ctx.fillText(labelPcl, 20, height - 82);

                    // 8. Cetak Teks Ketiga: Kombinasi SLS - DESA - KECAMATAN (Amber/Gold Accent)
                    ctx.fillStyle = "#fbbf24"; 
                    ctx.font = "bold 12px sans-serif";
                    ctx.fillText(labelSls, 20, height - 60);

                    // 9. Cetak Metadata Logistik Sistem (Monospace Typography)
                    ctx.fillStyle = "#cbd5e1"; 
                    ctx.font = "11px monospace";
                    ctx.fillText(`WAKTU    : ${tglTeks} WIB`, 20, height - 38);
                    ctx.fillText(`KOORDINAT: LAT ${latTeks} | LON ${lonTeks}`, 20, height - 18);

                    // 10. Enkapsulasi Hasil Gambar
                    const compressedBase64 = canvas.toDataURL("image/jpeg", 0.6);
                    setPhotoBase64(compressedBase64);
                };
            };
        };

        generateLiveWatermark();
    }, [rawPhotoFile, gpsLoading, currentCoords, detectedSls, manualMode, selectedManualSls, selectedManualDate, profile, allMySls, isOutsideBorderBlock]);

    // ⚡ PROSES UTAMA DOUBLE-ENGINE (GPS + KAMERA SIMULTAN)
    const handleDetectLocation = () => {
        if (!navigator.geolocation) {
            alert("HP Anda memblokir fitur lokasi. Aktifkan GPS Anda.");
            return;
        }

        setGpsLoading(true);
        setDetectedSls(null);
        setManualMode(false);
        setPhotoBase64(null);
        setRawPhotoFile(null);
        setIsOutsideBorderBlock(false);

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude } = position.coords;
                setCurrentCoords({ latitude, longitude });

                const hasilSls = await prosesPencarianGeojson(latitude, longitude);

                if (hasilSls) {
                    setDetectedSls(hasilSls);
                } else {
                    setIsOutsideBorderBlock(true);
                }
                setGpsLoading(false);
            },
            (error) => {
                setGpsLoading(false);
                setManualMode(true);
                alert("⚠️ Sinyal satelit GPS lemah. Aplikasi beralih otomatis ke mode pilihan manual.");
            },
            { enableHighAccuracy: true, timeout: 25000, maximumAge: 0 }
        );

        // Secara sinkronus langsung memicu kamera HP terbuka tanpa jeda
        fileInputRef.current?.click();
    };

    const submitCheckInData = async (targetIdSubSls) => {
        if (actionLoading) return;

        if (isOutsideBorderBlock) {
            alert("Sistem mengunci absensi! Anda berada di luar area tugas.");
            return;
        }

        const safeIdSubSls = String(targetIdSubSls).trim();

        if (!photoBase64) {
            alert("Wajib mengambil foto lokasi terlebih dahulu atau tunggu hingga watermark selesai dibuat!");
            return;
        }

        const matchSlsLokal = allMySls.find(s => String(s.idsubsls).trim() === safeIdSubSls);
        
        if (!matchSlsLokal) {
            setPendingTargetId(safeIdSubSls);
            setShowValidationDialog(true);
            return; 
        }

        await eksekusiKirimBypass(safeIdSubSls);
    };

    const handleSyncOfflineData = async () => {
        setIsSyncing(true);
        try {
            const db = await initOfflineDB();
            const txRead = db.transaction("pending_checkins", "readonly");
            const store = txRead.objectStore("pending_checkins");
            const getAllRequest = store.getAll();

            getAllRequest.onsuccess = async () => {
                const records = getAllRequest.result;
                if (records.length === 0) {
                    setIsSyncing(false);
                    return;
                }

                let suksesCount = 0;
                const idsToDelete = [];
                const gasUrl = "https://script.google.com/macros/s/AKfycbwtBgrsYjqda1azzjFTaZRPrjh5Unv1bleWjdnwua3lQrRfR_AIjTDmR-5NIGKrSEM/exec";
                const namaClean = profile?.nama_pengguna ? profile.nama_pengguna.replace(/\s+/g, '_').toUpperCase() : 'PETUGAS';

                for (let record of records) {
                    try {
                        const tglClean = record.tanggal.replace(/-/g, '');
                        const namaFileUnik = `SE26_PPL_${record.idsubsls}_${namaClean}_TGL_${tglClean}.jpg`;

                        const resGas = await fetch(gasUrl, {
                            method: "POST",
                            body: JSON.stringify({
                                fotoBase64: record.fotoBase64Cadangan,
                                namaFile: namaFileUnik
                            })
                        });
                        const hasilGas = await resGas.json();

                        if (hasilGas.status === "success") {
                            const { error } = await supabase
                                .from('log_checkin_pcl')
                                .insert({
                                    tanggal: record.tanggal,
                                    idsubsls: record.idsubsls,
                                    petugas_email: record.petugas_email,
                                    latitude: record.latitude,
                                    longitude: record.longitude,
                                    is_within_range: record.is_within_range,
                                    foto_bukti: hasilGas.url
                                });

                            if (!error) {
                                suksesCount++;
                                idsToDelete.push(record.id);
                            }
                        }
                    } catch (loopErr) {
                        console.error("Gagal merestorasi baris antrean:", loopErr);
                    }
                }

                if (idsToDelete.length > 0) {
                    const deleteTx = db.transaction("pending_checkins", "readwrite");
                    const storeDelete = deleteTx.objectStore("pending_checkins");
                    idsToDelete.forEach(id => storeDelete.delete(id));
                    deleteTx.oncomplete = () => {
                        alert(`📡 Sinkronisasi Selesai! Berhasil merestorasi ${suksesCount} log absen ke server.`);
                        checkOfflineQueueCount();
                        initPclPage();
                    };
                } else {
                    setIsSyncing(false);
                }
            };
        } catch (err) {
            alert("Gagal total sinkronisasi: " + err.message);
            setIsSyncing(false);
        }
    };

    const calendarCells = useMemo(() => {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();

        const firstDayOfMonth = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        const cells = [];
        const startDayIndex = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;
        for (let i = 0; i < startDayIndex; i++) {
            cells.push(<div key={`empty-${i}`} className="h-10"></div>);
        }

        const todayStr = getTodayDateString();

        for (let day = 1; day <= daysInMonth; day++) {
            const dString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isCheckedIn = historyDates.includes(dString) || (todayCheckIns.length > 0 && dString === todayStr);

            cells.push(
                <div
                    key={`day-${day}`}
                    className={`h-10 w-10 mx-auto flex items-center justify-center rounded-xl text-xs font-black border transition-all ${
                        isCheckedIn
                            ? 'bg-green-500 border-green-600 text-white shadow-sm shadow-green-500/20'
                            : 'bg-white border-slate-200 text-slate-700'
                    }`}
                >
                    {day}
                </div>
            );
        }
        return cells;
    }, [currentMonth, historyDates, todayCheckIns]);

    const changeMonth = (direction) => {
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + direction, 1));
    };

    if (authLoading || (loading && allMySls.length === 0)) {
        return (
            <div className="h-screen bg-slate-50 flex flex-col justify-center items-center p-6 text-center">
                <RefreshCw className="animate-spin text-orange-600 mb-3" size={32} />
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Sinkronisasi GPS Pendataan...</p>
            </div>
        );
    }

    return (
       <div
            className="h-[100dvh] w-screen bg-slate-50 font-sans flex flex-col relative overflow-hidden text-slate-800"
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
        >
            {/* INPUT KAMERA/GALERI DINAMIS BERDASARKAN SETTING ADMIN */}
            <input 
                type="file" 
                ref={fileInputRef} 
                accept="image/*" 
                capture="user"
                className="hidden" 
                onChange={handleCapturePhoto} 
            />

            {/* AREA MAIN PROFILE CARD */}
            <div className="p-4 bg-slate-50 shrink-0">
                <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-3xl p-5 shadow-xl border border-slate-700/50">
                    <div className="flex justify-between items-center gap-2">
                        <div className="min-w-0 flex-1">
                            <span className="text-[9px] bg-orange-500 text-white px-2 py-0.5 rounded-full font-black uppercase tracking-wider">
                                Petugas Lapangan SE2026 {!navigator.onLine && "(MODE LURING)"}
                            </span>
                            <h2 className="text-base font-black mt-1 uppercase tracking-tight truncate max-w-[160px]">
                                {profile?.nama_pengguna || 'Petugas'}
                            </h2>
                            <p className="text-[10px] text-slate-400 font-medium truncate max-w-[160px]">
                                Wilayah: <span className="text-orange-400 font-bold">{profile?.kecamatan_tugas}</span>
                            </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                            <div className="text-right flex items-center gap-1.5 bg-slate-800 px-2.5 py-1.5 rounded-xl border border-slate-700/40 text-[10px] font-black text-slate-300 uppercase tracking-tight">
                                <Calendar size={12} className="text-orange-400" />
                                <span>{activeTab === 0 ? "Utama" : "Kalender"}</span>
                            </div>

                            <button
                                onClick={logout}
                                className="p-2 bg-rose-500/10 hover:bg-rose-500/20 active:scale-95 text-rose-400 rounded-xl border border-rose-500/20 transition-all"
                                title="Keluar Akun"
                            >
                                <LogOut size={14} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* BANNER REKAP DATA OFFLINE */}
                {offlineCount > 0 && (
                    <div className="mt-3 bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-2xl flex items-center justify-between text-xs font-bold animate-fadeIn">
                        <div className="flex items-center gap-2">
                            <WifiOff size={16} className="text-rose-500 shrink-0 animate-pulse" />
                            <span>Ada {offlineCount} Absen Belum Terkirim</span>
                        </div>
                        <button
                            disabled={isSyncing || !navigator.onLine}
                            onClick={handleSyncOfflineData}
                            className="bg-rose-600 hover:bg-rose-700 text-white px-3 py-1 rounded-xl flex items-center gap-1 text-[11px] font-black transition-all disabled:bg-slate-300 disabled:text-slate-500"
                        >
                            {isSyncing ? <RefreshCw className="animate-spin" size={12} /> : <CloudLightning size={12} />}
                            {navigator.onLine ? "KIRIM" : "SINYAL MATI"}
                        </button>
                    </div>
                )}

                {/* DOT INDIKATOR TAB */}
                <div className="flex justify-center gap-2 mt-4">
                    <button onClick={() => setActiveTab(0)} className={`h-2 transition-all rounded-full ${activeTab === 0 ? 'w-6 bg-orange-500' : 'w-2 bg-slate-300'}`}></button>
                    <button onClick={() => setActiveTab(1)} className={`h-2 transition-all rounded-full ${activeTab === 1 ? 'w-6 bg-orange-500' : 'w-2 bg-slate-300'}`}></button>
                </div>
            </div>

            {/* CONTAINER PANELS */}
            <div className="flex-1 flex w-[200%] transition-transform duration-300 ease-out overflow-hidden" style={{ transform: `translateX(-${activeTab * 50}%)` }}>

                {/* PANEL 1: ABSENSI UTAMA */}
                <div className="w-1/2 p-4 shrink-0 flex flex-col justify-start overflow-y-auto pb-12">
                    <div className="space-y-4">

                        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm text-center space-y-5">
                            <div className="flex flex-col items-center justify-center">
                                <h3 className="text-base font-black text-slate-800">Absensi Lapangan</h3>
                                <p className="text-xs text-slate-400 mt-1">Tekan tombol di bawah untuk melakukan absensi lapangan.</p>
                                
                                {/* UI SWITCH MODE MANUAL (HANYA AKTIF JIKA DI-ALLOW ADMIN DI BACKEND) */}
{allowManualMode && (
    <div 
        onClick={() => {
            const nextState = !manualMode;
            resetForm();
            setManualMode(nextState);
        }}
        className="mt-3 bg-amber-50/80 border border-amber-200 rounded-2xl p-3.5 text-left shadow-xs flex items-center justify-between gap-3 cursor-pointer hover:bg-amber-100/50 active:scale-99 transition-all animate-fadeIn"
    >
        {/* Teks Kiri */}
        <div className="flex gap-2.5 items-center min-w-0">
            <ShieldAlert size={18} className="text-amber-600 shrink-0" />
            <div className="min-w-0">
                <p className="text-xs font-black text-amber-900 uppercase tracking-tight">Pindah Mode Upload Manual</p>
                <p className="text-[10px] text-amber-700/80 truncate font-medium">Klik untuk mengaktifkan galeri & tanggal manual</p>
            </div>
        </div>

        {/* Indikator Switch Kanan */}
        <div className={`w-9 h-5 shrink-0 rounded-full p-0.5 transition-colors duration-200 ease-in-out flex items-center ${
            manualMode ? 'bg-amber-600' : 'bg-slate-300'
        }`}>
            <div className={`bg-white w-4 h-4 rounded-full shadow-sm transform transition-transform duration-200 ease-in-out ${
                manualMode ? 'translate-x-4' : 'translate-x-0'
            }`} />
        </div>
    </div>
)}
                            </div>

                            {!manualMode && (
                                <div className="flex justify-center items-center py-2 animate-fadeIn">
                                    <button
                                        disabled={gpsLoading || actionLoading}
                                        onClick={handleDetectLocation}
                                        className={`w-32 h-32 rounded-full flex flex-col justify-center items-center gap-2 font-black text-sm uppercase tracking-wider border-8 shadow-xl transition-all duration-300 active:scale-95 ${
                                            gpsLoading || actionLoading
                                                ? 'bg-slate-100 border-slate-200 text-slate-400'
                                                : 'bg-orange-500 hover:bg-orange-600 border-orange-100 text-white shadow-orange-500/20'
                                        }`}
                                    >
                                        {gpsLoading || actionLoading ? <RefreshCw className="animate-spin" size={28} /> : <Navigation className="fill-white" size={28} />}
                                        <span className="text-[11px]">{gpsLoading ? "Mengunci Satelit..." : "Ambil Absen"}</span>
                                    </button>
                                </div>
                            )}

                            {/* WARNING BLOCKER OUTSIDE POLYGON */}
                            {isOutsideBorderBlock && (
                                <div className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-4 text-left space-y-2 animate-fadeIn">
                                    <div className="flex items-center gap-2 text-rose-700 font-black text-xs uppercase">
                                        <AlertOctagon size={18} className="text-rose-600 animate-bounce" />
                                        <span>Di Luar Wilayah Tugas</span>
                                    </div>
                                    <p className="text-[11px] text-rose-600 font-bold leading-relaxed">
                                        Satelit GPS mendeteksi posisi Anda berada di luar cakupan batas poligon SLS beban kerja Anda. Silakan berpindah ke area lokasi tugas asli Anda.
                                    </p>
                                    <button
                                        onClick={resetForm}
                                        className="w-full bg-rose-600 hover:bg-rose-700 text-white font-black py-2 rounded-xl text-[10px] uppercase tracking-wide transition-all"
                                    >
                                        Ulangi Deteksi Koordinat
                                    </button>
                                </div>
                            )}

                            {/* SLOT INTERAKSI: PREVIEW FOTO JIKA DIGUNAKAN */}
                            {(rawPhotoFile || gpsLoading || detectedSls || manualMode) && !isOutsideBorderBlock && (
                                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-left space-y-3 animate-fadeIn">
                                    <span className="text-[9px] font-black uppercase text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded block text-center">
                                        Rangkuman Foto & Deteksi Lokasi
                                    </span>

                                    {/* Preview Foto */}
                                    {photoBase64 ? (
                                        <div className="relative rounded-xl overflow-hidden border border-slate-300 shadow-inner">
                                            <img src={photoBase64} alt="Preview Bukti" className="w-full h-36 object-cover" />
                                            <button 
                                                onClick={() => fileInputRef.current?.click()}
                                                className="absolute bottom-2 right-2 bg-slate-900/80 text-white px-2.5 py-1.5 rounded-xl text-[10px] font-black cursor-pointer uppercase tracking-wider"
                                            >
                                                Ulangi Foto / Berkas
                                            </button>
                                        </div>
                                    ) : rawPhotoFile ? (
                                        <div className="flex items-center justify-center gap-2 py-5 text-xs font-bold text-slate-500 uppercase tracking-widest bg-white border rounded-xl">
                                            <RefreshCw className="animate-spin text-orange-500" size={14} />
                                            <span>Membuat Watermark Spasial...</span>
                                        </div>
                                    ) : null}

                                    {/* Info Deteksi Khusus non-manual mode */}
                                    {gpsLoading ? (
                                        <div className="flex items-center justify-center gap-2 py-3 text-xs font-bold text-slate-500 uppercase tracking-widest">
                                            <RefreshCw className="animate-spin text-orange-500" size={14} />
                                            <span>Mengunci Posisi Satelit...</span>
                                        </div>
                                    ) : detectedSls ? (
                                        <div className="pt-1 animate-fadeIn">
                                            <h4 className="text-xs font-black text-slate-800 uppercase truncate">Target: {detectedSls.nmsls}</h4>
                                            <p className="text-[10px] text-slate-400 font-medium">Desa: {detectedSls.nmdesa}</p>
                                            <button
                                                disabled={!photoBase64 || actionLoading}
                                                onClick={() => submitCheckInData(detectedSls.idsubsls)}
                                                className="w-full mt-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider transition-all disabled:bg-slate-300 flex items-center justify-center gap-2"
                                            >
                                                {actionLoading ? <RefreshCw className="animate-spin" size={12} /> : null}
                                                <span>{actionLoading ? "Mengunggah..." : "Kirim Absen & Foto Bukti"}</span>
                                            </button>
                                        </div>
                                    ) : null}
                                </div>
                            )}

                            {/* FALLBACK FIELD MANUAL (OTOMATIS / AKIBAT CONTROL TOGGLE ADMIN) */}
                            {(manualMode && !isOutsideBorderBlock) && (
                                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-left animate-fadeIn space-y-3">
                                    <div className="flex gap-2 items-center text-amber-800 font-bold text-xs uppercase mb-1">
                                        <ShieldAlert size={16} />
                                        <span>Form Entri Absensi Manual</span>
                                    </div>

                                    {/* Form Input Tanggal Manual */}
                                    <div>
                                        <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Tanggal Kegiatan</label>
                                        <input 
                                            type="date"
                                            max={getTodayDateString()}
                                            className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 outline-none"
                                            value={selectedManualDate}
                                            onChange={(e) => setSelectedManualDate(e.target.value)}
                                        />
                                    </div>

                                    {/* Form Pilihan SLS Manual */}
                                    <div>
                                        <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Wilayah SLS Kerja</label>
                                        <select
                                            className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 outline-none"
                                            value={selectedManualSls}
                                            onChange={(e) => setSelectedManualSls(e.target.value)}
                                        >
                                            <option value="">-- Pilih Wilayah SLS Tugas Anda --</option>
                                            {allMySls.map(s => (
                                                <option key={s.idsubsls} value={s.idsubsls}>
                                                    ({s.kdsls}) {s.nmsls} - Desa {s.nmdesa}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Tombol Ambil File dari Galeri / Kamera */}
                                    <div>
                                        <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Pilih Dokumen Bukti</label>
                                        <button
                                            type="button"
                                            onClick={() => fileInputRef.current?.click()}
                                            className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-2 rounded-xl text-[10px] uppercase tracking-wider transition-all flex items-center justify-center gap-2"
                                        >
                                            <Camera size={12} />
                                            {photoBase64 ? "Ubah File Pilihan" : "Buka Galeri / Kamera HP"}
                                        </button>
                                    </div>

                                    {selectedManualSls && (
                                        <div className="mt-3 pt-1">
                                            <button
                                                disabled={!photoBase64 || actionLoading}
                                                onClick={() => submitCheckInData(selectedManualSls)}
                                                className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider transition-all disabled:bg-slate-300 flex items-center justify-center gap-2"
                                            >
                                                {actionLoading ? <RefreshCw className="animate-spin" size={12} /> : null}
                                                <span>{actionLoading ? "Mengunci..." : "Kunci Wilayah & Simpan"}</span>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* HISTORI ABSENSI */}
                        <div className="bg-white rounded-3xl border border-slate-200 p-4 shadow-sm space-y-3">
                            <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                                    Histori Absen Hari Ini
                                </span>
                                <span className="text-[10px] font-mono font-black bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full border border-orange-100">
                                    {todayCheckIns.length} Absen Tercatat
                                </span>
                            </div>

                            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                                {todayCheckIns.map((sls, idx) => (
                                    <div 
                                        key={`today-hist-${sls.idsubsls}-${idx}`} 
                                        className={`flex items-center justify-between p-2.5 rounded-xl border text-left gap-2 animate-fadeIn ${
                                            sls.isLuarWilayah 
                                                ? 'bg-orange-50/40 border-orange-200/70' 
                                                : 'bg-slate-50 border-slate-200/60'
                                        }`}
                                    >
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-start gap-2">
                                                <div className={`w-4 h-4 rounded-full text-white flex items-center justify-center font-mono text-[9px] font-black shrink-0 mt-0.5 shadow-xs ${
                                                    sls.isLuarWilayah ? 'bg-orange-500' : 'bg-emerald-500'
                                                }`}>
                                                    {sls.isLuarWilayah ? '!' : '✓'}
                                                </div>
                                                <div className="min-w-0">
                                                    <h4 className="text-xs font-black text-slate-700 uppercase leading-tight break-words">
                                                        ({sls.kdsls}) {sls.nmsls}
                                                    </h4>
                                                    <p className="text-[9px] text-slate-400 font-extrabold uppercase mt-0.5 tracking-tight">
                                                        Desa: <span className="text-slate-600">{sls.nmdesa}</span>
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        {sls.isLuarWilayah ? (
                                            <span className="text-[7px] font-black tracking-wider text-orange-600 bg-orange-100/60 border border-orange-200 px-1.5 py-0.5 rounded-md shrink-0 uppercase">
                                                LUAR WILAYAH
                                            </span>
                                        ) : (
                                            <span className="text-[8px] font-black tracking-wider text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md shrink-0 uppercase">
                                                ABSENSI VALID
                                            </span>
                                        )}
                                    </div>
                                ))}

                                {todayCheckIns.length === 0 && (
                                    <div className="text-center py-5 text-[10px] text-slate-400 font-bold uppercase tracking-wide border border-dashed border-slate-200 rounded-xl">
                                        Belum melakukan check-in hari ini.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="text-center text-[10px] text-slate-400 font-black uppercase tracking-wider mt-4 animate-pulse flex items-center justify-center gap-1">
                        <span>Geser layar ke kiri untuk riwayat kalender</span>
                        <ChevronRight size={12} />
                    </div>
                </div>

                {/* PANEL 2: KALENDER PANEL */}
                <div className="w-1/2 p-4 shrink-0 flex flex-col justify-start overflow-y-auto pb-12">
                    <div className="bg-white rounded-3xl border border-slate-200 p-4 shadow-sm">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-3 mb-4">
                            <button onClick={() => changeMonth(-1)} className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 transition-all">
                                <ChevronLeft size={16} />
                            </button>
                            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                                {currentMonth.toLocaleString('id-ID', { month: 'long', year: 'numeric' })}
                            </h4>
                            <button onClick={() => changeMonth(1)} className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 transition-all">
                                <ChevronRight size={16} />
                            </button>
                        </div>

                        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-black text-slate-400 uppercase tracking-tight mb-2">
                            <div>Sen</div><div>Sel</div><div>Rab</div><div>Kam</div><div>Jum</div><div>Sab</div><div>Min</div>
                        </div>

                        <div className="grid grid-cols-7 gap-y-2 gap-x-1 text-center">
                            {calendarCells}
                        </div>
                    </div>

                    <div className="mt-4 p-3 bg-white border border-slate-200 rounded-2xl flex items-center gap-3 text-xs">
                        <div className="h-5 w-5 bg-green-500 rounded-lg shadow-sm"></div>
                        <span className="font-bold text-slate-600">Hari Jalan Lapangan (Ada Log Absensi Lapangan)</span>
                    </div>
                </div>
            </div>

            {/* INTERAKTIF DIALOG DI LUAR WILAYAH KERJA DENGAN ABSOLUTE LOCK TOMBOL */}
            {showValidationDialog && (
                <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-5 z-50 animate-fadeIn">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-sm border border-slate-100 shadow-2xl text-center space-y-4">
                        <div className="mx-auto w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center text-amber-500">
                            <ShieldAlert size={26} className="animate-pulse" />
                        </div>
                        
                        <div>
                            <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Konfirmasi Di Luar Wilayah Kerja</h3>
                            <p className="text-[11px] text-slate-500 leading-relaxed mt-1.5">
                                Aplikasi mendeteksi Anda berada di <span className="font-black text-orange-600">Luar SLS Wilayah Kerja</span> Anda. Tetap Lanjutkan Pengiriman Absensi?
                            </p>
                        </div>

                        <div className="flex gap-2 pt-2">
                            <button
                                disabled={actionLoading}
                                onClick={() => {
                                    setShowValidationDialog(false);
                                    setPendingTargetId(null);
                                }}
                                className="flex-1 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider transition-all disabled:opacity-40"
                            >
                                Batalkan
                            </button>
                            <button
                                disabled={actionLoading}
                                onClick={async () => {
                                    if (actionLoading) return;
                                    if (pendingTargetId) {
                                        await eksekusiKirimBypass(pendingTargetId);
                                    }
                                }}
                                className="flex-1 bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-black py-2.5 rounded-xl text-xs uppercase tracking-wider transition-all shadow-md shadow-orange-500/10 flex items-center justify-center gap-1 disabled:bg-slate-400"
                            >
                                {actionLoading ? <RefreshCw className="animate-spin" size={12} /> : null}
                                <span>{actionLoading ? "Mengirim..." : "Tetap Lanjutkan"}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}