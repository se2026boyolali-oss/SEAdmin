import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { MapPin, Navigation, RefreshCw, CheckCircle2, ShieldAlert, HelpCircle, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

export default function PclAssignmentPage() {
    const { user, profile, loading: authLoading } = useAuth();
    
    // State Navigasi Slider (0: Halaman Utama, 1: Halaman Kalender)
    const [activeTab, setActiveTab] = useState(0);
    const [touchStart, setTouchStart] = useState(null);
    const [touchEnd, setTouchEnd] = useState(null);

    // State Data & Loading
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [allMySls, setAllMySls] = useState([]);
    const [todayCheckIns, setTodayCheckIns] = useState([]);
    
    // State Riwayat Log Unik (Format: ['2026-05-01', '2026-05-21']) untuk Hijau Kalender
    const [historyDates, setHistoryDates] = useState([]);

    // State Hasil Deteksi Posisi GPS
    const [detectedSls, setDetectedSls] = useState(null); 
    const [currentCoords, setCurrentCoords] = useState(null);
    const [manualMode, setManualMode] = useState(false);
    const [selectedManualSls, setSelectedManualSls] = useState("");

    // State Kalender Bulanan
    const [currentMonth, setCurrentMonth] = useState(new Date());

    // Batas minimum jarak geser dalam pixel untuk mendeteksi SWIPE
    const minSwipeDistance = 50;

    const getTodayDateString = () => {
        return new Date().toLocaleString("sv-SE", { timeZone: "Asia/Jakarta" }).split(" ")[0];
    };

    const getKecamatanCode = () => {
        if (!profile?.kecamatan_tugas) return null;
        const match = profile.kecamatan_tugas.match(/^\d+/);
        return match ? match[0] : null;
    };

    const initPclPage = async () => {
        const pclEmail = user?.email || profile?.email;
        if (!pclEmail) return;

        setLoading(true);
        const tglHariIni = getTodayDateString();

        try {
            // 1. Ambil semua beban SLS milik PCL
            const { data: slsData } = await supabase
                .from('muatan_sls')
                .select('*')
                .eq('petugas_id', pclEmail);
            setAllMySls(slsData || []);

            // 2. Ambil SEMUA riwayat tanggal check-in PCL ini untuk menyalakan Hijau Kalender
            const { data: allLogs } = await supabase
                .from('log_checkin_pcl')
                .select('tanggal, idsubsls')
                .eq('petugas_email', pclEmail);

            if (allLogs) {
                // Saring agar hanya menyimpan tanggal unik saja
                const uniqueDates = [...new Set(allLogs.map(log => log.tanggal))];
                setHistoryDates(uniqueDates);

                // Filter yang khusus hari ini untuk Tombol Utama
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
            setActiveTab(1); // Geser kiri -> buka kalender
        } else if (isRightSwipe && activeTab === 1) {
            setActiveTab(0); // Geser kanan -> kembali ke home
        }
    };

    // =========================================================================
    // KERANGKA SIMULASI GEOJSON
    // =========================================================================
    const prosesPencarianGeojson = async (latitude, longitude) => {
        const kodeKec = getKecamatanCode();
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

    const submitCheckInData = async (targetIdSubSls) => {
        const pclEmail = user?.email || profile?.email;
        const tglHariIni = getTodayDateString();

        if (todayCheckIns.includes(targetIdSubSls)) {
            alert("Wilayah SLS ini sudah Anda check-in hari ini!");
            return;
        }

        setActionLoading(true);
        try {
            const { error } = await supabase
                .from('log_checkin_pcl')
                .insert({
                    tanggal: tglHariIni,
                    idsubsls: targetIdSubSls,
                    petugas_email: pclEmail,
                    latitude: currentCoords?.latitude || null,
                    longitude: currentCoords?.longitude || null,
                    is_within_range: !manualMode
                });

            if (error) throw error;

            setTodayCheckIns(prev => [...prev, targetIdSubSls]);
            if (!historyDates.includes(tglHariIni)) {
                setHistoryDates(prev => [...prev, tglHariIni]); // Auto ijokan kalender hari ini
            }

            alert("🎉 Check-In Sukses Disimpan!");
            setDetectedSls(null);
            setSelectedManualSls("");
            setManualMode(false);

        } catch (err) {
            alert("Gagal kirim log: " + err.message);
        } finally {
            setActionLoading(false);
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
        // Isi ruang kosong untuk hari di bulan sebelumnya
        const startDayIndex = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1; // Sesuai baris Senin-Minggu
        for (let i = 0; i < startDayIndex; i++) {
            cells.push(<div key={`empty-${i}`} className="h-10"></div>);
        }

        // Loop isi tanggal bulan ini
        for (let day = 1; day <= daysInMonth; day++) {
            // Rakit string YYYY-MM-DD lokal
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
            {/* KARTU PROFIL UTAMA (TETAP DI ATAS FIXED) */}
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

                {/* PENANDA TITIK DOTS CAROUSEL (○ •) */}
                <div className="flex justify-center gap-2 mt-4">
                    <button onClick={() => setActiveTab(0)} className={`h-2 transition-all rounded-full ${activeTab === 0 ? 'w-6 bg-orange-500' : 'w-2 bg-slate-300'}`}></button>
                    <button onClick={() => setActiveTab(1)} className={`h-2 transition-all rounded-full ${activeTab === 1 ? 'w-6 bg-orange-500' : 'w-2 bg-slate-300'}`}></button>
                </div>
            </div>

            {/* CONTAINER CONTAINER UTAMA CAROUSEL SLIDE */}
            <div className="flex-1 flex w-[200%] transition-transform duration-300 ease-out" style={{ transform: `translateX(-${activeTab * 50}%)` }}>
                
                {/* PANEL 1: TOMBOL SENTRAL CHECK-IN (SISI KIRI) */}
                <div className="w-1/2 p-4 shrink-0 flex flex-col justify-start">
                    <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm text-center space-y-6">
                        <div>
                            <h3 className="text-base font-black text-slate-800">Pusat Absensi Lapangan</h3>
                            <p className="text-xs text-slate-400 mt-1">Cukup tekan tombol di bawah saat Anda sudah sampai di lokasi SLS target cacah.</p>
                        </div>

                        {/* TOMBOL UTAMA BULAT BESAR */}
                        <div className="flex justify-center items-center py-4">
                            <button
                                disabled={actionLoading}
                                onClick={handleDetectLocation}
                                className={`w-36 h-36 rounded-full flex flex-col justify-center items-center gap-2 font-black text-sm uppercase tracking-wider border-8 shadow-xl transition-all duration-300 active:scale-95 ${
                                    actionLoading 
                                        ? 'bg-slate-100 border-slate-200 text-slate-400' 
                                        : 'bg-orange-500 hover:bg-orange-600 border-orange-100 text-white shadow-orange-500/20'
                                }`}
                            >
                                {actionLoading ? (
                                    <RefreshCw className="animate-spin" size={32} />
                                ) : (
                                    <Navigation className="fill-white" size={32} />
                                )}
                                <span className="text-xs">{actionLoading ? "Mencari..." : "Check In"}</span>
                            </button>
                        </div>

                        {/* HASIL DETEKSI GPS AUTOMATIC */}
                        {detectedSls && !manualMode && (
                            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-left">
                                <div className="flex items-start gap-3">
                                    <CheckCircle2 className="text-emerald-600 shrink-0 mt-0.5" size={18} />
                                    <div className="flex-1 min-w-0">
                                        <span className="text-[9px] font-black uppercase text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded">Lokasi Terdeteksi</span>
                                        <h4 className="font-black text-slate-800 text-sm mt-1 uppercase truncate">{detectedSls.nmsls}</h4>
                                        <p className="text-[11px] font-bold text-slate-500 uppercase">Desa {detectedSls.nmdesa}</p>
                                        <button
                                            onClick={() => submitCheckInData(detectedSls.idsubsls)}
                                            className="w-full mt-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 rounded-xl text-xs uppercase tracking-wider shadow-md transition-all"
                                        >
                                            Ya, Simpan Check-In
                                        </button>
                                    </div>
                                </div>
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
                                <button
                                    disabled={!selectedManualSls}
                                    onClick={() => submitCheckInData(selectedManualSls)}
                                    className="w-full mt-3 bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 rounded-xl text-xs uppercase tracking-wider transition-all disabled:bg-slate-300"
                                >
                                    Kunci Pilihan Manual
                                </button>
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

                {/* PANEL 2: KALENDER ABSENSI PROGRES HIJAU (SISI KANAN) */}
                <div className="w-1/2 p-4 shrink-0 flex flex-col justify-start">
                    <div className="bg-white rounded-3xl border border-slate-200 p-4 shadow-sm">
                        
                        {/* HEADER INTERNAL KALENDER (NAVIGASI BULAN) */}
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

                        {/* GRID HARI: SENIN s.d MINGGU */}
                        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-black text-slate-400 uppercase tracking-tight mb-2">
                            <div>Sen</div><div>Sel</div><div>Rab</div><div>Kam</div><div>Jum</div><div>Sab</div><div>Min</div>
                        </div>

                        {/* DYNAMIC PETAK TANGGAL */}
                        <div className="grid grid-cols-7 gap-y-2 gap-x-1 text-center">
                            {renderCalendarCells()}
                        </div>
                    </div>

                    {/* KETERANGAN WARNA KALENDER */}
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