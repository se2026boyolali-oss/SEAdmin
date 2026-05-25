import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { 
    Users, MapPin, AlertTriangle, CheckCircle2, 
    Save, RefreshCw, Phone, Search, ChevronDown, ChevronUp, Navigation, Camera, WifiOff
} from 'lucide-react';

export default function PmlMonitoringPage() {
    const { user, profile, loading: authLoading } = useAuth();
    
    const [loading, setLoading] = useState(true);
    const [pcls, setPcls] = useState([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [actionLoading, setActionLoading] = useState(null);
    const [pmlCheckingIn, setPmlCheckingIn] = useState(false);
    const [pmlCheckedInToday, setPmlCheckedInToday] = useState(false);
    
    // NEW STATE: Kontrol Foto Mandiri PML & Koordinat GPS PML
    const [pmlPhotoBase64, setPmlPhotoBase64] = useState(null);
    const [pmlCoords, setPmlCoords] = useState(null);
    const [showPmlCameraCard, setShowPmlCameraCard] = useState(false);

    // State untuk kontrol akordeon list PCL 
    const [expandedPcl, setExpandedPcl] = useState(null);
    const [realisasiInputs, setRealisasiInputs] = useState({});

    const getTodayDateString = () => {
        return new Date().toLocaleString("sv-SE", { timeZone: "Asia/Jakarta" }).split(" ")[0];
    };

    const fetchPmlData = async () => {
        const pmlEmail = user?.email || profile?.email;
        if (!pmlEmail) return;

        setLoading(true);
        const tglHariIni = getTodayDateString();
        const cleanPmlEmail = pmlEmail.toLowerCase().trim();

        // =========================================================================
        // SKENARIO 1: APABILA SUPERVISOR SEDANG OFFLINE TOTAL (LURING)
        // =========================================================================
        if (!navigator.onLine) {
            console.warn("⚠️ Mode Luring PML: Mengambil status pengawasan dari cache lokal HP.");
            
            // Ambil status absen mandiri PML hari ini
            const pmlCheckInStatus = localStorage.getItem(`cache_pml_checkedin_${cleanPmlEmail}_${tglHariIni}`);
            setPmlCheckedInToday(pmlCheckInStatus === 'true');

            // Ambil daftar rekap PCL binaan terakhir
            const cachedPclList = localStorage.getItem(`cache_pml_monitoring_list_${cleanPmlEmail}`);
            if (cachedPclList) {
                setPcls(JSON.parse(cachedPclList));
            }
            setLoading(false);
            return;
        }

        // =========================================================================
        // SKENARIO 2: KONDISI SINYAL NORMAL (DARING)
        // =========================================================================
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

            // 2. Ambil daftar PCL dari tabel petugas
            const { data: petugasData, error: petugasError } = await supabase
                .from('petugas')
                .select('email, nama_petugas, kecamatan_tugas, posisi_tugas, id_pml_atasan')
                .eq('posisi_tugas', 'PCL')
                .eq('id_pml_atasan', cleanPmlEmail)
                .eq('status', 'Diterima');

            if (petugasError) throw petugasError;

            // 3. Ambil log check-in PCL
            const { data: allLogs } = await supabase
                .from('log_checkin_pcl')
                .select('petugas_email, tanggal, idsubsls')
                .order('tanggal', { ascending: false });

            // 4. Ambil log inputan harian realisasi
            const { data: pmlLogs } = await supabase
                .from('log_harian_pml')
                .select('pcl_email, estimasi_muatan_hari_ini')
                .eq('tanggal', tglHariIni);

            // 5. Kompilasi data gabungan
            const combinedData = (petugasData || []).map(pcl => {
                const logsPcl = (allLogs || []).filter(l => l.petugas_email === pcl.email);
                const checkInHariIni = logsPcl.find(l => l.tanggal === tglHariIni);
                const pmlLogHariIni = pmlLogs?.find(l => l.pcl_email === pcl.email);

                let hariTanpaKabar = 0;
                if (!checkInHariIni) {
                    if (logsPcl && logsPcl.length > 0 && logsPcl[0]?.tanggal) {
                        const tglTerakhir = new Date(logsPcl[0].tanggal);
                        const tglSkrg = new Date(tglHariIni);
                        const diffTime = Math.abs(tglSkrg - tglTerakhir);
                        hariTanpaKabar = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    } else {
                        hariTanpaKabar = 99; 
                    }
                }

                return {
                    email: pcl.email,
                    nama_pengguna: pcl.nama_petugas || 'Tanpa Nama', 
                    kecamatan_tugas: pcl.kecamatan_tugas,
                    statusHariIni: checkInHariIni ? 'AKTIF' : 'ABSEN',
                    lastSls: checkInHariIni?.idsubsls || logsPcl[0]?.idsubsls || 'Belum Masuk SLS',
                    absenDays: hariTanpaKabar,
                    sudahInputPml: !!pmlLogHariIni,
                    nilaiRealisasi: pmlLogHariIni?.estimasi_muatan_hari_ini || 0
                };
            });

            setPcls(combinedData);
            // Simpan backup daftar monitoring ke LocalStorage perangkat
            localStorage.setItem(`cache_pml_monitoring_list_${cleanPmlEmail}`, JSON.stringify(combinedData));
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!authLoading) fetchPmlData();
    }, [profile, authLoading]);

    // =========================================================================
    // MESIN PENANGKAP KAMERA & KOMPRESI KAMERA BERSAMA WATERMARK UNTUK PML
    // =========================================================================
    const handlePmlCapturePhoto = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setPmlCheckingIn(true);
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
                const latTeks = pmlCoords ? `LAT: ${pmlCoords.latitude.toFixed(6)}` : "LAT: LAPANGAN";
                const lonTeks = pmlCoords ? `LON: ${pmlCoords.longitude.toFixed(6)}` : "LON: LAPANGAN";
                const labelSensus = `SUPERVISI SE2026 BOYOLALI - PML`;

                ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
                ctx.fillRect(0, height - 100, width, 100);

                ctx.fillStyle = "#ffffff";
                ctx.font = "bold 16px sans-serif";
                ctx.fillText(labelSensus, 20, height - 70);
                
                ctx.font = "14px monospace";
                ctx.fillText(tglTeks, 20, height - 45);
                ctx.fillText(`${latTeks} | ${lonTeks}`, 20, height - 20);

                const compressedBase64 = canvas.toDataURL("image/jpeg", 0.6);
                setPmlPhotoBase64(compressedBase64);
                setPmlCheckingIn(false);
            };
        };
    };

    // INISIASI GPS SEBELUM BUKA KAMERA
    const handleTriggerPmlLocation = () => {
        if (!navigator.geolocation) {
            alert("HP Anda memblokir fitur lokasi.");
            return;
        }

        setPmlCheckingIn(true);
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                setPmlCoords({ latitude, longitude });
                setShowPmlCameraCard(true); // Buka form kamera
                setPmlCheckingIn(false);
            },
            () => {
                setShowPmlCameraCard(true); // Tetap izinkan buka kamera walaupun GPS lemah
                setPmlCheckingIn(false);
            },
            { enableHighAccuracy: true, timeout: 8000 }
        );
    };

    // PROSES SUBMIT ABSEN PML KE GOOGLE DRIVE & SUPABASE
    const submitPmlCheckIn = async () => {
        const pmlEmail = user?.email || profile?.email;
        const tglHariIni = getTodayDateString();

        if (!pmlPhotoBase64) {
            alert("Wajib mengambil foto bukti pengawasan lapangan!");
            return;
        }

        setPmlCheckingIn(true);
        const namaFileUnik = `PML_SE26_${pmlEmail.split('@')[0]}_${tglHariIni}.jpg`;
        let finalFotoUrl = "OFFLINE_LINK";

        // Skenario jika sedang offline total, simpan status lokal saja dulu
        if (!navigator.onLine) {
            localStorage.setItem(`cache_pml_checkedin_${pmlEmail.toLowerCase().trim()}_${tglHariIni}`, 'true');
            setPmlCheckedInToday(true);
            alert("💾 Absen Pendampingan PML disimpan offline di memori HP!");
            setShowPmlCameraCard(false);
            setPmlCheckingIn(false);
            return;
        }

        try {
            // Tembak berkas foto ke Google Drive
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

            // Masukkan teks link ke tabel Supabase log_checkin_pml
            const { error } = await supabase
                .from('log_checkin_pml')
                .insert({
                    tanggal: tglHariIni,
                    pml_email: pmlEmail.toLowerCase().trim(),
                    idsubsls: pcls[0]?.lastSls || 'WILAYAH-PML',
                    latitude: pmlCoords?.latitude || null,
                    longitude: pmlCoords?.longitude || null,
                    foto_bukti: finalFotoUrl
                });

            if (error) throw error;

            setPmlCheckedInToday(true);
            localStorage.setItem(`cache_pml_checkedin_${pmlEmail.toLowerCase().trim()}_${tglHariIni}`, 'true');
            alert("🎉 Check-In Pendampingan Lapangan Berhasil Tersimpan!");
            setShowPmlCameraCard(false);
        } catch (err) {
            alert("Gagal mengirim data online, absen disimpan lokal di HP: " + err.message);
            localStorage.setItem(`cache_pml_checkedin_${pmlEmail.toLowerCase().trim()}_${tglHariIni}`, 'true');
            setPmlCheckedInToday(true);
        } finally {
            setPmlCheckingIn(false);
        }
    };

    // FUNGSI SIMPAN REALISASI MUATAN PCL BY PML
    const handleSaveRealisasi = async (pclEmail, idsubsls) => {
        const jumlah = realisasiInputs[pclEmail];
        if (!jumlah || jumlah < 0) {
            alert("Masukkan jumlah muatan yang valid.");
            return;
        }

        setActionLoading(pclEmail);

        if (!navigator.onLine) {
            alert("⚠️ Mode Luring Aktif: Input realisasi muatan membutuhkan koneksi internet untuk sinkronisasi target SLS.");
            setActionLoading(null);
            return;
        }

        try {
            const { error } = await supabase
                .from('log_harian_pml')
                .insert({
                    tanggal: getTodayDateString(),
                    pml_email: user.email,
                    pcl_email: pclEmail,
                    idsubsls: idsubsls,
                    status_lapangan: 'Aktif Mencacah',
                    estimasi_muatan_hari_ini: parseInt(jumlah)
                });

            if (error) throw error;
            alert("✅ Realisasi muatan berhasil disimpan.");
            fetchPmlData();
        } catch (err) {
            alert("Gagal menyimpan data: " + err.message);
        } finally {
            setActionLoading(null);
        }
    };

    const toggleAccordion = (email) => {
        setExpandedPcl(expandedPcl === email ? null : email);
    };

    const filteredPcls = pcls.filter(p => 
        p.nama_pengguna.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (authLoading || loading) {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-6 text-center">
                <RefreshCw className="animate-spin text-indigo-600 mb-3" size={32} />
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Memuat Dashboard Pengawasan...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 pb-20 px-4 pt-4 max-w-md mx-auto font-sans">
            
            {/* BOX PROFIL DENGAN STICKY COMPACT BANNER PML */}
            <div className="bg-slate-900 text-white rounded-3xl p-5 shadow-xl border border-slate-800 mb-6">
                <div className="flex justify-between items-start">
                    <div>
                        <span className="text-[9px] bg-indigo-600 text-white px-2 py-0.5 rounded-full font-black uppercase tracking-wider">
                            Supervisor (PML) {!navigator.onLine && "- LURING"}
                        </span>
                        <h2 className="text-base font-black mt-1 uppercase tracking-tight truncate max-w-[200px]">
                            {profile?.nama_pengguna}
                        </h2>
                        <p className="text-[10px] text-slate-400 font-medium mt-0.5 truncate max-w-[200px]">
                            Kecamatan: <span className="text-indigo-400">{profile?.kecamatan_tugas}</span>
                        </p>
                    </div>
                    <button 
                        disabled={!navigator.onLine}
                        onClick={fetchPmlData} 
                        className="p-2 bg-slate-800 rounded-xl text-slate-400 active:scale-95 transition-all disabled:opacity-30"
                    >
                        <RefreshCw size={16} />
                    </button>
                </div>
                
                {/* INLINE PML STICKY CHECK-IN BUTTON DENGAN SELEKTOR FOTO */}
                <div className="mt-4 pt-4 border-t border-slate-800/60 space-y-3">
                    {pmlCheckedInToday ? (
                        <div className="w-full bg-emerald-600/10 text-emerald-400 border border-emerald-500/20 rounded-2xl py-2.5 px-4 flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wide">
                            <CheckCircle2 size={14} className="text-emerald-400" />
                            Anda Sudah Check-In Supervisi Hari Ini
                        </div>
                    ) : (
                        <>
                            {!showPmlCameraCard ? (
                                <button
                                    disabled={pmlCheckingIn}
                                    onClick={handleTriggerPmlLocation}
                                    className="w-full bg-orange-500 hover:bg-orange-600 text-white rounded-2xl py-3 px-4 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20 active:scale-[0.98] transition-all"
                                >
                                    {pmlCheckingIn ? (
                                        <>
                                            <RefreshCw className="animate-spin" size={14} />
                                            Membaca Satelit GPS...
                                        </>
                                    ) : (
                                        <>
                                            <Navigation size={14} className="fill-white" />
                                            Mulai Check-In Pendampingan PML
                                        </>
                                    )}
                                </button>
                            ) : (
                                <div className="bg-slate-800 border border-slate-700 p-3 rounded-2xl space-y-3">
                                    <span className="text-[9px] font-black uppercase text-slate-400 bg-slate-700 px-1.5 py-0.5 rounded block text-center">
                                        Bukti Foto Lapangan Pengawas
                                    </span>

                                    {pmlPhotoBase64 ? (
                                        <div className="relative rounded-xl overflow-hidden border border-slate-600">
                                            <img src={pmlPhotoBase64} alt="PML Bukti" className="w-full h-32 object-cover" />
                                            <label className="absolute bottom-2 right-2 bg-slate-900/90 text-white p-2 rounded-xl text-[9px] font-black cursor-pointer uppercase">
                                                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePmlCapturePhoto} />
                                                Ulangi Foto
                                            </label>
                                        </div>
                                    ) : (
                                        <label className="w-full h-20 border-2 border-dashed border-slate-600 hover:border-orange-500 rounded-xl flex flex-col justify-center items-center gap-1 cursor-pointer bg-slate-900 text-slate-400">
                                            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePmlCapturePhoto} />
                                            <Camera size={20} />
                                            <span className="text-[10px] font-bold uppercase">Ambil Kamera Supervisi</span>
                                        </label>
                                    )}

                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => setShowPmlCameraCard(false)} 
                                            className="flex-1 bg-slate-700 text-slate-300 font-bold py-2 rounded-xl text-xs uppercase"
                                        >
                                            Batal
                                        </button>
                                        <button 
                                            disabled={!pmlPhotoBase64 || pmlCheckingIn}
                                            onClick={submitPmlCheckIn}
                                            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-2 rounded-xl text-xs uppercase disabled:bg-slate-700 disabled:text-slate-500"
                                        >
                                            Kunci Absen PML
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* SEARCH BAR MINI */}
            <div className="relative mb-5">
                <Search className="absolute left-4 top-3 text-slate-400" size={16} />
                <input 
                    type="text" 
                    placeholder="Cari nama PCL..."
                    className="w-full bg-white border border-slate-200 rounded-2xl py-2.5 pl-11 pr-4 text-xs font-semibold text-slate-700 outline-none"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            {/* DAFTAR AKORDEON PCL (SUPER KOMPAK & PENDEK) */}
            <div className="space-y-2.5">
                <div className="flex justify-between items-center px-1">
                    <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                        Petugas Pengawasan ({filteredPcls.length})
                    </h3>
                    <div className="flex gap-3 text-[10px] font-bold text-slate-400">
                        <span className="text-emerald-500">● {pcls.filter(p=>p.statusHariIni==='AKTIF').length} Aktif</span>
                        <span className="text-rose-500">● {pcls.filter(p=>p.statusHariIni==='ABSEN').length} Absen</span>
                    </div>
                </div>

                {filteredPcls.map((pcl) => {
                    const isExpanded = expandedPcl === pcl.email;
                    
                    return (
                        <div key={pcl.email} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm transition-all">
                            {/* Baris Utama Tipis (Header Akordeon) */}
                            <div 
                                onClick={() => toggleAccordion(pcl.email)}
                                className="p-3.5 flex items-center justify-between cursor-pointer active:bg-slate-50/80"
                            >
                                <div className="min-w-0 flex-1 pr-2">
                                    <h4 className="font-black text-slate-800 text-xs uppercase truncate">{pcl.nama_pengguna}</h4>
                                    <p className="text-[9px] text-slate-400 font-mono truncate mt-0.5">{pcl.email}</p>
                                </div>
                                
                                <div className="flex items-center gap-2.5 shrink-0">
                                    {pcl.statusHariIni === 'AKTIF' ? (
                                        <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 uppercase">
                                            Aktif
                                        </span>
                                    ) : (
                                        <span className="text-[9px] font-black text-rose-500 bg-rose-50 px-2 py-0.5 rounded border border-rose-100 uppercase">
                                            {pcl.absenDays === 99 ? "Macet" : `${pcl.absenDays}H`}
                                        </span>
                                    )}
                                    {isExpanded ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                                </div>
                            </div>

                            {/* Konten Konten yang Tersembunyi (Akan Terbuka Saat Diklik) */}
                            {isExpanded && (
                                <div className="bg-slate-50/60 border-t border-slate-100 p-3.5 space-y-3">
                                    {/* Informasi Wilayah */}
                                    <div className="grid grid-cols-2 gap-2 text-[11px] bg-white p-2.5 rounded-xl border border-slate-100">
                                        <div>
                                            <span className="text-[9px] block font-bold text-slate-400 uppercase">Posisi SLS Terakhir</span>
                                            <span className="font-black text-slate-700 truncate block">{pcl.lastSls}</span>
                                        </div>
                                        <div>
                                            <span className="text-[9px] block font-bold text-slate-400 uppercase">Status Lapangan</span>
                                            <span className={`font-black ${pcl.statusHariIni === 'AKTIF' ? 'text-emerald-600' : 'text-rose-500'}`}>
                                                {pcl.statusHariIni === 'AKTIF' ? '✓ Sudah Check-In' : '⚠️ Belum Turun'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Menu Aksi Kondisinal */}
                                    {pcl.statusHariIni === 'AKTIF' ? (
                                        <div className="space-y-2">
                                            <span className="text-[9px] block font-black text-slate-400 uppercase tracking-wider">Verifikasi Muatan Hari Ini</span>
                                            {pcl.sudahInputPml ? (
                                                <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-2 flex items-center justify-between text-xs font-bold text-indigo-700">
                                                    <span>Tercatat Masuk:</span>
                                                    <span className="bg-indigo-600 text-white px-2.5 py-0.5 rounded-md font-black">{pcl.nilaiRealisasi} Usaha</span>
                                                </div>
                                            ) : (
                                                <div className="flex gap-2">
                                                    <input 
                                                        type="number"
                                                        placeholder="Jumlah Usaha Riil..."
                                                        className="flex-1 bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 outline-none"
                                                        value={realisasiInputs[pcl.email] || ""}
                                                        onChange={(e) => setRealisasiInputs({...realisasiInputs, [pcl.email]: e.target.value})}
                                                    />
                                                    <button 
                                                        onClick={() => handleSaveRealisasi(pcl.email, pcl.lastSls)}
                                                        disabled={actionLoading === pcl.email}
                                                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 rounded-xl flex items-center justify-center transition-all disabled:bg-slate-300"
                                                    >
                                                        {actionLoading === pcl.email ? <RefreshCw className="animate-spin" size={14} /> : <Save size={14} />}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <a 
                                            href={`tel:#`}
                                            className="w-full bg-white border border-slate-200 text-slate-600 font-bold py-2 px-4 rounded-xl text-xs uppercase flex items-center justify-center gap-2 tracking-wide shadow-sm"
                                        >
                                            <Phone size={12} className="text-rose-500" />
                                            <span>Hubungi & Tegur Petugas</span>
                                        </a>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}