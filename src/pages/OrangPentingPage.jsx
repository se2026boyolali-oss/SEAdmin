import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { 
    UserCheck, 
    Users, 
    MapPin, 
    Calendar, 
    Plus, 
    Search, 
    Briefcase,
    Shield,
    CheckCircle,
    XCircle,
    Camera,
    Target,
    Map,
    X,
    Upload,
    RefreshCw
} from 'lucide-react';

export default function OrangPentingPage() {
    const [showForm, setShowForm] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [dataPendataan, setDataPendataan] = useState([]);
    const [loadingData, setLoadingData] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [uploadingFotoLoading, setUploadingFotoLoading] = useState(false);

    // State penampung berkas foto Base64 hasil kompresi
    const [fotoBase64, setFotoBase64] = useState(null);
    const [namaFileFoto, setNamaFileFoto] = useState('');

    const [isJabatanLainnya, setIsJabatanLainnya] = useState(false);
    const [jabatanKustom, setJabatanKustom] = useState('');
    const [isKecamatanLainnya, setIsKecamatanLainnya] = useState(false);
    const [kecamatanKustom, setKecamatanKustom] = useState('');
    
    // State untuk Teks Box Nama Dinas (Kepala Dinas)
    const [dinasKustom, setDinasKustom] = useState('');

    // Master list Jabatan & Konfigurasi Target BPS Boyolali
    const listJabatanMaster = [
        { id: "Bupati", label: "Bupati", target: 1 },
        { id: "Wakil Bupati", label: "Wakil Bupati", target: 1 },
        { id: "Setda", label: "Setda", target: 1 },
        { id: "Ketua DPRD", label: "Ketua DPRD", target: 1 },
        { id: "Anggota DPRD", label: "Anggota DPRD", target: null },
        { id: "Kepala Dinas", label: "Kepala Dinas", target: null },
        { id: "Camat", label: "Camat", target: 22 },
        { id: "Kapolres", label: "Kapolres", target: 1 },
        { id: "Dandim", label: "Dandim", target: 1 },
        { id: "Kajari", label: "Kajari", target: 1 },
        { id: "Ketua Pengadilan Negeri", label: "Ketua Pengadilan Negeri", target: 1 },
        { id: "Ketua Pengadilan Agama", label: "Ketua Pengadilan Agama", target: 1 },
        { id: "LAINNYA", label: "Lainnya", target: null }
    ];

    const listKecamatan = [
        "SELO", "AMPEL", "GLADAGSARI", "CEPOGO", "MUSUK", "TAMANSARI", 
        "BOYOLALI", "MOJOSONGO", "TERAS", "SAWIT", "BANYUDONO", "SAMBI", 
        "NGEMPLAK", "NOGOSARI", "SIMO", "KARANGGEDE", "KLEGO", "ANDONG", 
        "KEMUSU", "WONOSEGORO", "WONOSAMODRO", "JUWANGI", "LAINNYA"
    ];

    const dapatkanTanggalHariIni = () => {
        const date = new Date();
        const tgl = String(date.getDate()).padStart(2, '0');
        const bln = String(date.getMonth() + 1).padStart(2, '0');
        const thn = date.getFullYear();
        return `${thn}-${bln}-${tgl}`;
    };

    const [formData, setFormData] = useState({
        nama_tokoh: '', 
        jabatan: 'Bupati', 
        kecamatan: 'SELO',
        alamat: '', 
        tgl_pendataan: dapatkanTanggalHariIni(),
        petugas_nama: '', 
        tim_nama: '', 
        hasil: 'Respon'
    });

    // 💡 FIX PERMANEN: Menggunakan Endpoint Resmi Thumbnail Google Drive (Aman dari 429 & CORS)
    const dapatkanLinkThumbnail = (url) => {
        if (!url) return '';
        if (url.includes('drive.google.com')) {
            const regExp = /\/d\/([a-zA-Z0-9-_]+)/;
            const match = url.match(regExp);
            if (match && match[1]) {
                // Menggunakan parameter &sz=w120 agar Google merender gambar berukuran 120px secara instan
                return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w120`;
            }
        }
        return url; 
    };

    const muatDataSupabase = async () => {
        try {
            setLoadingData(true);
            const { data, error } = await supabase
                .from('pendataan_vvip')
                .select('*')
                .order('id', { ascending: false });

            if (error) throw error;
            if (data) setDataPendataan(data);
        } catch (err) {
            console.error("Gagal mengambil data database:", err.message);
        } finally {
            setLoadingData(false);
        }
    };

    useEffect(() => {
        muatDataSupabase();
    }, []);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        
        if (name === 'jabatan') {
            if (value === 'LAINNYA') setIsJabatanLainnya(true);
            else {
                setIsJabatanLainnya(false);
                setJabatanKustom('');
            }
            
            if (value !== 'Camat') {
                setIsKecamatanLainnya(false);
                setKecamatanKustom('');
            }
            
            if (value !== 'Kepala Dinas') {
                setDinasKustom('');
            }
        }

        if (name === 'kecamatan') {
            if (value === 'LAINNYA') setIsKecamatanLainnya(true);
            else {
                setIsKecamatanLainnya(false);
                setKecamatanKustom('');
            }
        }

        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleCaptureFotoVvip = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setUploadingFotoLoading(true);
        
        const cleanNamaTokoh = formData.nama_tokoh ? formData.nama_tokoh.replace(/\s+/g, '_').toUpperCase() : 'TOKOH';
        const tglClean = formData.tgl_pendataan.replace(/-/g, '');
        const namaFileUnik = `VVIP_${cleanNamaTokoh}_${tglClean}_${Date.now().toString().substring(7)}.jpg`;
        setNamaFileFoto(namaFileUnik);

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
                    setFotoBase64(compressedBase64);
                }
                setUploadingFotoLoading(false);
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);

        const jabatanFinal = isJabatanLainnya ? jabatanKustom : formData.jabatan;
        
        let kecamatanFinal = null;
        if (formData.jabatan === 'Camat') {
            kecamatanFinal = isKecamatanLainnya ? kecamatanKustom : formData.kecamatan;
        } else if (formData.jabatan === 'Kepala Dinas') {
            kecamatanFinal = dinasKustom; 
        }

        try {
            let finalFotoUrl = null;

            if (fotoBase64) {
                const gasUrl = "https://script.google.com/macros/s/AKfycbwtBgrsYjqda1azzjFTaZRPrjh5Unv1bleWjdnwua3lQrRfR_AIjTDmR-5NIGKrSEM/exec";
                const responseGas = await fetch(gasUrl, {
                    method: "POST",
                    body: JSON.stringify({
                        fotoBase64: fotoBase64,
                        namaFile: namaFileFoto
                    })
                });
                const hasilGas = await responseGas.json();
                if (hasilGas.status === "success") {
                    finalFotoUrl = hasilGas.url;
                } else {
                    throw new Error("Gagal mengunggah berkas foto.");
                }
            }

            const { error: insertError } = await supabase
                .from('pendataan_vvip')
                .insert([{
                    nama_orang_penting: String(formData.nama_tokoh),
                    jabatan: String(jabatanFinal),
                    kecamatan: kecamatanFinal, 
                    alamat: String(formData.alamat),
                    tgl_hr_pendataan: String(formData.tgl_pendataan),
                    nama_petugas_pendata: String(formData.petugas_nama),
                    tim_pendata: String(formData.tim_nama),
                    hasil_pendataan: String(formData.hasil),
                    upload_ft_pendataan: finalFotoUrl
                }]);

            if (insertError) throw insertError;

            await muatDataSupabase();
            setShowForm(false);
            
            setFormData({
                nama_tokoh: '', jabatan: 'Bupati', kecamatan: 'SELO', alamat: '',
                tgl_pendataan: dapatkanTanggalHariIni(),
                petugas_nama: '', tim_nama: '', hasil: 'Respon'
            });
            setFotoBase64(null);
            setNamaFileFoto('');
            setIsJabatanLainnya(false);
            setJabatanKustom('');
            setIsKecamatanLainnya(false);
            setKecamatanKustom('');
            setDinasKustom('');

            alert("Data responden VVIP berhasil disimpan!");
        } catch (err) {
            console.error(err);
            alert("Gagal memproses data: " + err.message);
        } finally { 
            // 💡 FIX: Sudah berganti dari fillAll ke finally
            setSubmitting(false);
        }
    };

    const dapatkanRealisasiJabatan = (jabatanKey) => {
        return dataPendataan.filter(d => {
            if (d.hasil_pendataan !== 'Respon') return false;
            if (jabatanKey === 'LAINNYA') {
                return !listJabatanMaster.some(m => m.id === d.jabatan && m.id !== 'LAINNYA');
            }
            return d.jabatan === jabatanKey;
        }).length;
    };

    const totalResponVvip = dataPendataan.filter(d => d.hasil_pendataan === 'Respon').length;

    return (
        <div className="h-full flex flex-col gap-6 p-4 md:p-6 bg-slate-50 min-h-screen font-sans text-slate-800">
            
            {/* HEADER PAGE */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-5">
                <div>
                    <h1 className="text-xl md:text-2xl font-black text-slate-950 tracking-tight flex items-center gap-2">
                        <Shield className="text-indigo-600" size={26} />
                        Dashboard Monitoring VVIP Sensus Ekonomi 2026
                    </h1>
                    <p className="text-xs text-slate-500 font-semibold mt-1 uppercase tracking-wide">
                        BPS Kabupaten Boyolali • Rekap Laporan Pendataan Orang Penting & Tokoh Daerah
                    </p>
                </div>
                <button 
                    onClick={() => setShowForm(true)}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black transition-all shadow-sm cursor-pointer"
                >
                    <Plus size={16} /> Entri Data Lapangan
                </button>
            </div>

            {/* SUMMARY TARGET */}
            <div className="flex flex-col gap-3">
                <h2 className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    <Target size={14} className="text-indigo-500"/> Ringkasan Capaian Target Tokoh Daerah
                </h2>
                
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    {listJabatanMaster.map((item) => {
                        const realisasi = dapatkanRealisasiJabatan(item.id);
                        const target = item.target;
                        const isSelesai = target !== null && realisasi >= target;
                        
                        return (
                            <div key={item.id} className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between gap-2">
                                <div>
                                    <div className="text-xs font-black text-slate-900 truncate" title={item.label}>
                                        {item.label}
                                    </div>
                                    <div className="text-[10px] text-slate-400 font-bold mt-0.5">
                                        Target: {target === null ? "∞ (Opsional)" : `${target} Orang`}
                                    </div>
                                </div>
                                
                                <div>
                                    <div className="flex justify-between items-baseline mt-1">
                                        <span className="text-lg font-black text-slate-800">{realisasi}</span>
                                        {target !== null ? (
                                            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${isSelesai ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                                                {isSelesai ? "Sudah" : ""}
                                            </span>
                                        ) : (
                                            <span className="text-[10px] font-bold text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded-md">Aktif</span>
                                        )}
                                    </div>
                                    
                                    {target !== null && (
                                        <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2 overflow-hidden">
                                            <div 
                                                className={`h-full rounded-full transition-all duration-500 ${isSelesai ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                                                style={{ width: `${Math.min((realisasi / target) * 100, 100)}%` }}
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* SEARCH CONTROLS */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row gap-4 justify-between items-center mt-2">
                <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-2 bg-white focus-within:border-indigo-500 transition-colors w-full sm:w-80">
                    <Search size={14} className="text-slate-400" />
                    <input 
                        type="text" 
                        placeholder="Cari nama, jabatan, wilayah, atau dinas..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="bg-transparent text-xs outline-none w-full font-bold text-slate-700"
                    />
                </div>
                <div className="text-xs text-slate-500 font-bold flex items-center gap-2">
                    📊 Total Respon Sukses : <span className="bg-indigo-600 text-white px-2 py-0.5 rounded-md font-black font-mono">{totalResponVvip}</span>
                </div>
            </div>

            {/* MAIN PLATFORM TABLE */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col overflow-hidden">
                {loadingData ? (
                    <div className="p-10 text-center text-xs font-bold text-slate-400 flex flex-col items-center gap-2">
                        <RefreshCw className="animate-spin text-indigo-500" size={24} />
                        Mendownload Berkas Data dari Server Supabase...
                    </div>
                ) : (
                    <div className="overflow-auto">
                        <table className="w-full text-left border-collapse min-w-[1000px]">
                            <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                                <tr>
                                    <th className="px-6 py-4 w-24">Foto</th>
                                    <th className="px-6 py-4">Nama Tokoh / Jabatan</th>
                                    <th className="px-6 py-4">Wilayah / Instansi Terkait</th>
                                    <th className="px-6 py-4">Alamat Lengkap</th>
                                    <th className="px-6 py-4 text-center">Tgl Terdata</th>
                                    <th className="px-6 py-4">Petugas / Tim Lapangan</th>
                                    <th className="px-6 py-4 text-center">Hasil Kunjungan</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white text-xs font-semibold text-slate-700">
                                {dataPendataan
                                    .filter(d => {
                                        return (d.nama_orang_penting?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                               d.jabatan?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                               d.kecamatan?.toLowerCase().includes(searchQuery.toLowerCase()));
                                    })
                                    .map(d => (
                                    <tr key={d.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-6 py-3">
                                            {d.upload_ft_pendataan ? (
                                                <a href={d.upload_ft_pendataan} target="_blank" rel="noreferrer">
                                                    <img 
                                                        src={dapatkanLinkThumbnail(d.upload_ft_pendataan)} 
                                                        alt="Thumbnail" 
                                                        className="w-12 h-12 rounded-xl object-cover border border-slate-200 hover:scale-105 transition-all duration-200 shadow-xs bg-slate-100" 
                                                    />
                                                </a>
                                            ) : (
                                                <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-300">
                                                    <Camera size={16} />
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-3">
                                            <div className="font-extrabold text-slate-900 text-sm">{d.nama_orang_penting}</div>
                                            <div className="text-slate-500 font-medium flex items-center gap-1 mt-0.5"><Briefcase size={12}/>{d.jabatan}</div>
                                        </td>
                                        
                                        <td className="px-6 py-3 font-bold">
                                            {d.kecamatan ? (
                                                d.jabatan === 'Camat' ? (
                                                    <span className="bg-slate-50 text-indigo-700 px-2.5 py-1 rounded-lg border border-indigo-100 text-[10px] uppercase font-black tracking-wide inline-flex items-center gap-1">
                                                        <Map size={10}/> Kec. {d.kecamatan}
                                                    </span>
                                                ) : d.jabatan === 'Kepala Dinas' ? (
                                                    <span className="bg-amber-50 text-amber-700 px-2.5 py-1 rounded-lg border border-amber-100 text-[10px] uppercase font-black tracking-wide inline-flex items-center gap-1">
                                                        🏢 {d.kecamatan}
                                                    </span>
                                                ) : (
                                                    <span className="bg-slate-50 text-slate-700 px-2.5 py-1 rounded-lg border border-slate-200 text-[10px] font-black uppercase tracking-wide">
                                                        📍 {d.kecamatan}
                                                    </span>
                                                )
                                            ) : (
                                                <span className="text-slate-400 font-normal italic">-</span>
                                            )}
                                        </td>
                                        
                                        <td className="px-6 py-3 text-slate-600 max-w-[240px] truncate" title={d.alamat}>
                                            <div className="flex items-center gap-1"><MapPin size={12} className="text-slate-400 shrink-0"/>{d.alamat}</div>
                                        </td>
                                        <td className="px-6 py-3 text-center font-mono text-slate-600">
                                            <div className="flex items-center justify-center gap-1"><Calendar size={12}/> {d.tgl_hr_pendataan}</div>
                                        </td>
                                        <td className="px-6 py-3">
                                            <div className="font-bold text-slate-900">{d.nama_petugas_pendata}</div>
                                            <div className="text-[10px] text-slate-400 font-bold whitespace-pre-line mt-0.5">{d.tim_pendata}</div>
                                        </td>
                                        <td className="px-6 py-3 text-center">
                                            <span className={`px-2 py-0.5 rounded-md font-black text-[10px] uppercase inline-flex items-center gap-1 ${
                                                d.hasil_pendataan === 'Respon' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                                            }`}>
                                                {d.hasil_pendataan === 'Respon' ? <CheckCircle size={10}/> : <XCircle size={10}/>}
                                                {d.hasil_pendataan}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* MODAL FORM DASHBOARD */}
            {showForm && (
                <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs z-50 flex justify-end">
                    <div className="w-full sm:w-[480px] bg-white h-full shadow-2xl flex flex-col p-6 overflow-y-auto animate-in slide-in-from-right duration-200">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-4">
                            <div>
                                <h2 className="text-base font-black text-slate-900 uppercase">Input Hasil Kunjungan VVIP</h2>
                                <p className="text-xs text-slate-400 font-bold">Sinkronisasi data terverifikasi ke sistem Cloud BPS</p>
                            </div>
                            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600 p-2 rounded-lg hover:bg-slate-50 cursor-pointer"><X size={18}/></button>
                        </div>

                        <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-xs font-bold text-slate-700">
                            <div>
                                <label className="block mb-1 text-slate-400">Nama Tokoh / Orang Penting</label>
                                <input type="text" name="nama_tokoh" required value={formData.nama_tokoh} onChange={handleInputChange} placeholder="Ketik nama lengkap tokoh..." className="w-full p-3 border border-slate-200 rounded-xl outline-none bg-slate-50/40" />
                            </div>

                            <div>
                                <label className="block mb-1 text-slate-400">Jabatan / Kedudukan</label>
                                <select name="jabatan" value={formData.jabatan} onChange={handleInputChange} className="w-full p-3 border border-slate-200 rounded-xl bg-white outline-none cursor-pointer">
                                    {listJabatanMaster.map((job) => (
                                        <option key={job.id} value={job.id}>
                                            {job.id === "LAINNYA" ? "➕ Lainnya (Ketik Manual)" : job.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {isJabatanLainnya && (
                                <div className="animate-in fade-in duration-200">
                                    <label className="block mb-1 text-slate-400">Ketik Jabatan Spesifik</label>
                                    <input type="text" required placeholder="Misal: Direktur BUMD / Tokoh Masyarakat" value={jabatanKustom} onChange={(e) => setJabatanKustom(e.target.value)} className="w-full p-3 border-2 border-slate-200 rounded-xl outline-none" />
                                </div>
                            )}

                            {formData.jabatan === 'Kepala Dinas' && (
                                <div className="animate-in fade-in duration-200">
                                    <label className="block mb-1 text-slate-400">Nama Dinas / Instansi Pemerintah</label>
                                    <input 
                                        type="text" 
                                        required 
                                        placeholder="Contoh: Dinas Kominfo / BAPPERIDA" 
                                        value={dinasKustom} 
                                        onChange={(e) => setDinasKustom(e.target.value)} 
                                        className="w-full p-3 border-2 border-slate-200 rounded-xl outline-none bg-white font-semibold text-slate-800" 
                                    />
                                </div>
                            )}

                            {formData.jabatan === 'Camat' && (
                                <div className="flex flex-col gap-4 animate-in fade-in duration-200">
                                    <div>
                                        <label className="block mb-1 text-slate-400">Kecamatan Wilayah Tugas</label>
                                        <select name="kecamatan" value={formData.kecamatan} onChange={handleInputChange} className="w-full p-3 border border-slate-200 rounded-xl bg-white outline-none cursor-pointer">
                                            {listKecamatan.map((kec) => (
                                                <option key={kec} value={kec}>
                                                    {kec === "LAINNYA" ? "➕ Lainnya (Ketik Manual)" : kec}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {isKecamatanLainnya && (
                                        <div className="animate-in fade-in duration-200">
                                            <label className="block mb-1 text-indigo-600">Ketik Nama Kecamatan Manual</label>
                                            <input type="text" required placeholder="Ketik nama kecamatan..." value={kecamatanKustom} onChange={(e) => setKecamatanKustom(e.target.value)} className="w-full p-3 border-2 border-indigo-200 rounded-xl outline-none" />
                                        </div>
                                    )}
                                </div>
                            )}

                            <div>
                                <label className="block mb-1 text-slate-400">Alamat Lokasi Pendataan</label>
                                <textarea name="alamat" required value={formData.alamat} onChange={handleInputChange} placeholder="Alamat lengkap lokasi..." className="w-full p-3 border border-slate-200 rounded-xl outline-none bg-slate-50/40 h-16 resize-none" />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block mb-1 text-slate-400">Tanggal Pendataan</label>
                                    <input type="date" name="tgl_pendataan" required value={formData.tgl_pendataan} onChange={handleInputChange} className="w-full p-3 border border-slate-200 rounded-xl outline-none bg-slate-50/40" />
                                </div>
                                <div>
                                    <label className="block mb-1 text-slate-400">Hasil Kunjungan</label>
                                    <select name="hasil" value={formData.hasil} onChange={handleInputChange} className="w-full p-3 border border-slate-200 rounded-xl bg-white outline-none">
                                        <option value="Respon">🟢 Sukses / Merespon</option>
                                        <option value="Non Respon">🔴 Menolak / Non Respon</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block mb-1 text-slate-400">Nama Pendata Utama</label>
                                <input type="text" name="petugas_nama" required value={formData.petugas_nama} onChange={handleInputChange} placeholder="Nama lengkap petugas..." className="w-full p-3 border border-slate-200 rounded-xl outline-none bg-slate-50/40" />
                            </div>

                            <div>
                                <label className="block mb-1 text-slate-400">Tim Pendata</label>
                                <textarea name="tim_nama" required value={formData.tim_nama} onChange={handleInputChange} placeholder="Tuliskan seluruh nama anggota tim pendata pendamping (bisa panjang)..." className="w-full p-3 border border-slate-200 rounded-xl outline-none bg-slate-50/40 h-20 resize-none" />
                            </div>

                            <div>
                                <label className="block mb-1 text-slate-400">Foto Dokumentasi Lapangan</label>
                                <div className="border border-dashed border-slate-200 hover:border-indigo-400 rounded-xl p-4 text-center relative bg-slate-50/60 transition-colors">
                                    <input 
                                        type="file" 
                                        accept="image/*"
                                        onChange={handleCaptureFotoVvip}
                                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                    />
                                    <Upload className="mx-auto text-slate-400 mb-1" size={18} />
                                    <span className="text-[11px] text-slate-500 font-bold block truncate">
                                        {uploadingFotoLoading ? "Mengompres Gambar..." : fotoBase64 ? "📸 Foto Siap Diunggah" : "Klik untuk unggah dokumen"}
                                    </span>
                                </div>
                                
                                {fotoBase64 && (
                                    <div className="mt-3 relative rounded-xl overflow-hidden border border-slate-200 bg-slate-950 shadow-inner transition-all">
                                        <img src={fotoBase64} alt="Pratinjau" className="w-full h-36 object-contain mx-auto" />
                                        <button 
                                            type="button"
                                            onClick={() => { setFotoBase64(null); setNamaFileFoto(''); }}
                                            className="absolute top-2 right-2 bg-rose-600/90 hover:bg-rose-700 text-white p-1.5 rounded-lg shadow-md transition-colors flex items-center gap-1 text-[10px] uppercase font-black"
                                        >
                                            <X size={12} /> Hapus
                                        </button>
                                    </div>
                                )}
                            </div>

                            <button 
                                type="submit" 
                                disabled={submitting || uploadingFotoLoading}
                                className="w-full mt-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white font-black p-3.5 rounded-xl transition-all shadow-md text-xs flex items-center justify-center gap-2 cursor-pointer"
                            >
                                {submitting ? (
                                    <>
                                        <RefreshCw className="animate-spin" size={14} />
                                        <span>Mengunggah & Menyimpan ke Server...</span>
                                    </>
                                ) : (
                                    <span>Kirim & Simpan ke Database Supabase</span>
                                )}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}