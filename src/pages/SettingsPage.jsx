// src/pages/SettingsPage.jsx
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { Trash2, Search, UserMinus, RotateCcw, Lock, Unlock, ShieldAlert, CheckCircle2 } from 'lucide-react';

// Daftar 22 Kecamatan di Boyolali untuk opsi sakelar
const DAFTAR_KECAMATAN = [
  "Selo", "Ampel", "Gladagsari", "Cepogo", "Musuk", "Tamansari", "Boyolali", "Mojosongo", 
  "Teras", "Sawit", "Banyudono", "Sambi", "Ngemplak", "Nogosari", "Simo", "Karanggede", 
  "Klego", "Andong", "Kemusu", "Wonosegoro", "Wonosamodro", "Juwangi"
].sort();

export default function SettingsPage() {
  const { profile } = useAuth();
  
  // State Manajemen User (Pegawai Organik)
  const [usersList, setUsersList] = useState([]);
  const [nama, setNama] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('pegawai');
  const [searchUserQuery, setSearchUserQuery] = useState(''); 
  
  // State Manajemen Petugas Lapangan (PML/PCL)
  const [petugasList, setPetugasList] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingPetugas, setLoadingPetugas] = useState(false);

  const [loadingUser, setLoadingUser] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  // STATE KUNCI/BUKA WILAYAH KECAMATAN
  const [lockedKecamatan, setLockedKecamatan] = useState([]);
  const [loadingToggleKec, setLoadingToggleKec] = useState(null); // Menyimpan nama kecamatan yang sedang di-loading

  // NEW STATE: Menyimpan status hak akses upload manual global untuk PCL lapangan
  const [allowManualUpload, setAllowManualUpload] = useState(false);
  const [loadingGlobalToggle, setLoadingGlobalToggle] = useState(false);

  // Ref untuk tracking mount awal (mencegah double fetch petugas)
  const isFirstMount = useRef(true);

  // 1. Ambil daftar user dari tabel app_users
  const fetchUsers = async () => {
    if (profile?.role !== 'admin') return;
    const { data, error } = await supabase
      .from('app_users')
      .select('*')
      .order('role', { ascending: true })
      .order('nama_pengguna', { ascending: true });
    
    if (!error && data) setUsersList(data);
  };

  // 2. Ambil daftar petugas lapangan (PML/PCL)
  const fetchPetugas = async () => {
    if (profile?.role !== 'admin') return;
    setLoadingPetugas(true);
    try {
      let query = supabase
        .from('petugas')
        .select('*')
        .order('nama_petugas', { ascending: true })
        .limit(100);

      if (searchQuery.trim() !== '') {
        query = supabase
          .from('petugas')
          .select('*')
          .or(`nama_petugas.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`)
          .order('nama_petugas', { ascending: true });
      }

      const { data, error } = await query;
      if (error) throw error;
      setPetugasList(data || []);
    } catch (error) {
      console.error("Gagal memuat petugas:", error.message);
    } finally {
      setLoadingPetugas(false);
    }
  };

  // 3. MODIFIKASI: Ambil status konfigurasi aplikasi (Kecamatan Kunci & Jalur Manual PCL) sekaligus
  const fetchAppSettings = async () => {
    try {
      // Pemuatan data kecamatan terblokir
      const { data: kecData, error: kecError } = await supabase
        .from('app_settings')
        .select('value_json')
        .eq('key', 'locked_kecamatan_list')
        .single();

      if (!kecError && kecData && kecData.value_json) {
        setLockedKecamatan(kecData.value_json);
      } else if (kecError && kecError.code !== 'PGRST116') {
        throw kecError;
      }

      // Pemuatan data status bypass upload galeri manual PCL
      const { data: manualData, error: manualError } = await supabase
        .from('app_settings')
        .select('value_boolean')
        .eq('key', 'allow_manual_upload')
        .single();

      if (!manualError && manualData) {
        setAllowManualUpload(manualData.value_boolean === true);
      } else if (manualError && manualError.code !== 'PGRST116') {
        throw manualError;
      }

    } catch (err) {
      console.error("Gagal memuat konfigurasi pusat pengaturan:", err.message);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchPetugas();
    fetchAppSettings();
  }, [profile]);

  // Debounce untuk pencarian petugas lapangan (server-side)
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }

    const delayDebounce = setTimeout(() => {
      fetchPetugas();
    }, 400);

    return () => clearTimeout(delayDebounce);
  }, [searchQuery]);

  // Prosedur Tambah Akun Internal
  const handleAddUser = async (e) => {
    e.preventDefault();
    setMessage({ text: '', type: '' });
    setLoadingUser(true);
    const targetEmail = email.toLowerCase().trim();

    try {
      const { error } = await supabase
        .from('app_users')
        .insert({
          email: targetEmail,
          nama_pengguna: nama.trim(),
          role: role,
          kecamatan_tugas: null,
          is_first_login: true
        });

      if (error) {
        if (error.code === '23505') throw new Error('Email ini sudah terdaftar di sistem!');
        throw error;
      }

      setMessage({ text: `Berhasil mendaftarkan ${nama} sebagai ${role}!`, type: 'success' });
      setNama('');
      setEmail('');
      setRole('pegawai');
      fetchUsers();
    } catch (error) {
      setMessage({ text: error.message, type: 'error' });
    } finally {
      setLoadingUser(false);
    }
  };

  // AKSI RESET PASSWORD VIA RPC
  const handleResetPassword = async (targetEmail, targetNama) => {
    const konfirmasi = window.confirm(
      `🔄 RESET PASSWORD PETUGAS\n\nApakah Anda yakin ingin mereset password untuk:\n"${targetNama}" (${targetEmail})?\n\nSistem akan menghapus kredensial lama di auth.users secara permanen dan mengembalikan status login awal petugas ke password default '123456'.`
    );

    if (!konfirmasi) return;

    setMessage({ text: '', type: '' });
    try {
      const { error } = await supabase.rpc('reset_user_password_admin', {
        target_email: targetEmail.toLowerCase().trim()
      });

      if (error) throw error;

      setMessage({ 
        text: `Berhasil mereset password untuk ${targetNama}. Silakan minta petugas login kembali dengan password '123456'.`, 
        type: 'success' 
      });
      
      fetchUsers(); 
      fetchPetugas();
    } catch (error) {
      setMessage({ text: `Gagal mereset password: ${error.message}`, type: 'error' });
    }
  };

  // AKSI HAPUS PETUGAS MITRA
  const handleDeletePetugas = async (targetEmail, targetNama) => {
    const konfirmasi = window.confirm(
      `⚠️ PERINGATAN MUTLAK!\n\nApakah Anda yakin ingin menghapus petugas bernama:\n"${targetNama}" (${targetEmail})?\n\nTindakan ini akan menghapus akun aksesnya dan mengosongkan status alokasi yang bersangkutan jika sudah terlanjur diplot.`
    );

    if (!konfirmasi) return;

    setMessage({ text: '', type: '' });
    try {
      const { error: deleteError } = await supabase
        .from('petugas')
        .delete()
        .eq('email', targetEmail);

      if (deleteError) throw deleteError;

      await supabase
        .from('app_users')
        .delete()
        .eq('email', targetEmail);

      setMessage({ 
        text: `Sukses menghapus petugas ${targetNama} dari ekosistem aplikasi.`, 
        type: 'success' 
      });
      
      fetchPetugas();
    } catch (error) {
      setMessage({ text: `Gagal menghapus petugas: ${error.message}`, type: 'error' });
    }
  };

  // Mengubah status Kunci/Buka Per Kecamatan
  const handleToggleKecamatanLock = async (namaKecamatan) => {
    setLoadingToggleKec(namaKecamatan);
    setMessage({ text: '', type: '' });
    
    const isCurrentlyLocked = lockedKecamatan.includes(namaKecamatan);
    const updatedList = isCurrentlyLocked 
      ? lockedKecamatan.filter(k => k !== namaKecamatan)
      : [...lockedKecamatan, namaKecamatan];

    try {
      const { error } = await supabase
        .from('app_settings')
        .upsert({ 
          key: 'locked_kecamatan_list', 
          value_json: updatedList,
          updated_at: new Date() 
        }, { onConflict: 'key' });

      if (error) throw error;

      setLockedKecamatan(updatedList);
      setMessage({ 
        text: `Akses alokasi Kecamatan ${namaKecamatan} berhasil ${isCurrentlyLocked ? 'DIBUKA (ON)' : 'DIKUNCI (OFF)'}`, 
        type: 'success' 
      });
    } catch (error) {
      setMessage({ text: `Gagal memperbarui status wilayah: ${error.message}`, type: 'error' });
    } finally {
      setLoadingToggleKec(null);
    }
  };

  // NEW FUNCTION: Aksi Merubah Status Sakelar Sakti Jalur Upload Manual PCL
  const handleToggleGlobalManualUpload = async () => {
    if (loadingGlobalToggle) return;
    setLoadingGlobalToggle(true);
    setMessage({ text: '', type: '' });

    const nextState = !allowManualUpload;

    try {
      const { error } = await supabase
        .from('app_settings')
        .upsert({
          key: 'allow_manual_upload',
          value_boolean: nextState,
          updated_at: new Date()
        }, { onConflict: 'key' });

      if (error) throw error;

      setAllowManualUpload(nextState);
      setMessage({
        text: `Kebijakan Darurat: Opsi Upload Manual untuk Petugas Lapangan (PCL) berhasil ${nextState ? 'DIAKTIFKAN (ON)' : 'DINONAKTIFKAN (OFF)'}!`,
        type: 'success'
      });
    } catch (error) {
      setMessage({ text: `Gagal merubah kebijakan manual global: ${error.message}`, type: 'error' });
    } finally {
      setLoadingGlobalToggle(false);
    }
  };

  // Logika Filter untuk Tabel Internal
  const filteredUsersList = usersList.filter(usr => 
    usr.nama_pengguna?.toLowerCase().includes(searchUserQuery.toLowerCase()) ||
    usr.email?.toLowerCase().includes(searchUserQuery.toLowerCase())
  );

  if (profile?.role !== 'admin') {
    return (
      <div className="p-4 md:p-8 text-center">
        <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl inline-block font-semibold text-sm max-w-full">
          ⚠️ Akses Ditolak: Halaman ini hanya boleh diakses oleh Admin BPS Kabupaten Boyolali.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6 md:space-y-8 bg-slate-50 min-h-screen">
      <div>
        <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">PENGATURAN SISTEM</h1>
        <p className="text-slate-500 text-xs md:text-sm font-medium">Pusat Kendali Administrasi Sensus Ekonomi 2026</p>
      </div>

      {message.text && (
        <div className={`p-4 rounded-xl border-l-4 font-semibold text-xs md:text-sm animate-fadeIn ${
          message.type === 'success' ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-rose-50 border-rose-500 text-rose-700'
        }`}>
          {message.text}
        </div>
      )}

      {/* NEW PANEL: PUSAT KENDALI KEBIJAKAN DARURAT (UPLOAD MANUAL TOGGLE) */}
      <section className="bg-gradient-to-br from-slate-900 to-slate-800 text-white p-5 md:p-6 rounded-3xl shadow-xl border border-slate-700/50">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[9px] bg-amber-500 text-white px-2 py-0.5 rounded-full font-black uppercase tracking-wider">
                Kebijakan Awal Pelaksanaan Sensus
              </span>
              {allowManualUpload && (
                <span className="text-[9px] bg-emerald-500 text-white px-2 py-0.5 rounded-full font-black uppercase tracking-wider animate-pulse">
                  Aktif (ON)
                </span>
              )}
            </div>
            <h2 className="text-base md:text-lg font-black text-white flex items-center gap-2 tracking-tight">
              <ShieldAlert className="text-amber-400 shrink-0" size={20} />
              Bypass Jalur Alternatif: Upload Manual PCL
            </h2>
            <p className="text-slate-400 text-xs md:text-sm max-w-2xl leading-relaxed">
              Aktifkan ini jika banyak petugas terkendala satelit GPS / kamera HP. Petugas akan diberikan opsi memilih SLS, merubah tanggal secara mandiri, dan mengunggah foto langsung dari <strong>Galeri HP</strong>.
            </p>
          </div>

          {/* iOS Style Custom Interactive Switch Toggle Box */}
          <div 
            onClick={handleToggleGlobalManualUpload}
            className={`w-14 h-8 shrink-0 rounded-full p-1 transition-colors duration-300 ease-in-out flex items-center shadow-inner ${
              loadingGlobalToggle ? 'bg-slate-700 opacity-60 cursor-not-allowed' : 'cursor-pointer'
            } ${allowManualUpload ? 'bg-emerald-500' : 'bg-slate-600'}`}
          >
            <div className={`bg-white w-6 h-6 rounded-full shadow-md transform transition-transform duration-300 ease-in-out flex items-center justify-center ${
              allowManualUpload ? 'translate-x-6' : 'translate-x-0'
            }`}>
              {loadingGlobalToggle ? (
                <span className="w-2 h-2 rounded-full bg-slate-400 animate-ping"></span>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* PANEL 1: SAKELAR KUNCI/BUKA ALOKASI PER KECAMATAN */}
      <section className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-slate-200">
        <h2 className="text-base md:text-lg font-bold text-slate-800 mb-1">Kontrol Alokasi Wilayah per Kecamatan</h2>
        <p className="text-slate-500 text-xs md:text-sm mb-6">Kunci (*OFF*) or Izinkan (*ON*) petugas di masing-masing kecamatan untuk memperbarui data pemetaan alokasi.</p>
        
        {/* Grid Opsi Sakelar Kecamatan */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {DAFTAR_KECAMATAN.map((kec) => {
            const isLocked = lockedKecamatan.includes(kec);
            const isLoading = loadingToggleKec === kec;

            return (
              <div 
                key={kec} 
                className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                  isLocked 
                    ? 'bg-rose-50/50 border-rose-200 text-rose-900' 
                    : 'bg-emerald-50/30 border-emerald-200 text-emerald-900'
                }`}
              >
                <div className="min-w-0 truncate pr-2">
                  <span className="block font-bold text-xs uppercase tracking-wide truncate">{kec}</span>
                  <span className={`text-[10px] font-bold ${isLocked ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {isLocked ? '🔒 Dikunci' : '🔓 Diizinkan'}
                  </span>
                </div>

                <button
                  onClick={() => handleToggleKecamatanLock(kec)}
                  disabled={loadingToggleKec !== null}
                  className={`p-2 rounded-lg text-white transition-all shadow-sm shrink-0 cursor-pointer ${
                    isLocked 
                      ? 'bg-emerald-600 hover:bg-emerald-700' 
                      : 'bg-rose-600 hover:bg-rose-700'
                  } disabled:bg-slate-300 disabled:cursor-not-allowed`}
                  title={isLocked ? `Buka Kunci Kecamatan ${kec}` : `Kunci Kecamatan ${kec}`}
                >
                  {isLoading ? (
                    <span className="text-[10px] px-1 font-bold animate-pulse">...</span>
                  ) : isLocked ? (
                    <Unlock size={14} />
                  ) : (
                    <Lock size={14} />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* LAYOUT UTAMA: FORM DAN TABEL DIGABUNG SECARA VERTIKAL */}
      <section className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-slate-200 space-y-6">
        
        {/* FORM INLINE COMPACT */}
        <div className="border-b border-slate-100 pb-6">
          <h2 className="text-base md:text-lg font-bold text-slate-800 mb-4">Daftarkan Pegawai Organik Baru</h2>
          <form onSubmit={handleAddUser} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-[10px] md:text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Nama Lengkap</label>
              <input
                type="text" required placeholder="Nama Lengkap & Gelar"
                className="w-full px-3 py-2 text-base sm:text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white transition-all"
                value={nama} onChange={(e) => setNama(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[10px] md:text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Email Resmi BPS</label>
              <input
                type="email" required placeholder="contoh@bps.go.id"
                className="w-full px-3 py-2 text-base sm:text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white transition-all"
                value={email} onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[10px] md:text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Hak Akses Peran</label>
              <select
                className="w-full px-3 py-2 text-base sm:text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white transition-all"
                value={role} onChange={(e) => setRole(e.target.value)}
              >
                <option value="pegawai">Pegawai Organik</option>
                <option value="admin">Administrator Sistem</option>
              </select>
            </div>
            <button
              type="submit" disabled={loadingUser}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 px-4 rounded-xl shadow-sm text-xs transition-all h-[42px] sm:h-[34px] disabled:bg-slate-300 cursor-pointer"
            >
              {loadingUser ? 'Memproses...' : '⚡ Daftarkan Akun'}
            </button>
          </form>
        </div>

        {/* TABEL DAFTAR PEGAWAI INTERNAL */}
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-3">
            <h2 className="text-sm md:text-base font-bold text-slate-800">Daftar Akun Terdaftar</h2>
            
            <div className="relative max-w-none sm:max-w-xs w-full">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <Search size={14} />
              </span>
              <input
                type="text"
                placeholder="Cari nama atau email petugas..."
                className="w-full pl-8 pr-4 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-base sm:text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white transition-all"
                value={searchUserQuery}
                onChange={(e) => setSearchUserQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="overflow-x-auto max-h-[300px] overflow-y-auto border border-slate-100 rounded-xl scrollbar-thin">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Nama / Email</th>
                  <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Peran</th>
                  <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Aktivasi Login & Aksi</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100 text-xs">
                {filteredUsersList.map((usr) => (
                  <tr key={usr.email} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <div className="font-bold text-slate-800">{usr.nama_pengguna}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{usr.email}</div>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider ${
                        usr.role === 'admin' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-blue-50 text-blue-700 border border-blue-200'
                      }`}>{usr.role}</span>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <div className="flex items-center gap-4 max-w-[280px]">
                        {usr.is_first_login ? (
                          <span className="px-2 py-0.5 text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-200 rounded animate-pulse shrink-0">
                            ⌛ Belum Aktivasi
                          </span>
                        ) : (
                          <span className="text-xs font-bold text-emerald-500 shrink-0">
                            ✓ Sudah Aktif
                          </span>
                        )}

                        <button
                          onClick={() => handleResetPassword(usr.email, usr.nama_pengguna)}
                          className="px-2.5 py-1 bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 rounded-lg text-[10px] font-extrabold flex items-center gap-1 transition-all cursor-pointer shadow-sm ml-auto"
                        >
                          <RotateCcw size={10} /> Reset Password
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* PANEL 3: MANAJEMEN ELIMINASI PETUGAS LAPANGAN */}
      <section className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-base md:text-lg font-bold text-slate-800 flex items-center gap-2">
              <UserMinus className="text-rose-500 shrink-0" size={18} />
              Manajemen Eliminasi Petugas Lapangan (PML / PCL)
            </h2>
            <p className="text-slate-500 text-xs mt-0.5">Cari dan hapus data petugas eksternal yang mengundurkan diri atau tidak terpakai dari sistem.</p>
          </div>
          
          <div className="relative max-w-none sm:max-w-xs w-full">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
              <Search size={16} />
            </span>
            <input
              type="text"
              placeholder="Cari nama atau email petugas..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-xl text-base sm:text-xs focus:outline-none focus:ring-1 focus:ring-rose-500 focus:bg-white transition-all"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto max-h-[400px] overflow-y-auto border border-slate-100 rounded-xl scrollbar-thin">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Nama Lengkap / Email</th>
                <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Kecamatan</th>
                <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Posisi & Reset</th>
                <th className="px-4 py-2.5 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Hapus</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100 text-xs">
              {petugasList.map((ptg) => (
                <tr key={ptg.email} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <div className="font-bold text-slate-700">{ptg.nama_petugas}</div>
                    <div className="text-[11px] text-slate-400 font-mono">{ptg.email}</div>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap font-medium text-slate-600 uppercase tracking-wide">
                    {ptg.kecamatan_tugas || '-'}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider ${
                        ptg.posisi_tugas === 'PML' ? 'bg-purple-50 text-purple-700 border border-purple-200' : 'bg-teal-50 text-teal-700 border border-teal-200'
                      }`}>{ptg.posisi_tugas}</span>

                      <button
                        onClick={() => handleResetPassword(ptg.email, ptg.nama_petugas)}
                        className="px-2 py-0.5 bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 rounded text-[9px] font-extrabold flex items-center gap-0.5 transition-all cursor-pointer shadow-sm"
                      >
                        <RotateCcw size={8} /> Reset Password
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-center">
                    <button
                      onClick={() => handleDeletePetugas(ptg.email, ptg.nama_petugas)}
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all inline-block cursor-pointer"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}