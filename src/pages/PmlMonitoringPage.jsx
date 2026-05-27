import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { 
    Users, MapPin, AlertTriangle, CheckCircle2, 
    Save, RefreshCw, Phone, Search, ChevronDown, ChevronUp, Navigation, Camera, WifiOff, CloudLightning
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

export default function PmlMonitoringPage() {
    const { user, profile, loading: authLoading } = useAuth();
    
    const [loading, setLoading] = useState(true);
    const [pcls, setPcls] = useState([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [actionLoading, setActionLoading] = useState(null);
    const [pmlCheckingIn, setPmlCheckingIn] = useState(false);
    const [pmlCheckedInToday, setPmlCheckedInToday] = useState(false);
    
    // CONTROL FOTO MANDIRI PML & KOORDINAT GPS PML
    const [pmlPhotoBase64, setPmlPhotoBase64] = useState(null);
    const [pmlCoords, setPmlCoords] = useState(null);
    const [showPmlCameraCard, setShowPmlCameraCard] = useState(false);

    // STATE KONTROL AKORDEON LIST PCL 
    const [expandedPcl, setExpandedPcl] = useState(null);
    const [realisasiInputs, setRealisasiInputs] = useState({});
    const [offlineInputCount, setOfflineInputCount] = useState(0);
    const [isSyncingInput, setIsSyncingInput] = useState(false);

    // STATE MENYIMPAN LIST STRING 7 TANGGAL TERAKHIR
    const [last7Dates, setLast7Dates] = useState([]);

    const getTodayDateString = () => {
        return new Date().toLocaleString("sv-SE", { timeZone: "Asia/Jakarta" }).split(" ")[0];
    };

    // GENERATOR LIST 7 HARI TERAKHIR UNTUK HEADER & LOGIKA FILTER
    const generateLast7Days = () => {
        const dates = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dString = d.toLocaleString("sv-SE", { timeZone: "Asia/Jakarta" }).split(" ")[0];
            dates.push(dString);
        }
        setLast7Dates(dates);
        return dates;
    };

    // PARSER LINK DRIVE KE DIRECT IMAGE URL
const getDirectDriveImageUrl = (url) => {
    if (!url) return '';
    
    // Regex tangguh untuk mengambil ID file Drive dari berbagai format link
    const match = url.match(/\/file\/d\/([^\/]+)/) || url.match(/id=([^&]+)/);
    if (match && match[1]) {
        const fileId = match[1];
        // Menggunakan endpoint thumbnail dengan ukuran resolusi lebar (w) 400 piksel
        return `https://drive.google.com/thumbnail?sz=w400&id=${fileId}`;
    }
    
    return url; 
};

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

const fetchPmlData = async () => {
    const pmlEmail = user?.email || profile?.email;
    if (!pmlEmail) return;

    setLoading(true);
    const tglHariIni = getTodayDateString();
    const cleanPmlEmail = pmlEmail.toLowerCase().trim();
    
    const rentangTanggal = generateLast7Days();
    const tglHMinus6 = rentangTanggal[0];

    await checkOfflineInputQueueCount();

    // =========================================================================
    // SKENARIO 1: APABILA SUPERVISOR SEDANG OFFLINE TOTAL (LURING)
    // =========================================================================
    if (!navigator.onLine) {
        console.warn("⚠️ Mode Luring PML: Mengambil status pengawasan dari cache lokal HP.");
        const pmlCheckInStatus = localStorage.getItem(`cache_pml_checkedin_${cleanPmlEmail}_${tglHariIni}`);
        setPmlCheckedInToday(pmlCheckInStatus === 'true');

        const cachedPclList = localStorage.getItem(`cache_pml_monitoring_list_${cleanPmlEmail}`);
        if (cachedPclList) setPcls(JSON.parse(cachedPclList));
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

        // 2. Ambil daftar PCL binaan
        const { data: petugasData, error: petugasError } = await supabase
            .from('petugas')
            .select('email, nama_petugas, kecamatan_tugas, posisi_tugas, id_pml_atasan')
            .eq('posisi_tugas', 'PCL')
            .eq('id_pml_atasan', cleanPmlEmail)
            .eq('status', 'Diterima');

        if (petugasError) throw petugasError;

        // 3. AMBIL LOG CHECK-IN PCL: Kembali ke query basic tanpa relasi kurung () agar tidak error 400
        const { data: rentangLogs } = await supabase
            .from('log_checkin_pcl')
            .select('petugas_email, tanggal, idsubsls, foto_bukti')
            .gte('tanggal', tglHMinus6)
            .lte('tanggal', tglHariIni)
            .order('tanggal', { ascending: false });

        // 4. REFERENSI MASTER SLS: Ambil data pemetaan ID SLS ke Nama SLS secara independen
        const { data: masterSls } = await supabase
            .from('muatan_sls')
            .select('idsubsls, nmsls');

        // 5. Ambil inputan muatan hari ini
        const { data: pmlLogs } = await supabase
            .from('log_harian_pml')
            .select('pcl_email, estimasi_muatan_hari_ini')
            .eq('tanggal', tglHariIni);

        // 6. Kompilasi Gabungan Spasial & Timeline 7 Hari di Sisi Client
        const combinedData = (petugasData || []).map(pcl => {
            const logsPcl = (rentangLogs || []).filter(l => l.petugas_email === pcl.email);
            const checkInHariIni = logsPcl.find(l => l.tanggal === tglHariIni);
            const pmlLogHariIni = pmlLogs?.find(l => l.pcl_email === pcl.email);

            const tanggalMasukList = logsPcl.map(l => l.tanggal);

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

            // Dapatkan ID SLS terakhir dari tracking PCL
            const logTerpilih = checkInHariIni || logsPcl[0];
            const idSlsPetugas = logTerpilih?.idsubsls;
            
            // Jodohkan ID SLS dengan daftar nama SLS dari tabel muatan_sls yang ada di memori
            const pencarianSls = (masterSls || []).find(m => m.idsubsls === idSlsPetugas);
            const namaSlsDitemukan = pencarianSls?.nmsls || idSlsPetugas || 'Belum Masuk SLS';

            return {
                email: pcl.email,
                nama_pengguna: pcl.nama_petugas || 'Tanpa Nama',
                kecamatan_tugas: pcl.kecamatan_tugas,
                statusHariIni: checkInHariIni ? 'AKTIF' : 'ABSEN',
                lastSls: idSlsPetugas || 'Belum Masuk SLS',
                
                // DATA NAMA SLS DIKUNCI DI SINI
                namaSlsLast: namaSlsDitemukan,
                
                absenDays: hariTanpaKabar,
                sudahInputPml: !!pmlLogHariIni,
                nilaiRealisasi: pmlLogHariIni?.estimasi_muatan_hari_ini || 0,
                history7Hari: tanggalMasukList,
                fotoBuktiHariIni: checkInHariIni?.foto_bukti || null
            };
        });

        setPcls(combinedData);
        localStorage.setItem(`cache_pml_monitoring_list_${cleanPmlEmail}`, JSON.stringify(combinedData));
    } catch (err) {
        console.error("Gagal memuat data online:", err.message);
    } finally {
        setLoading(false);
    }
};

    useEffect(() => {
        if (!authLoading) fetchPmlData();
    }, [profile, authLoading]);

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
                const latTeks = pmlCoords ? `LAT: ${pmlCoords.latitude.toFixed(6)}` : "LAT: LURING/LAPANGAN";
                const lonTeks = pmlCoords ? `LON: ${pmlCoords.longitude.toFixed(6)}` : "LON: LURING/LAPANGAN";
                const labelSensus = `PENGAWASAN SE2026 BOYOLALI - PML`;

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

    const handleTriggerPmlLocation = () => {
        if (!navigator.geolocation) {
            alert("HP Anda memblokir fitur lokasi.");
            return;
        }

        setPmlCheckingIn(true);
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude } = position.coords;
                const hasilSlsMandiri = await prosesPencarianGeojson(latitude, longitude);

                if (hasilSlsMandiri) {
                    setPmlCoords({
                        latitude,
                        longitude,
                        idsubsls: hasilSlsMandiri.idsubsls,
                        nmsls: hasilSlsMandiri.nmsls
                    });
                } else {
                    setPmlCoords({
                        latitude,
                        longitude,
                        idsubsls: 'WILAYAH-PML',
                        nmsls: 'Di Luar Poligon SLS'
                    });
                }

                setShowPmlCameraCard(true);
                setPmlCheckingIn(false);
            },
            () => {
                setPmlCoords({ latitude: null, longitude: null, idsubsls: 'WILAYAH-PML', nmsls: 'Sinyal GPS Lemah' });
                setShowPmlCameraCard(true);
                setPmlCheckingIn(false);
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    };

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

        if (!navigator.onLine) {
            localStorage.setItem(`cache_pml_checkedin_${pmlEmail.toLowerCase().trim()}_${tglHariIni}`, 'true');
            setPmlCheckedInToday(true);
            alert("💾 Absen Pendampingan PML disimpan offline di memori HP!");
            setShowPmlCameraCard(false);
            setPmlCheckingIn(false);
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
                    idsubsls: pmlCoords?.idsubsls || 'WILAYAH-PML',
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
            setShowPmlCameraCard(false);
        } finally {
            setPmlCheckingIn(false);
        }
    };

    const handleSaveRealisasi = async (pclEmail, idsubsls) => {
        const jumlah = realisasiInputs[pclEmail];
        const pmlEmail = user?.email || profile?.email;
        const tglHariIni = getTodayDateString();

        if (!jumlah || jumlah < 0) {
            alert("Masukkan jumlah muatan yang valid.");
            return;
        }

        setActionLoading(pclEmail);

        const payloadRealisasi = {
            tanggal: tglHariIni,
            pml_email: pmlEmail.toLowerCase().trim(),
            pcl_email: pclEmail,
            idsubsls: idsubsls,
            status_lapangan: 'Aktif Mencacah',
            estimasi_muatan_hari_ini: parseInt(jumlah)
        };

        if (!navigator.onLine) {
            try {
                const db = await initPmlOfflineDB();
                const tx = db.transaction("pending_realisasi", "readwrite");
                tx.objectStore("pending_realisasi").add(payloadRealisasi);

                setPcls(prev => prev.map(p => p.email === pclEmail ? { ...p, sudahInputPml: true, nilaiRealisasi: parseInt(jumlah) } : p));
                alert("💾 Tersimpan Lokal! Rekap jumlah muatan PCL diamankan sementara di memori HP luring.");
                await checkOfflineInputQueueCount();
            } catch (e) {
                alert("Gagal mengamankan data luring: " + e.message);
            } finally {
                setActionLoading(null);
            }
            return;
        }

        try {
            const { error } = await supabase
                .from('log_harian_pml')
                .insert(payloadRealisasi);

            if (error) throw error;
            alert("✅ Realisasi muatan berhasil disimpan ke server BPS.");
            fetchPmlData();
        } catch (err) {
            alert("Gagal menyimpan data ke server: " + err.message);
        } finally {
            setActionLoading(null);
        }
    };

    const handleSyncPmlOfflineInputs = async () => {
        setIsSyncingInput(true);
        try {
            const db = await initPmlOfflineDB();
            const tx = db.transaction("pending_realisasi", "readonly");
            const store = tx.objectStore("pending_realisasi");
            const getAllRequest = store.getAll();

            getAllRequest.onsuccess = async () => {
                const records = getAllRequest.result;
                if (records.length === 0) {
                    setIsSyncingInput(false);
                    return;
                }

                let suksesPmlCount = 0;
                for (let record of records) {
                    try {
                        const { error } = await supabase
                            .from('log_harian_pml')
                            .insert({
                                tanggal: record.tanggal,
                                pml_email: record.pml_email,
                                pcl_email: record.pcl_email,
                                idsubsls: record.idsubsls,
                                status_lapangan: record.status_lapangan,
                                estimasi_muatan_hari_ini: record.estimasi_muatan_hari_ini
                            });

                        if (!error) {
                            suksesPmlCount++;
                            const deleteTx = db.transaction("pending_realisasi", "readwrite");
                            deleteTx.objectStore("pending_realisasi").delete(record.id);
                        }
                    } catch (loopErr) {
                        console.error(loopErr);
                    }
                }
                alert(`📡 Sinkronisasi Sukses! Berhasil merestorasi ${suksesPmlCount} rekap muatan PCL ke server.`);
                await checkOfflineInputQueueCount();
                fetchPmlData();
            };
        } catch (err) {
            alert("Gagal sinkronisasi data: " + err.message);
        } finally {
            setIsSyncingInput(false);
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

            {/* BOX PROFIL */}
            <div className="bg-slate-900 text-white rounded-3xl p-5 shadow-xl border border-slate-800 mb-4">
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

                {/* INLINE PML STICKY CHECK-IN */}
                <div className="mt-4 pt-4 border-t border-slate-800/60 space-y-3">
                    {pmlCheckedInToday ? (
                        <div className="w-full bg-emerald-600/10 text-emerald-400 border border-emerald-500/20 rounded-2xl py-2.5 px-4 flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wide">
                            <CheckCircle2 size={14} className="text-emerald-400" />
                            Anda Sudah Check-In Pengawasan Lapangan Hari Ini
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
                                        Bukti Swafoto Wajah Pengawas (SLS: {pmlCoords?.nmsls || 'Memindai...'})
                                    </span>

                                    {pmlPhotoBase64 ? (
                                        <div className="relative rounded-xl overflow-hidden border border-slate-600">
                                            <img src={pmlPhotoBase64} alt="PML Bukti" className="w-full h-32 object-cover" />
                                            <label className="absolute bottom-2 right-2 bg-slate-900/90 text-white p-2 rounded-xl text-[9px] font-black cursor-pointer uppercase">
                                                <input type="file" accept="image/*" capture="user" className="hidden" onChange={handlePmlCapturePhoto} />
                                                Ulangi Foto
                                            </label>
                                        </div>
                                    ) : (
                                        <label className="w-full h-20 border-2 border-dashed border-slate-600 hover:border-orange-500 rounded-xl flex flex-col justify-center items-center gap-1 cursor-pointer bg-slate-900 text-slate-400">
                                            <input type="file" accept="image/*" capture="user" className="hidden" onChange={handlePmlCapturePhoto} />
                                            <Camera size={20} />
                                            <span className="text-[10px] font-bold uppercase">Ambil Kamera Depan (Selfie)</span>
                                        </label>
                                    )}

                                    <div className="flex gap-2">
                                        <button onClick={() => setShowPmlCameraCard(false)} className="flex-1 bg-slate-700 text-slate-300 font-bold py-2 rounded-xl text-xs uppercase">Batal</button>
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

            {/* BANNER OFFLINE REKAP */}
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

            {/* SEARCH BAR MINI */}
            <div className="relative mb-4">
                <Search className="absolute left-4 top-3 text-slate-400" size={16} />
                <input
                    type="text"
                    placeholder="Cari nama PCL..."
                    className="w-full bg-white border border-slate-200 rounded-2xl py-2.5 pl-11 pr-4 text-xs font-semibold text-slate-700 outline-none"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            {/* DAFTAR AKORDEON PCL */}
            <div className="space-y-2">
                {/* HEADER RINGKASAN TIM SUPER COMPACT */}
                <div className="flex justify-between items-center px-1 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                    <h3>Petugas ({filteredPcls.length})</h3>
                    <div className="flex gap-3">
                        <span className="text-emerald-500">● {pcls.filter(p => p.statusHariIni === 'AKTIF').length} Aktif</span>
                        <span className="text-rose-500">● {pcls.filter(p => p.statusHariIni === 'ABSEN').length} Absen</span>
                    </div>
                </div>

                {filteredPcls.map((pcl) => {
                    const isExpanded = expandedPcl === pcl.email;

                    return (
                        <div key={pcl.email} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">

                            {/* HEADER AKORDEON */}
                            <div className="p-3 flex flex-col gap-2 cursor-pointer active:bg-slate-50/80" onClick={() => toggleAccordion(pcl.email)}>
                                <div className="flex items-center justify-between">
                                    <div className="min-w-0 flex-1 pr-2">
                                        <h4 className="font-black text-slate-800 text-xs uppercase truncate">{pcl.nama_pengguna}</h4>
                                        <p className="text-[9px] text-slate-400 font-mono truncate">{pcl.email}</p>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                        {pcl.statusHariIni === 'AKTIF' ? (
                                            <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 uppercase">
                                                Sudah Lapangan
                                            </span>
                                        ) : (
                                            <span className="text-[9px] font-black text-rose-500 bg-rose-50 px-2 py-0.5 rounded border border-rose-100 uppercase">
                                                {pcl.absenDays === 99 ? "Belum Lapangan" : `${pcl.absenDays}H`}
                                            </span>
                                        )}
                                        {isExpanded ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                                    </div>
                                </div>

                                {/* KALENDER MINI 7 HARI MATRIX */}
                                <div className="pt-2 border-t border-slate-100 flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
                                    <span className="text-[9px] font-black uppercase text-slate-400 tracking-tight">7 Hari Terakhir:</span>
                                    <div className="flex gap-1">
                                        {last7Dates.map((tgl, idx) => {
                                            const masukPadaTanggalIni = pcl.history7Hari.includes(tgl);
                                            const isHariIni = idx === 6;
                                            const angkaTanggal = tgl.split('-')[2];

                                            return (
                                                <div
                                                    key={tgl}
                                                    title={`Tanggal: ${tgl}`}
                                                    className={`w-[19px] h-[19px] rounded-md text-[9px] font-black flex flex-col items-center justify-center border transition-all ${
                                                        masukPadaTanggalIni
                                                            ? isHariIni && !pcl.sudahInputPml
                                                                ? 'bg-amber-500 border-amber-600 text-white animate-pulse'
                                                                : 'bg-emerald-500 border-emerald-600 text-white shadow-sm'
                                                            : isHariIni && pcl.statusHariIni === 'ABSEN'
                                                                ? 'bg-rose-500 border-rose-600 text-white animate-pulse'
                                                                : 'bg-slate-100 border-slate-200 text-slate-500'
                                                    }`}
                                                >
                                                    {angkaTanggal}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* KONTEN UTAMANYA AKORDEON */}
                            {isExpanded && (
                                <div className="bg-slate-50/60 border-t border-slate-100 p-3 space-y-2.5 animate-fadeIn">

                                    {/* Info Ringkas Gabungan */}
                                    <div className="flex flex-col gap-1 bg-white p-2 rounded-xl border border-slate-100 text-[11px]">
                                        <div className="flex justify-between items-center">
                                            <span className="text-[9px] font-bold text-slate-400 uppercase">Posisi SLS :</span>
                                            <span className="font-black text-slate-700 truncate max-w-[180px]">{pcl.namaSlsLast}</span>
                                        </div>
                                        <div className="flex justify-between items-center border-t border-slate-50 pt-1 mt-1">
                                            <span className="text-[9px] font-bold text-slate-400 uppercase">Status Lapangan:</span>
                                            <span className={`font-black ${pcl.statusHariIni === 'AKTIF' ? 'text-emerald-600' : 'text-rose-500'}`}>
                                                {pcl.statusHariIni === 'AKTIF' ? '✓ Jalan Lapangan' : '⚠️ Belum Jalan Lapangan'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* SLOT INTEGRASI UTAMA: VIEW BUKTI SWAFOTO LAPANGAN PCL */}
                                    {pcl.statusHariIni === 'AKTIF' && (
                                        <div className="bg-white p-2 rounded-xl border border-slate-100 space-y-1.5">
                                            <span className="text-[9px] font-black text-slate-400 uppercase block">Foto Lapangan Petugas:</span>
                                            {pcl.fotoBuktiHariIni ? (
                                                <div className="relative rounded-lg overflow-hidden border border-slate-200 shadow-inner bg-slate-100">
                                                    <img 
                                                        src={getDirectDriveImageUrl(pcl.fotoBuktiHariIni)} 
                                                        alt={`Bukti ${pcl.nama_pengguna}`} 
                                                        className="w-full h-50 object-cover mx-auto"
                                                        loading="lazy"
                                                        referrerPolicy="no-referrer"
                                                        onError={(e) => {
                                                            e.target.onerror = null;
                                                            e.target.src = 'https://placehold.co/600x400?text=Gagal+Memuat+Foto';
                                                        }}
                                                    />
                                                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1.5 text-[8px] text-white font-mono truncate">
                                                        Kamera Terkunci Watermark Lapangan
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="h-16 border border-dashed border-slate-200 rounded-lg flex items-center justify-center text-[10px] text-slate-400 font-bold bg-slate-50 text-center px-4">
                                                    📷 Berkas foto bukti dalam antrean luring gawai petugas
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Form Verifikasi Bersyarat */}
                                    {pcl.statusHariIni === 'AKTIF' ? (
                                        <div className="space-y-1.5 pt-0.5">
                                            <span className="text-[9px] block font-black text-slate-400 uppercase tracking-wider">Verifikasi Muatan Hari Ini</span>
                                            {pcl.sudahInputPml ? (
                                                <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-2 flex items-center justify-between text-xs font-bold text-indigo-700">
                                                    <span>Tercatat Masuk:</span>
                                                    <span className="bg-indigo-600 text-white px-2.5 py-0.5 rounded-md font-black">{pcl.nilaiRealisasi}</span>
                                                </div>
                                            ) : (
                                                <div className="flex gap-1.5">
                                                    <input
                                                        type="number"
                                                        placeholder="Jumlah yang dicacah PCL hari ini"
                                                        className="flex-1 bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none"
                                                        value={realisasiInputs[pcl.email] || ""}
                                                        onChange={(e) => setRealisasiInputs({ ...realisasiInputs, [pcl.email]: e.target.value })}
                                                    />
                                                    <button
                                                        onClick={() => handleSaveRealisasi(pcl.email, pcl.lastSls)}
                                                        disabled={actionLoading === pcl.email}
                                                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 rounded-xl flex items-center justify-center transition-all disabled:bg-slate-300"
                                                    >
                                                        {actionLoading === pcl.email ? <RefreshCw className="animate-spin" size={14} /> : <Save size={14} />}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="animate-fadeIn pt-0">
                                        </div>
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