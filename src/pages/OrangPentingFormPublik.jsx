import { useState } from 'react';
import { supabase } from '../supabaseClient';
import { Shield, Upload, Save, CheckCircle, Smartphone, RefreshCw, X } from 'lucide-react';

export default function OrangPentingFormPublik() {
    const [submitting, setSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [uploadingFotoLoading, setUploadingFotoLoading] = useState(false);

    // State penampung string Base64 Gambar hasil kompresi
    const [fotoBase64, setFotoBase64] = useState(null);
    const [namaFileFoto, setNamaFileFoto] = useState('');

    const [isJabatanLainnya, setIsJabatanLainnya] = useState(false);
    const [jabatanKustom, setJabatanKustom] = useState('');

    // State untuk Dropdown Kecamatan
    const [isKecamatanLainnya, setIsKecamatanLainnya] = useState(false);
    const [kecamatanKustom, setKecamatanKustom] = useState('');

    // State Baru untuk Input Nama Dinas (Kepala Dinas)
    const [dinasKustom, setDinasKustom] = useState('');

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

    const listJabatan = [
        "Bupati", "Wakil Bupati", "Setda", "Ketua DPRD", "Anggota DPRD", 
        "Kepala Dinas", "Camat", "Kapolres", "Dandim", "Kajari", 
        "Ketua Pengadilan Negeri", "Ketua Pengadilan Agama", "LAINNYA"
    ];

    const listKecamatan = [
        "SELO", "AMPEL", "GLADAGSARI", "CEPOGO", "MUSUK", "TAMANSARI", 
        "BOYOLALI", "MOJOSONGO", "TERAS", "SAWIT", "BANYUDONO", "SAMBI", 
        "NGEMPLAK", "NOGOSARI", "SIMO", "KARANGGEDE", "KLEGO", "ANDONG", 
        "KEMUSU", "WONOSEGORO", "WONOSAMODRO", "JUWANGI", "LAINNYA"
    ];

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        
        if (name === 'jabatan') {
            if (value === 'LAINNYA') {
                setIsJabatanLainnya(true);
            } else {
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
            if (value === 'LAINNYA') {
                setIsKecamatanLainnya(true);
            } else {
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
                    throw new Error("Google Apps Script gagal memproses unggahan gambar.");
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

            setIsSuccess(true);
            setIsJabatanLainnya(false);
            setJabatanKustom('');
            setIsKecamatanLainnya(false);
            setKecamatanKustom('');
            setDinasKustom('');
            setFotoBase64(null);
            setNamaFileFoto('');
            setFormData({
                nama_tokoh: '', jabatan: 'Bupati', kecamatan: 'SELO', alamat: '', 
                tgl_pendataan: dapatkanTanggalHariIni(),
                petugas_nama: '', tim_nama: '', hasil: 'Respon'
            });

        } catch (err) {
            console.error(err);
            alert("Gagal menyimpan data: " + err.message);
        } finally {
            setSubmitting(false);
        }
    };

    if (isSuccess) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 font-sans">
                <div className="w-full max-w-md bg-white rounded-3xl p-6 text-center shadow-2xl flex flex-col items-center gap-4">
                    <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center animate-bounce">
                        <CheckCircle size={36} />
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-slate-900">Data Berhasil Dikirim!</h2>
                        <p className="text-xs text-slate-500 font-medium mt-1">Terima kasih atas dedikasi Anda melakukan pendataan VVIP SE2026 langsung dari lapangan.</p>
                    </div>
                    <button onClick={() => setIsSuccess(false)} className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black rounded-xl text-xs transition-colors cursor-pointer">
                        🔄 Masukkan Data Baru Lagi
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-950 flex flex-col justify-between p-2 sm:p-4 font-sans text-slate-800">
            {/* 💡 MODIFIKASI: max-w-xl membuat card jauh lebih lebar dan luas di layar HP maupun desktop */}
            <div className="w-full sm:max-w-xl bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-2xl mx-auto my-auto border border-slate-100">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-4 mb-4">
                    <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl"><Shield size={22} /></div>
                    <div>
                        <h1 className="text-sm font-black text-slate-950 tracking-tight uppercase">Pendataan Tokoh Penting</h1>
                        <p className="text-[10px] text-slate-400 font-bold flex items-center gap-1 mt-0.5"><Smartphone size={10}/> Sensus Ekonomi 2026 • Pelaporan</p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col gap-3.5 text-xs font-bold text-slate-700">
                    <div>
                        <label className="block mb-1 text-slate-400">Nama Tokoh / Orang Penting</label>
                        <input type="text" name="nama_tokoh" required value={formData.nama_tokoh} onChange={handleInputChange} placeholder="Ketik nama lengkap tokoh..." className="w-full p-3 border border-slate-200 focus:border-indigo-500 rounded-xl outline-none font-semibold text-slate-800 bg-slate-50/40 text-xs" />
                    </div>

                    <div>
                        <label className="block mb-1 text-slate-400">Jabatan / Kedudukan</label>
                        <select name="jabatan" value={formData.jabatan} onChange={handleInputChange} className="w-full p-3 border border-slate-200 focus:border-indigo-500 rounded-xl outline-none font-bold text-slate-800 bg-white text-xs cursor-pointer">
                            {listJabatan.map((job) => (
                                <option key={job} value={job}>
                                    {job === "LAINNYA" ? "➕ Lainnya (Ketik Manual)" : job}
                                </option>
                            ))}
                        </select>
                    </div>

                    {isJabatanLainnya && (
                        <div className="animate-in fade-in duration-200">
                            <label className="block mb-1 text-indigo-600">Ketik Jabatan Spesifik / Tokoh</label>
                            <input type="text" required placeholder="Misal: CEO PT Suka Maju / Tokoh Agama" value={jabatanKustom} onChange={(e) => setJabatanKustom(e.target.value)} className="w-full p-3 border-2 border-indigo-200 focus:border-indigo-500 rounded-xl outline-none font-semibold text-slate-800 bg-white text-xs" />
                        </div>
                    )}

                    {/* TEXTBOX KHUSUS KEPALA DINAS */}
                    {formData.jabatan === 'Kepala Dinas' && (
                        <div className="animate-in fade-in duration-200">
                            <label className="block mb-1 text-slate-400">Nama Dinas / Instansi Pemerintah</label>
                            <input 
                                type="text" 
                                required 
                                placeholder="Contoh: Dinas Kominfo / Dinas Kesehatan" 
                                value={dinasKustom} 
                                onChange={(e) => setDinasKustom(e.target.value)} 
                                className="w-full p-3 border-2 border-slate-200 focus:border-slate-500 rounded-xl outline-none font-semibold text-slate-800 bg-white text-xs" 
                            />
                        </div>
                    )}

                    {/* DROPDOWN KECAMATAN (JABATAN == CAMAT) */}
                    {formData.jabatan === 'Camat' && (
                        <div className="flex flex-col gap-3.5 animate-in fade-in duration-200">
                            <div>
                                <label className="block mb-1 text-slate-400">Camat Kecamatan :</label>
                                <select name="kecamatan" value={formData.kecamatan} onChange={handleInputChange} className="w-full p-3 border border-slate-200 focus:border-indigo-500 rounded-xl outline-none font-bold text-slate-800 bg-white text-xs cursor-pointer">
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
                                    <input type="text" required placeholder="Tulis nama kecamatan di luar daftar..." value={kecamatanKustom} onChange={(e) => setKecamatanKustom(e.target.value)} className="w-full p-3 border-2 border-indigo-200 focus:border-indigo-500 rounded-xl outline-none font-semibold text-slate-800 bg-white text-xs" />
                                </div>
                            )}
                        </div>
                    )}

                    <div>
                        <label className="block mb-1 text-slate-400">Alamat Lokasi Pendataan</label>
                        <textarea name="alamat" required value={formData.alamat} onChange={handleInputChange} placeholder="Alamat Lengkap, RT/RW, Desa/Kelurahan..." className="w-full p-3 border border-slate-200 focus:border-indigo-500 rounded-xl outline-none font-semibold text-slate-800 bg-slate-50/40 h-16 resize-none text-xs" />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block mb-1 text-slate-400">Tanggal Hari Pendataan</label>
                            <input type="date" name="tgl_pendataan" required value={formData.tgl_pendataan} onChange={handleInputChange} className="w-full p-3 border border-slate-200 focus:border-indigo-500 rounded-xl outline-none font-bold text-slate-800 bg-slate-50/40 text-xs" />
                        </div>
                        <div>
                            <label className="block mb-1 text-slate-400">Hasil Kunjungan</label>
                            <select name="hasil" value={formData.hasil} onChange={handleInputChange} className="w-full p-3 border border-slate-200 focus:border-indigo-500 rounded-xl outline-none font-bold text-slate-800 bg-white text-xs">
                                <option value="Respon">🟢 Sukses / Merespon</option>
                                <option value="Non Respon"> 🔴 Menolak / Non Respon</option>
                            </select>
                        </div>
                    </div>
                    
                    <div>
                        <label className="block mb-1 text-slate-400">Nama Pendata Utama</label>
                        <input type="text" name="petugas_nama" required value={formData.petugas_nama} onChange={handleInputChange} placeholder="Nama Lengkap Pendata Utama..." className="w-full p-3 border border-slate-200 focus:border-indigo-500 rounded-xl outline-none font-semibold text-slate-800 bg-slate-50/40 text-xs" />
                    </div>

                    <div>
                        <label className="block mb-1 text-slate-400">Tim Pendata</label>
                        <textarea name="tim_nama" required value={formData.tim_nama} onChange={handleInputChange} placeholder="Tuliskan seluruh nama anggota tim pendata yang mendampingi..." className="w-full p-3 border border-slate-200 focus:border-indigo-500 rounded-xl outline-none font-semibold text-slate-800 bg-slate-50/40 h-20 resize-none text-xs" />
                    </div>
                    
                    <div>
                        <label className="block mb-1 text-slate-400">Ambil Foto Dokumentasi Lapangan</label>
                        <div className="border border-dashed border-slate-200 hover:border-indigo-400 rounded-xl p-3.5 text-center relative bg-slate-50/60 transition-colors">
                            {/* 💡 MODIFIKASI: Menghapus capture="environment" agar bisa memilih file dari Galeri HP / File Manager */}
                            <input 
                                type="file" 
                                accept="image/*"
                                onChange={handleCaptureFotoVvip}
                                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                            />
                            <Upload className="mx-auto text-slate-400 mb-1" size={18} />
                            <span className="text-[11px] text-slate-500 font-bold block truncate">
                                {uploadingFotoLoading ? "Mengompres Berkas..." : fotoBase64 ? "📸 Foto Siap Diunggah" : "Klik untuk Unggah dari Galeri / Kamera HP"}
                            </span>
                        </div>
                        
                        {fotoBase64 && (
                            <div className="mt-3 relative rounded-xl overflow-hidden border border-slate-200 bg-slate-950 shadow-inner group transition-all">
                                <img src={fotoBase64} alt="Pratinjau Dokumentasi" className="w-full h-40 object-contain mx-auto" />
                                <button 
                                    type="button"
                                    onClick={() => { setFotoBase64(null); setNamaFileFoto(''); }}
                                    className="absolute top-2 right-2 bg-rose-600/90 hover:bg-rose-700 text-white p-1.5 rounded-lg shadow-md transition-colors flex items-center gap-1 text-[10px] uppercase font-black tracking-wider"
                                >
                                    <X size={12} />
                                    Hapus
                                </button>
                            </div>
                        )}
                    </div>

                    <button type="submit" disabled={submitting || uploadingFotoLoading} className="w-full mt-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white font-black p-3.5 rounded-xl transition-all shadow-md text-xs flex items-center justify-center gap-2 cursor-pointer">
                        {submitting ? (
                            <>
                                <RefreshCw className="animate-spin" size={14} />
                                <span>Mengirim Gambar ke GDrive & Supabase...</span>
                            </>
                        ) : (
                            <>
                                <Save size={14} />
                                <span>Kirim Laporan Pendataan</span>
                            </>
                        )}
                    </button>
                </form>
            </div>
            <p className="text-center text-[9px] text-slate-500 font-bold mt-4 uppercase tracking-wider">© 2026 Badan Pusat Statistik Kabupaten Boyolali</p>
        </div>
    );
}