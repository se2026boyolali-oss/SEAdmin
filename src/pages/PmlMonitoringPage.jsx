import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { 
    Users, MapPin, AlertTriangle, CheckCircle2, 
    Save, RefreshCw, Phone, Search, ChevronDown, ChevronUp, Navigation
} from 'lucide-react';

export default function PmlMonitoringPage() {
    const { user, profile, loading: authLoading } = useAuth();
    
    const [loading, setLoading] = useState(true);
    const [pcls, setPcls] = useState([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [actionLoading, setActionLoading] = useState(null);
    const [pmlCheckingIn, setPmlCheckingIn] = useState(false);
    const [pmlCheckedInToday, setPmlCheckedInToday] = useState(false);
    
    // State untuk kontrol akordeon list PCL (menyimpan email PCL yang sedang dibuka)
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

        try {
            // 1. Cek apakah PML sendiri sudah check-in hari ini
            const { data: pmlCheckInLog } = await supabase
                .from('log_checkin_pml')
                .select('id')
                .eq('pml_email', pmlEmail.toLowerCase().trim())
                .eq('tanggal', tglHariIni);
            
            setPmlCheckedInToday(pmlCheckInLog && pmlCheckInLog.length > 0);

            // 2. Ambil daftar PCL binaan dari tabel petugas
            const { data: petugasData, error: petugasError } = await supabase
                .from('petugas')
                .select('email, nama_petugas, kecamatan_tugas, posisi_tugas, id_pml_atasan')
                .eq('posisi_tugas', 'PCL')
                .eq('id_pml_atasan', pmlEmail.toLowerCase().trim())
                .eq('status', 'Diterima');

            if (petugasError) throw petugasError;

            // 3. Ambil seluruh Log Check-In PCL
            const { data: allLogs } = await supabase
                .from('log_checkin_pcl')
                .select('petugas_email, tanggal, idsubsls')
                .order('tanggal', { ascending: false });

            // 4. Ambil Log Harian PML khusus hari ini
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
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!authLoading) fetchPmlData();
    }, [profile, authLoading]);

    // FUNGSI CHECK-IN MANDIRI UNTUK PML
    const handlePmlCheckIn = () => {
        if (!navigator.geolocation) {
            alert("HP Anda memblokir fitur lokasi.");
            return;
        }

        setPmlCheckingIn(true);
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude } = position.coords;
                try {
                    const { error } = await supabase
                        .from('log_checkin_pml')
                        .insert({
                            tanggal: getTodayDateString(),
                            pml_email: user.email,
                            idsubsls: pcls[0]?.lastSls || 'WILAYAH-PML', // fallback jika belum ada SLS spesifik
                            latitude,
                            longitude
                        });

                    if (error) throw error;
                    setPmlCheckedInToday(true);
                    alert("📍 Sukses Mengunci Koordinat Pendampingan PML!");
                } catch (err) {
                    alert("Gagal Check-In PML: " + err.message);
                } finally {
                    setPmlCheckingIn(false);
                }
            },
            () => {
                setPmlCheckingIn(false);
                alert("Gagal mengambil GPS HP. Pastikan GPS aktif.");
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    };

    // FUNGSI SIMPAN REALISASI MUATAN PCL BY PML
    const handleSaveRealisasi = async (pclEmail, idsubsls) => {
        const jumlah = realisasiInputs[pclEmail];
        if (!jumlah || jumlah < 0) {
            alert("Masukkan jumlah muatan yang valid.");
            return;
        }

        setActionLoading(pclEmail);
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
                            Supervisor (PML)
                        </span>
                        <h2 className="text-base font-black mt-1 uppercase tracking-tight truncate max-w-[200px]">
                            {profile?.nama_pengguna}
                        </h2>
                        <p className="text-[10px] text-slate-400 font-medium mt-0.5 truncate max-w-[200px]">
                            Kecamatan: <span className="text-indigo-400">{profile?.kecamatan_tugas}</span>
                        </p>
                    </div>
                    <button onClick={fetchPmlData} className="p-2 bg-slate-800 rounded-xl text-slate-400 active:scale-95 transition-all">
                        <RefreshCw size={16} />
                    </button>
                </div>
                
                {/* INLINE PML STICKY CHECK-IN BUTTON */}
                <div className="mt-4 pt-4 border-t border-slate-800/60">
                    {pmlCheckedInToday ? (
                        <div className="w-full bg-emerald-600/10 text-emerald-400 border border-emerald-500/20 rounded-2xl py-2.5 px-4 flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wide">
                            <CheckCircle2 size={14} className="text-emerald-400" />
                            Anda Sudah Check-In Pendampingan
                        </div>
                    ) : (
                        <button
                            disabled={pmlCheckingIn}
                            onClick={handlePmlCheckIn}
                            className="w-full bg-orange-500 hover:bg-orange-600 text-white rounded-2xl py-3 px-4 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20 active:scale-[0.98] transition-all"
                        >
                            {pmlCheckingIn ? (
                                <>
                                    <RefreshCw className="animate-spin" size={14} />
                                    Mengunci Koordinat Anda...
                                </>
                            ) : (
                                <>
                                    <Navigation size={14} className="fill-white" />
                                    Klik Check-In Pendampingan Lapangan
                                </>
                            )}
                        </button>
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
                                <div className="bg-slate-50/60 border-t border-slate-100 p-3.5 space-y-3 animate-slideDown">
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
                                            href={`tel:#`} // Bisa diganti nomor telepon jika ada kolomnya
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