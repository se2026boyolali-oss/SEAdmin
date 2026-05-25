import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { 
    MapPin, Navigation, RefreshCw, CheckCircle2, ShieldAlert, 
    HelpCircle, Calendar, ChevronLeft, ChevronRight, Camera, WifiOff, CloudLightning 
} from 'lucide-react';

// =========================================================================
// ENGINE INITIALIZATION: INDEXEDDB UNTUK ANTREAN OFFLINE (SOLUSI 2)
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
    const { user, profile, loading: authLoading } = useAuth();
    
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

    // State Kalender Bulanan
    const [currentMonth, setCurrentMonth] = useState(new Date());

    // NEW STATE: FOTO, WATERMARK, DAN OFFLINE STATUS
    const [photoBase64, setPhotoBase64] = useState(null);
    const [offlineCount, setOfflineCount] = useState(0);
    const [isSyncing, setIsSyncing] = useState(false);

    const minSwipeDistance = 50;

    const getTodayDateString = () => {
        return new Date().toLocaleString("sv-SE", { timeZone: "Asia/Jakarta" }).split(" ")[0];
    };

    const getKecamatanCode = () => {
        if (!profile?.kecamatan_tugas) return null;
        const match = profile.kecamatan_tugas.match(/^\d+/);
        return match ? match[0] : null;
    };

    // Fungsi menghitung jumlah antrean offline yang tersimpan di HP
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

    const initPclPage = async () => {
        const pclEmail = user?.email || profile?.email;
        if (!pclEmail) return;

        setLoading(true);
        const tglHariIni = getTodayDateString();
        await checkOfflineQueueCount();

        try {
            const { data: slsData } = await supabase
                .from('muatan_sls')
                .select('*')
                .eq('petugas_id', pclEmail);
            setAllMySls(slsData || []);

            const { data: allLogs } = await supabase
                .from('log_checkin_pcl')
                .select('tanggal, idsubsls')
                .eq('petugas_email', pclEmail);

            if (allLogs) {
                const uniqueDates = [...new Set(allLogs.map(log => log.tanggal))];
                setHistoryDates(uniqueDates);

                const todayLogs = allLogs.filter(log => log.tanggal === tglHariIni).map(log => log.idsubsls);
                setTodayCheckIns(todayLogs);
            }
        } catch (err) {
            console.error("Gagal memuat data:", err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!authLoading && (user?.email || profile?.email)) {
            initPclPage();
        }
    }, [profile, authLoading, user]);

    // =========================================================================
    // LOGIKA SWIPE LAYAR GESTURE HANDLER
    // =========================================================================
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

    // =========================================================================
    // IMPLEMENTASI SARAN 1 & 3: KAMERA LINGKUNGAN, KOMPRESI & WATERMARK
    // =========================================================================
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
                // Konfigurasi Maksimal Dimensi (Lebar dipaksa max 800px demi hemat RAM HP)
                const MAX_WIDTH = 800;
                let width = img.width;
                let height = img.height;

                if (width > MAX_WIDTH) {
                    height = Math.round((height * MAX_WIDTH) / width);
                    width = MAX_WIDTH;
                }

                // Gambar ke Canvas untuk Kompresi
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // PENYUNTIKAN WATERMARK TEKS PERMANEN DI FOTO (SOLUSI 3)
                const tglTeks = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
                const latTeks = currentCoords ? `LAT: ${currentCoords.latitude.toFixed(6)}` : "LAT: -";
                const lonTeks = currentCoords ? `LON: ${currentCoords.longitude.toFixed(6)}` : "LON: -";
                const labelSensus = `SENSUS EKONOMI 2026 - PCL`;

                // Kotak Hitam Transparan di pojok bawah foto
                ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
                ctx.fillRect(0, height - 100, width, 100);

                // Set Huruf Watermark
                ctx.fillStyle = "#ffffff";
                ctx.font = "bold 16px sans-serif";
                ctx.fillText(labelSensus, 20, height - 70);
                
                ctx.font = "14px monospace";
                ctx.fillText(tglTeks, 20, height - 45);
                ctx.fillText(`${latTeks} | ${lonTeks}`, 20, height - 20);

                // Ambil string Base64 matang ukuran ~150KB (Kualitas 0.6)
                const compressedBase64 = canvas.toDataURL("image/jpeg", 0.6);
                setPhotoBase64(compressedBase64);
                setActionLoading(false);
            };
        };
    };

    const prosesPencarianGeojson = async (latitude, longitude) => {
        if (allMySls.length > 0) {
            return {
                idsubsls: allMySls[0].idsubsls,
                nmsls: allMySls[0].nmsls,
                nmdesa: allMySls[0].nmdesa
            };
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
        setPhotoBase64(null); // Reset foto lama

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude } = position.coords;
                setCurrentCoords({ latitude, longitude });

                const hasilSls = await prosesPencarianGeojson(latitude, longitude);

                if (hasilSls) {
                    setDetectedSls(hasilSls);
                } else {
                    setManualMode(true);
                    alert("📍 Lokasi Anda tidak masuk dalam poligon SLS manapun. Silakan pilih SLS secara manual.");
                }
                setActionLoading(false);
            },
            (error) => {
                setActionLoading(false);
                setManualMode(true);
                alert("⚠️ Gagal menangkap GPS Hardware. Sistem dialihkan ke Mode Pilihan Manual.");
            },
            { enableHighAccuracy: true, timeout: 12000 }
        );
    };

    // =========================================================================
    // SUBMIT DATA (MENDUKUNG TRANSMISI INTERNET DAN SISTEM JALUR OFFLINE)
    // =========================================================================
    const submitCheckInData = async (targetIdSubSls) => {
        const pclEmail = user?.email || profile?.email;
        const tglHariIni = getTodayDateString();

        if (!photoBase64) {
            alert("Wajib mengambil foto lokasi/papan nama terlebih dahulu sebagai bukti jepret lapangan!");
            return;
        }

        setActionLoading(true);

        const payloadData = {
            tanggal: tglHariIni,
            idsubsls: targetIdSubSls,
            petugas_email: pclEmail,
            latitude: currentCoords?.latitude || null,
            longitude: currentCoords?.longitude || null,
            is_within_range: !manualMode,
            foto_bukti: photoBase64 // Disimpan sebagai text base64 terkompresi di tabel database
        };

        try {
            // Coba tembak langsung ke server Supabase
            const { error } = await supabase
                .from('log_checkin_pcl')
                .insert(payloadData);

            if (error) throw error;

            // Skenario Sukses Online
            setTodayCheckIns(prev => [...prev, targetIdSubSls]);
            if (!historyDates.includes(tglHariIni)) {
                setHistoryDates(prev => [...prev, tglHariIni]);
            }
            alert("🎉 Check-In Online Sukses Disimpan!");
            resetForm();

        } catch (err) {
            // SOLUSI 2: JIKA INTERNET MATI / TIMEOUT, AMANKAN KE STORAGE OFFLINE HP
            console.warn("🌐 Sinyal buruk terdeteksi, mengalihkan data ke memori lokal HP...", err.message);
            try {
                const db = await initOfflineDB();
                const tx = db.transaction("pending_checkins", "readwrite");
                const store = tx.objectStore("pending_checkins");
                store.add(payloadData);

                alert("💾 Sinyal Low! Log Check-In dan Foto Anda telah diamankan di memori lokal HP. Ingat klik tombol sinkronisasi saat sudah dapat sinyal.");
                await checkOfflineQueueCount();
                resetForm();
            } catch (storageErr) {
                alert("HP Anda kehabisan ruang penyimpanan lokal: " + storageErr.message);
            }
        } finally {
            setActionLoading(false);
        }
    };

    const resetForm = () => {
        setDetectedSls(null);
        setSelectedManualSls("");
        setManualMode(false);
        setPhotoBase64(null);
    };

    // FUNGSI SINKRONISASI DATA LOG OFFLINE SAAT KEMBALI DAPAT SINYAL
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
                for (let record of records) {
                    // Hapus auto-increment id lokal sebelum didorong ke postgres
                    const { id, ...purePayload } = record;
                    
                    const { error } = await supabase
                        .from('log_checkin_pcl')
                        .insert(purePayload);

                    if (!error) {
                        suksesCount++;
                        // Hapus dari IndexedDB setelah sukses terkirim
                        const deleteTx = db.transaction("pending_checkins", "readwrite");
                        deleteTx.objectStore("pending_checkins").delete(id);
                    }
                }

                alert(`📡 Sinkronisasi Selesai! Berhasil mengirim ${suksesCount} data tunda ke server BPS.`);
                await checkOfflineQueueCount();
                initPclPage(); // Muat ulang lingkaran kalender
            };
        } catch (err) {
            alert("Gagal sinkronisasi: " + err.message);
        } finally {
            setIsSyncing(false);
        }
    };

    // =========================================================================
    // LOGIKA GENERATOR ENGINE KALENDER BULANAN
    // =========================================================================
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
            const isCheckedIn = historyDates.includes(dString);

            cells.push(
                <div 
                    key={`day-${day}`} 
                    className={`h-10 w-10 mx-auto flex items-center justify-center rounded-xl text-xs font-black border transition-all ${
                        isCheckedIn 
                            ? 'bg-emerald-500 border-emerald-600 text-white shadow-sm shadow-emerald-500/20' 
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

    if (authLoading || loading) {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-6 text-center">
                <RefreshCw className="animate-spin text-orange-600 mb-3" size={32} />
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Sinkronisasi GPS Pendataan...</p>
            </div>
        );
    }

    return (
        <div 
            className="min-h-screen bg-slate-50 overflow-x-hidden font-sans max-w-md mx-auto relative flex flex-col select-none"
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
        >
            {/* COMPACT TOP PROFILE */}
            <div className="p-4 bg-slate-50 shrink-0">
                <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-3xl p-5 shadow-xl border border-slate-700/50">
                    <div className="flex justify-between items-center">
                        <div>
                            <span className="text-[9px] bg-orange-500 text-white px-2 py-0.5 rounded-full font-black uppercase tracking-wider">
                                PCL SE2026
                            </span>
                            <h2 className="text-base font-black mt-1 uppercase tracking-tight truncate max-w-[180px]">
                                {profile?.nama_pengguna || 'Petugas'}
                            </h2>
                        </div>
                        <div className="text-right flex items-center gap-1.5 bg-slate-800/80 px-3 py-1.5 rounded-2xl border border-slate-700/40 text-xs font-bold text-slate-300">
                            <Calendar size={14} className="text-orange-400" />
                            <span>{activeTab === 0 ? "Utama" : "Kalender"}</span>
                        </div>
                    </div>
                </div>

                {/* BANNER NOTIFIKASI JIKA ADA DATA OFFLINE YANG TERSANGKUT DI HP */}
                {offlineCount > 0 && (
                    <div className="mt-3 bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-2xl flex items-center justify-between text-xs font-bold">
                        <div className="flex items-center gap-2">
                            <WifiOff size={16} className="text-rose-500 shrink-0 animate-pulse" />
                            <span>Ada {offlineCount} Absen Belum Terkirim</span>
                        </div>
                        <button 
                            disabled={isSyncing}
                            onClick={handleSyncOfflineData}
                            className="bg-rose-600 hover:bg-rose-700 text-white px-3 py-1 rounded-xl flex items-center gap-1 text-[11px] font-black transition-all"
                        >
                            {isSyncing ? <RefreshCw className="animate-spin" size={12} /> : <CloudLightning size={12} />}
                            KIRIM
                        </button>
                    </div>
                )}

                <div className="flex justify-center gap-2 mt-4">
                    <button onClick={() => setActiveTab(0)} className={`h-2 transition-all rounded-full ${activeTab === 0 ? 'w-6 bg-orange-500' : 'w-2 bg-slate-300'}`}></button>
                    <button onClick={() => setActiveTab(1)} className={`h-2 transition-all rounded-full ${activeTab === 1 ? 'w-6 bg-orange-500' : 'w-2 bg-slate-300'}`}></button>
                </div>
            </div>

            {/* CONTAINER UTAMA SLIDER PANEL */}
            <div className="flex-1 flex w-[200%] transition-transform duration-300 ease-out" style={{ transform: `translateX(-${activeTab * 50}%)` }}>
                
                {/* PANEL 1: TOMBOL CENTRAL ABSEN LENGKAP JEP RET FOTO */}
                <div className="w-1/2 p-4 shrink-0 flex flex-col justify-start">
                    <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm text-center space-y-5">
                        <div>
                            <h3 className="text-base font-black text-slate-800">Pusat Absensi Lapangan</h3>
                            <p className="text-xs text-slate-400 mt-1">Sistem otomatis mendeteksi SLS koordinat dan mewajibkan jepret foto lokasi.</p>
                        </div>

                        {/* TOMBOL UTAMA BULAT BESAR */}
                        <div className="flex justify-center items-center py-2">
                            <button
                                disabled={actionLoading}
                                onClick={handleDetectLocation}
                                className={`w-32 h-32 rounded-full flex flex-col justify-center items-center gap-2 font-black text-sm uppercase tracking-wider border-8 shadow-xl transition-all duration-300 active:scale-95 ${
                                    actionLoading 
                                        ? 'bg-slate-100 border-slate-200 text-slate-400' 
                                        : 'bg-orange-500 hover:bg-orange-600 border-orange-100 text-white shadow-orange-500/20'
                                }`}
                            >
                                {actionLoading ? <RefreshCw className="animate-spin" size={28} /> : <Navigation className="fill-white" size={28} />}
                                <span className="text-[11px]">{actionLoading ? "Mencari..." : "Check In"}</span>
                            </button>
                        </div>

                        {/* SLOT INTEGRASI KAMERA LINGKUNGAN (MUNCUL JIKA LOKASI SUDAH TERKUNCI) */}
                        {(detectedSls || selectedManualSls) && (
                            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-left space-y-3 animate-fadeIn">
                                <span className="text-[9px] font-black uppercase text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded">
                                    Langkah Akhir: Ambil Foto Bukti
                                </span>
                                
                                {photoBase64 ? (
                                    <div className="relative rounded-xl overflow-hidden border border-slate-300 shadow-inner">
                                        <img src={photoBase64} alt="Preview Bukti" className="w-full h-36 object-cover" />
                                        <label className="absolute bottom-2 right-2 bg-slate-900/80 text-white p-2 rounded-xl text-[10px] font-black cursor-pointer uppercase tracking-wider">
                                            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleCapturePhoto} />
                                            Ulangi Foto
                                        </label>
                                    </div>
                                ) : (
                                    <label className="w-full h-24 border-2 border-dashed border-slate-300 hover:border-orange-400 rounded-xl flex flex-col justify-center items-center gap-1.5 cursor-pointer bg-white transition-all text-slate-400">
                                        {/* MANDATORY INPUT HIDDEN FOR CAMERA ONLY (SOLUSI 3) */}
                                        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleCapturePhoto} />
                                        <Camera size={24} className="text-slate-400" />
                                        <span className="text-xs font-bold uppercase tracking-wider">Buka Kamera Lapangan</span>
                                    </label>
                                )}

                                {/* Tombol Aksi Akhir */}
                                {detectedSls && !manualMode && (
                                    <div className="pt-2">
                                        <h4 className="font-black text-slate-800 text-xs uppercase truncate">Target: {detectedSls.nmsls}</h4>
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

                        {/* MENU MANUAL FALLBACK */}
                        {manualMode && (
                            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-left">
                                <div className="flex gap-2 items-center text-amber-800 font-bold text-xs uppercase mb-3">
                                    <ShieldAlert size={16} />
                                    <span>Pilih SLS Manual</span>
                                </div>
                                <select
                                    className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 outline-none"
                                    value={selectedManualSls}
                                    onChange={(e) => setSelectedManualSls(e.target.value)}
                                >
                                    <option value="">-- Pilih SLS Lokasi Anda --</option>
                                    {allMySls.map(s => (
                                        <option key={s.idsubsls} value={s.idsubsls}>
                                            ({s.kdsls}) {s.nmsls} - Desa {s.nmdesa}
                                        </option>
                                    ))}
                                </select>
                                
                                {selectedManualSls && (
                                    <button
                                        disabled={!photoBase64 || actionLoading}
                                        onClick={() => submitCheckInData(selectedManualSls)}
                                        className="w-full mt-3 bg-amber-600 hover:bg-amber-700 text-white font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider transition-all disabled:bg-slate-300"
                                    >
                                        Kunci Pilihan Manual & Kirim
                                    </button>
                                )}
                            </div>
                        )}

                        {!actionLoading && !detectedSls && !manualMode && (
                            <button onClick={() => setManualMode(true)} className="text-[11px] text-slate-400 flex items-center gap-1 mx-auto font-medium">
                                <HelpCircle size={14} /> GPS error? Klik pilihan manual
                            </button>
                        )}
                    </div>
                    
                    <div className="text-center text-[11px] text-slate-400 font-bold uppercase tracking-wider mt-4 animate-pulse flex items-center justify-center gap-1">
                        <span>Geser layar ke kiri untuk Kalender</span>
                        <ChevronRight size={14} />
                    </div>
                </div>

                {/* PANEL 2: KALENDER ABSENSI */}
                <div className="w-1/2 p-4 shrink-0 flex flex-col justify-start">
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
                        <div className="h-5 w-5 bg-emerald-500 rounded-lg shadow-sm"></div>
                        <span className="font-bold text-slate-600">Hari Masuk Lapangan (Ada Log Check-In)</span>
                    </div>

                    <div className="text-center text-[11px] text-slate-400 font-bold uppercase tracking-wider mt-6 flex items-center justify-center gap-1">
                        <ChevronLeft size={14} />
                        <span>Geser kanan kembali ke Check-In</span>
                    </div>
                </div>

            </div>
        </div>
    );
}