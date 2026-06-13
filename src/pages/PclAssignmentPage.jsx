import React, { useState, useEffect } from 'react';
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

    // State Navigasi Slider
    const [activeTab, setActiveTab] = useState(0);
    const [touchStart, setTouchStart] = useState(null);
    const [touchEnd, setTouchEnd] = useState(null);

    // State Data & Loading
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [allMySls, setAllMySls] = useState([]);
    const [todayCheckIns, setTodayCheckIns] = useState([]);
    const [historyDates, setHistoryDates] = useState([]);

    // State Hasil Deteksi Posisi GPS
    const [detectedSls, setDetectedSls] = useState(null);
    const [currentCoords, setCurrentCoords] = useState(null);
    const [manualMode, setManualMode] = useState(false);
    const [selectedManualSls, setSelectedManualSls] = useState("");

    // BLOCKER JIKA PETUGAS DI LUAR WILAYAH KECAMATAN TUGAS
    const [isOutsideBorderBlock, setIsOutsideBorderBlock] = useState(false);

    // STATE: FOTO, WATERMARK, DAN OFFLINE STATUS
    const [photoBase64, setPhotoBase64] = useState(null);
    const [offlineCount, setOfflineCount] = useState(0);
    const [isSyncing, setIsSyncing] = useState(false);
    // State untuk kontrol modal peringatan luar wilayah tugas
    const [showValidationDialog, setShowValidationDialog] = useState(false);
    const [pendingTargetId, setPendingTargetId] = useState(null);
    // State Kalender Bulanan
    const [currentMonth, setCurrentMonth] = useState(new Date());

    const minSwipeDistance = 60;

    const getTodayDateString = () => {
        return new Date().toLocaleString("sv-SE", { timeZone: "Asia/Jakarta" }).split(" ")[0];
    };

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

    // OPTIMASI: Mengunduh map spasial ke lokal hp untuk menjamin 100% luring bebas hambatan
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

    const initPclPage = async () => {
        const pclEmail = user?.email || profile?.email;
        if (!pclEmail) return;

        setLoading(true);
        const tglHariIni = getTodayDateString();
        const cleanEmail = pclEmail.toLowerCase().trim();
        await checkOfflineQueueCount();

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

            // 2. Ambil log check-in PCL hari ini
            const { data: allLogs } = await supabase
                .from('log_checkin_pcl')
                .select('tanggal, idsubsls')
                .eq('petugas_email', cleanEmail);

            if (allLogs) {
                const uniqueDates = [...new Set(allLogs.map(log => log.tanggal))];
                setHistoryDates(uniqueDates);
                localStorage.setItem(`cache_history_dates_${cleanEmail}`, JSON.stringify(uniqueDates));

                const todayLogsRaw = allLogs.filter(log => log.tanggal === tglHariIni);
                const formatHistoriHariIni = [];

                // 3. LOOPING AMAN: Cari nama SLS langsung ke Supabase jika di lokal tidak terdaftar
                for (let log of todayLogsRaw) {
                    const idString = String(log.idsubsls).trim();
                    
                    // Coba cari di beban kerja lokal dulu
                    let matchSls = currentMySls.find(s => String(s.idsubsls).trim() === idString);
                    let isLuarTugas = false;

                    // Jika tidak ada di beban kerja lokal, tembak langsung ke master global muatan_sls
                    if (!matchSls) {
                        isLuarTugas = true;
                        const { data: globalSls } = await supabase
                            .from('muatan_sls')
                            .select('nmsls, nmdesa, kdsls')
                            .eq('idsubsls', idString)
                            .single();
                        
                        if (globalSls) matchSls = globalSls;
                    }

                    formatHistoriHariIni.push({
                        idsubsls: idString,
                        nmsls: matchSls?.nmsls || "SLS Tidak Dikenal Sistem",
                        nmdesa: matchSls?.nmdesa || "-",
                        kdsls: matchSls?.kdsls || "0000",
                        isLuarWilayah: isLuarTugas // <--- 🚩 FLAG PENANDA LUAR WILAYAH
                    });
                }

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
        const iSLeftSwipe = distance > minSwipeDistance;
        const isRightSwipe = distance < -minSwipeDistance;

        if (iSLeftSwipe && activeTab === 0) {
            setActiveTab(1);
        } else if (isRightSwipe && activeTab === 1) {
            setActiveTab(0);
        }
    };

    const handleCapturePhoto = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setActionLoading(true);
        const reader = new FileReader();
        reader.readAsDataURL(file);
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

                const tglTeks = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
                const latTeks = currentCoords ? `LAT: ${currentCoords.latitude.toFixed(6)}` : "LAT: ERROR";
                const lonTeks = currentCoords ? `LON: ${currentCoords.longitude.toFixed(6)}` : "LON: ERROR";
                const labelSensus = `SENSUS EKONOMI 2026 - PCL`;

                ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
                ctx.fillRect(0, height - 100, width, 100);

                ctx.fillStyle = "#ffffff";
                ctx.font = "bold 16px sans-serif";
                ctx.fillText(labelSensus, 20, height - 70);

                ctx.font = "14px monospace";
                ctx.fillText(tglTeks, 20, height - 45);
                ctx.fillText(`${latTeks} | ${lonTeks}`, 20, height - 20);

                const compressedBase64 = canvas.toDataURL("image/jpeg", 0.6);
                setPhotoBase64(compressedBase64);
                setActionLoading(false);
            };
        };
    };

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
            // Ambil dari cache local storage terlebih dahulu agar luring 100% aman
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
            console.error("Gagal membaca berkas spasial luring:", err.message);
        }
        return null;
    };

    const handleDetectLocation = () => {
        if (!navigator.geolocation) {
            alert("HP Anda memblokir fitur lokasi. Aktifkan GPS Anda.");
            return;
        }

        setActionLoading(true);
        setDetectedSls(null);
        setManualMode(false);
        setPhotoBase64(null);
        setIsOutsideBorderBlock(false);

        // PERBAIKAN: Menaikkan batas waktu tunggu pencarian satelit di daerah sulit sinyal
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
                setActionLoading(false);
            },
            (error) => {
                setActionLoading(false);
                setManualMode(true);
                alert("⚠️ Gagal menangkap satelit GPS harian. Gunakan alternatif pilihan manual.");
            },
            { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
        );
    };

    // FUNGSI UTAMA CEGATAN AWAL (DIPANGGIL SAAT TOMBOL DIKLIK)
    const submitCheckInData = async (targetIdSubSls) => {
        if (isOutsideBorderBlock) {
            alert("Sistem mengunci absensi! Anda berada di luar area tugas.");
            return;
        }

        const safeIdSubSls = String(targetIdSubSls).trim();

        if (!photoBase64) {
            alert("Wajib mengambil foto lokasi/papan nama terlebih dahulu sebagai bukti jepret lapangan!");
            return;
        }

        // 🔍 CEK: Apakah SLS ini terdaftar di beban kerja lokal PCL?
        const matchSlsLokal = allMySls.find(s => String(s.idsubsls).trim() === safeIdSubSls);
        
        if (!matchSlsLokal) {
            // 🚩 JIKA BUKAN WILAYAH TUGASNYA: Tahan proses, munculkan dialog warning!
            setPendingTargetId(safeIdSubSls);
            setShowValidationDialog(true);
            return; 
        }

        // Jika wilayahnya cocok, langsung eksekusi kirim tanpa hambatan pop-up
        await eksekusiKirimBypass(safeIdSubSls);
    };

    // 🚀 ENGINE INJEKSI KIRIM DATA (ONLINE & OFFLINE)
    const eksekusiKirimBypass = async (safeIdSubSls) => {
        const pclEmail = user?.email || profile?.email;
        const tglHariIni = getTodayDateString();
        const cleanEmail = pclEmail.toLowerCase().trim();

        setActionLoading(true);

        // 🛠️ REVISI FORMAT NAMA FILE: SE26_PPL_IDSLS_NAMA PETUGAS_TGL.jpg
        const namaClean = profile?.nama_pengguna ? profile.nama_pengguna.replace(/\s+/g, '_').toUpperCase() : 'PETUGAS';
        const tglClean = tglHariIni.replace(/-/g, ''); // Menghasilkan format YYYYMMDD (misal: 20260613)
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
            await saveToIndexedDBOffline(payloadOfflinePack, safeIdSubSls, cleanEmail, tglHariIni);
            setTodayCheckIns(prev => [...prev, objekHistoriBaru]);
            setActionLoading(false);
            setShowValidationDialog(false); // Tutup dialog jika terbuka
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

            setTodayCheckIns(prev => [...prev, objekHistoriBaru]);
            const updatedCacheCheckins = [...todayCheckIns, objekHistoriBaru];
            localStorage.setItem(`cache_today_checkins_${cleanEmail}_${tglHariIni}`, JSON.stringify(updatedCacheCheckins));

            if (!historyDates.includes(tglHariIni)) {
                setHistoryDates(prev => [...prev, tglHariIni]);
            }
            alert("Absensi Lapangan Sukses Disimpan!");
            resetForm();

        } catch (err) {
            console.error("Gagal online, mengalihkan ke luring:", err.message);
            await saveToIndexedDBOffline(payloadOfflinePack, safeIdSubSls, cleanEmail, tglHariIni);
            setTodayCheckIns(prev => [...prev, objekHistoriBaru]);
        } finally {
            setActionLoading(false);
            setShowValidationDialog(false); // Sembunyikan dialog setelah sukses
            setPendingTargetId(null);
        }
    };

    const saveToIndexedDBOffline = async (payload, targetIdSubSls, cleanEmail, tglHariIni) => {
        try {
            const db = await initOfflineDB();
            const tx = db.transaction("pending_checkins", "readwrite");
            tx.objectStore("pending_checkins").add(payload);

            const updatedToday = [...todayCheckIns, targetIdSubSls];
            setTodayCheckIns(updatedToday);
            localStorage.setItem(`cache_today_checkins_${cleanEmail}_${tglHariIni}`, JSON.stringify(updatedToday));

            alert("💾 Tersimpan Offline! Log absen dan berkas foto bukti Anda aman di memori lokal HP.");
            await checkOfflineQueueCount();
            resetForm();
        } catch (e) {
            alert("Gagal mengamankan data lokal internal: " + e.message);
        }
    };

    const resetForm = () => {
        setDetectedSls(null);
        setSelectedManualSls("");
        setManualMode(false);
        setPhotoBase64(null);
        setIsOutsideBorderBlock(false);
    };

    const handleSyncOfflineData = async () => {
        setIsSyncing(true);
        try {
            const db = await initOfflineDB();
            const tx = db.transaction("pending_checkins", "readonly");
            const store = tx.objectStore("pending_checkins");
            const getAllRequest = store.getAll();

            getAllRequest.onsuccess = async () => {
                const records = getAllRequest.result;
                if (records.length === 0) {
                    setIsSyncing(false);
                    return;
                }

                let suksesCount = 0;
                const gasUrl = "https://script.google.com/macros/s/AKfycbwtBgrsYjqda1azzjFTaZRPrjh5Unv1bleWjdnwua3lQrRfR_AIjTDmR-5NIGKrSEM/exec";

                // 🛠️ REVISI FORMAT NAMA FILE DI SINKRONISASI OFFLINE
                const namaClean = profile?.nama_pengguna ? profile.nama_pengguna.replace(/\s+/g, '_').toUpperCase() : 'PETUGAS';

                for (let record of records) {
                    try {
                        const tglClean = record.tanggal.replace(/-/g, '');
                        const namaFileUnik = `SE26_PPL_${record.idsubsls}_${namaClean}_${tglClean}.jpg`;

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
                                const deleteTx = db.transaction("pending_checkins", "readwrite");
                                deleteTx.objectStore("pending_checkins").delete(record.id);
                            }
                        }
                    } catch (loopErr) {
                        console.error("Gagal merestorasi baris antrean:", loopErr);
                    }
                }

                alert(`📡 Sinkronisasi Selesai! Berhasil merestorasi ${suksesCount} log absen ke server.`);
                await checkOfflineQueueCount();
                initPclPage();
            };
        } catch (err) {
            alert("Gagal total sinkronisasi: " + err.message);
        } finally {
            setIsSyncing(false);
        }
    };

    const renderCalendarCells = () => {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();

        const firstDayOfMonth = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        const cells = [];
        const startDayIndex = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;
        for (let i = 0; i < startDayIndex; i++) {
            cells.push(<div key={`empty-${i}`} className="h-10"></div>);
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const dString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isCheckedIn = historyDates.includes(dString) || (todayCheckIns.length > 0 && dString === getTodayDateString());

            cells.push(
                <div
                    key={`day-${day}`}
                    className={`h-10 w-10 mx-auto flex items-center justify-center rounded-xl text-xs font-black border transition-all ${isCheckedIn
                            ? 'bg-green-500 border-green-600 text-white shadow-sm shadow-green-500/20'
                            : 'bg-white border-slate-200 text-slate-700'
                        }`}
                >
                    {day}
                </div>
            );
        }
        return cells;
    };

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

                        {/* KELOMPOK TOMBOL NAVIGASI & KELUAR */}
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

                {/* BANNER REKAP DATA OFFLINE INTERNAL */}
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

                {/* DOT INDIKATOR POSISI SLIDER TAB */}
                <div className="flex justify-center gap-2 mt-4">
                    <button onClick={() => setActiveTab(0)} className={`h-2 transition-all rounded-full ${activeTab === 0 ? 'w-6 bg-orange-500' : 'w-2 bg-slate-300'}`}></button>
                    <button onClick={() => setActiveTab(1)} className={`h-2 transition-all rounded-full ${activeTab === 1 ? 'w-6 bg-orange-500' : 'w-2 bg-slate-300'}`}></button>
                </div>
            </div>

            {/* CONTAINER UTAMA SLIDER PANEL */}
            <div className="flex-1 flex w-[200%] transition-transform duration-300 ease-out overflow-hidden" style={{ transform: `translateX(-${activeTab * 50}%)` }}>

                {/* PANEL 1: ABSENSI UTAMA SPASIAL */}
                <div className="w-1/2 p-4 shrink-0 flex flex-col justify-start overflow-y-auto pb-12">
                    <div className="space-y-4">

                        {/* KARTU UTAMA KONTROL UTAMA ABSENSI */}
                        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm text-center space-y-5">
                            <div>
                                <h3 className="text-base font-black text-slate-800">Absensi Lapangan</h3>
                                <p className="text-xs text-slate-400 mt-1">Sistem mendukung absensi offline di daerah blankspot sinyal.</p>
                            </div>

                            {/* TOMBOL UTAMA BULAT BESAR */}
                            <div className="flex justify-center items-center py-2">
                                <button
                                    disabled={actionLoading}
                                    onClick={handleDetectLocation}
                                    className={`w-32 h-32 rounded-full flex flex-col justify-center items-center gap-2 font-black text-sm uppercase tracking-wider border-8 shadow-xl transition-all duration-300 active:scale-95 ${actionLoading
                                            ? 'bg-slate-100 border-slate-200 text-slate-400'
                                            : 'bg-orange-500 hover:bg-orange-600 border-orange-100 text-white shadow-orange-500/20'
                                        }`}
                                room-box="true">
                                    {actionLoading ? <RefreshCw className="animate-spin" size={28} /> : <Navigation className="fill-white" size={28} />}
                                    <span className="text-[11px]">{actionLoading ? "Mencari..." : "Check In"}</span>
                                </button>
                            </div>

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

                            {/* INTERACTION SLOT: KAMERA DAN FORM SUBMIT */}
                            {((detectedSls || selectedManualSls || manualMode) && !isOutsideBorderBlock) && (
                                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-left space-y-3 animate-fadeIn">
                                    <span className="text-[9px] font-black uppercase text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded">
                                        Langkah Akhir: Ambil Foto Lapangan
                                    </span>

                                    {photoBase64 ? (
                                        <div className="relative rounded-xl overflow-hidden border border-slate-300 shadow-inner">
                                            <img src={photoBase64} alt="Preview Bukti" className="w-full h-36 object-cover" />
                                            <label className="absolute bottom-2 right-2 bg-slate-900/80 text-white p-2 rounded-xl text-[10px] font-black cursor-pointer uppercase tracking-wider">
                                                <input type="file" accept="image/*" capture="user" className="hidden" onChange={handleCapturePhoto} />
                                                Ulangi Foto
                                            </label>
                                        </div>
                                    ) : (
                                        <label className="w-full h-24 border-2 border-dashed border-slate-300 hover:border-orange-400 rounded-xl flex flex-col justify-center items-center gap-1.5 cursor-pointer bg-white transition-all text-slate-400">
                                            <input type="file" accept="image/*" capture="user" className="hidden" onChange={handleCapturePhoto} />
                                            <Camera size={24} className="text-slate-400" />
                                            <span className="text-xs font-bold uppercase tracking-wider">Buka Kamera Depan</span>
                                        </label>
                                    )}

                                    {detectedSls && (
                                        <div className="pt-2">
                                            <h4 className="font-black text-slate-800 text-xs uppercase truncate">Target: {detectedSls.nmsls}</h4>
                                            <p className="text-[10px] text-slate-400 font-medium">Desa: {detectedSls.nmdesa}</p>
                                            <button
                                                disabled={!photoBase64 || actionLoading}
                                                onClick={() => submitCheckInData(detectedSls.idsubsls)}
                                                className="w-full mt-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider transition-all disabled:bg-slate-300"
                                            >
                                                Kirim Absen & Foto Bukti
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* FALLBACK MANUAL SELECTOR (JIKA GPS MATI) */}
                            {(manualMode && !isOutsideBorderBlock) && (
                                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-left">
                                    <div className="flex gap-2 items-center text-amber-800 font-bold text-xs uppercase mb-3">
                                        <ShieldAlert size={16} />
                                        <span>Pilih SLS Kerja Manual</span>
                                    </div>
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

                                    {selectedManualSls && (
                                        <div className="mt-3 space-y-2">
                                            <button
                                                disabled={!photoBase64 || actionLoading}
                                                onClick={() => submitCheckInData(selectedManualSls)}
                                                className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider transition-all disabled:bg-slate-300"
                                            >
                                                Kunci Wilayah & Simpan
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* HISTORI LOG ABSENSI SLS HARI INI */}
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

                {/* PANEL 2: KALENDER RIWAYAT HARIAN */}
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
                            {renderCalendarCells()}
                        </div>
                    </div>

                    <div className="mt-4 p-3 bg-white border border-slate-200 rounded-2xl flex items-center gap-3 text-xs">
                        <div className="h-5 w-5 bg-green-500 rounded-lg shadow-sm"></div>
                        <span className="font-bold text-slate-600">Hari Jalan Lapangan (Ada Log Absensi Lapangan)</span>
                    </div>
                </div>

            </div>

            {/* INTERAKTIF DIALOG POPUP: PERINGATAN SALAH WILAYAH TUGAS */}
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
                                onClick={() => {
                                    setShowValidationDialog(false);
                                    setPendingTargetId(null);
                                }}
                                className="flex-1 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider transition-all"
                            >
                                Batalkan
                            </button>
                            <button
                                onClick={async () => {
                                    if (pendingTargetId) {
                                        await eksekusiKirimBypass(pendingTargetId);
                                    }
                                }}
                                className="flex-1 bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-black py-2.5 rounded-xl text-xs uppercase tracking-wider transition-all shadow-md shadow-orange-500/10"
                            >
                                Tetap Lanjutkan
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}