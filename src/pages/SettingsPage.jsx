// src/pages/SettingsPage.jsx
import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { Trash2, Search, UserMinus, ShieldAlert } from 'lucide-react';

export default function SettingsPage() {
  const { profile, allowAllocation, setAllowAllocation } = useAuth();
  
  // State Manajemen User (Pegawai Organik)
  const [usersList, setUsersList] = useState([]);
  const [nama, setNama] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('pegawai');
  
  // State Baru: Manajemen Petugas Lapangan (PML/PCL)
  const [petugasList, setPetugasList] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingPetugas, setLoadingPetugas] = useState(false);

  const [loadingUser, setLoadingUser] = useState(false);
  const [loadingToggle, setLoadingToggle] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

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

  // 2. Ambil daftar petugas lapangan (PML/PCL) dengan batasan limit agar ringan
  const fetchPetugas = async () => {
    if (profile?.role !== 'admin') return;
    setLoadingPetugas(true);
    try {
      let query = supabase
        .from('petugas')
        .select('*')
        .order('nama_petugas', { ascending: true })
        .limit(100); // Batasi 100 data awal untuk efisiensi UI

      if (searchQuery.trim() !== '') {
        // Jika ada pencarian, cari berdasarkan nama atau email
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

  useEffect(() => {
    fetchUsers();
    fetchPetugas();
  }, [profile]);

  // Trigger pencarian otomatis saat Admin mengetik nama petugas
  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      fetchPetugas();
    }, 400); // Debounce 400ms agar tidak over-request ke Supabase

    return () => clearTimeout(delayDebounce);
  }, [searchQuery]);

  // Aksi Menambah Pegawai/Admin Terpusat
  const handleAddUser = async (e) => {
    e.preventDefault();
    setMessage({ text: '', type: '' });
    setLoadingUser(true);
    const targetEmail = email.toLowerCase().trim();

    try {
      const { error } = await supabase
        .from('app_users')
        .insert({
          id: null,
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

  // 3. AKSI HAPUS PETUGAS LAPANGAN (PML / PCL)
  const handleDeletePetugas = async (targetEmail, targetNama) => {
    const konfirmasi = window.confirm(
      `⚠️ PERINGATAN MUTLAK!\n\nApakah Anda yakin ingin menghapus petugas bernama:\n"${targetNama}" (${targetEmail})?\n\nTindakan ini akan menghapus akun aksesnya dan mengosongkan status alokasi yang bersangkutan jika sudah terlanjur diplot.`
    );

    if (!konfirmasi) return;

    setMessage({ text: '', type: '' });
    try {
      // Langkah A: Hapus data dari tabel utama petugas
      const { error: deleteError } = await supabase
        .from('petugas')
        .delete()
        .eq('email', targetEmail);

      if (deleteError) throw deleteError;

      // Langkah B: Hapus juga dari app_users jika petugas tersebut sudah terlanjur aktivasi akun login
      await supabase
        .from('app_users')
        .delete()
        .eq('email', targetEmail);

      setMessage({ 
        text: `Sukses menghapus petugas ${targetNama} dari ekosistem aplikasi.`, 
        type: 'success' 
      });
      
      fetchPetugas(); // Refresh list petugas
    } catch (error) {
      setMessage({ text: `Gagal menghapus petugas: ${error.message}`, type: 'error' });
    }
  };

  // Aksi Mengubah Status Sakelar Pengisian Alokasi (ON/OFF)
  const handleToggleAllocation = async () => {
    setMessage({ text: '', type: '' });
    setLoadingToggle(true);
    const nextState = !allowAllocation;

    try {
      const { error } = await supabase
        .from('app_settings')
        .update({ value_boolean: nextState, updated_at: new Date() })
        .eq('key', 'allow_allocation_changes');

      if (error) throw error;

      setAllowAllocation(nextState);
      setMessage({ 
        text: `Pengisian Alokasi berhasil diubah menjadi: ${nextState ? 'DIIZINKAN (ON)' : 'DIKUNCI (OFF)'}`, 
        type: 'success' 
      });
    } catch (error) {
      setMessage({ text: `Gagal mengubah status pengisian: ${error.message}`, type: 'error' });
    } finally {
      setLoadingToggle(false);
    }
  };

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
    // MODIFIKASI: Mengatur padding luar yang lebih fleksibel di mobile (p-4 md:p-6)
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6 md:space-y-8 bg-slate-50 min-h-screen">
      <div>
        <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">PENGATURAN SISTEM</h1>
        <p className="text-slate-500 text-xs md:text-sm font-medium">Pusat Kendali Administrasi Sensus Ekonomi 2026</p>
      </div>

      {message.text && (
        <div className={`p-4 rounded-xl border-l-4 font-semibold text-xs md:text-sm ${
          message.type === 'success' ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-rose-50 border-rose-500 text-rose-700'
        }`}>
          {message.text}
        </div>
      )}

      {/* PANEL 1: SAKELAR ON/OFF PENGISIAN ALOKASI */}
      <section className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-slate-200">
        <h2 className="text-base md:text-lg font-bold text-slate-800 mb-1">Akses Alokasi Wilayah</h2>
        <p className="text-slate-500 text-xs md:text-sm mb-4 md:text-left">Kunci atau izinkan seluruh petugas (Pegawai & PML) untuk mengedit data alokasi di halaman alokasi petugas.</p>
        
        {/* MODIFIKASI: Diubah flex-col pada layar HP agar tombol tidak gepeng/terpotong, sm:flex-row di desktop */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100 max-w-md justify-between">
          <div className="min-w-0">
            <span className="block font-bold text-sm text-slate-700">Status Pengisian Alokasi</span>
            <span className={`text-xs font-bold uppercase tracking-wider ${allowAllocation ? 'text-emerald-600' : 'text-rose-600'}`}>
              {allowAllocation ? '● Diizinkan (Buka Akses)' : '■ Dikunci (Waktu Habis)'}
            </span>
          </div>
          <button
            onClick={handleToggleAllocation}
            disabled={loadingToggle}
            className={`w-full sm:w-auto px-4 py-2.5 sm:py-2 rounded-xl text-xs font-bold shadow-sm text-white transition-all shrink-0 ${
              allowAllocation ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'
            } disabled:bg-slate-300 cursor-pointer`}
          >
            {loadingToggle ? 'Memproses...' : allowAllocation ? 'Kunci Alokasi (OFF)' : 'Buka Alokasi (ON)'}
          </button>
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
              {/* MODIFIKASI: text-base di HP untuk cegah iOS zoom, sm:text-xs kembali normal di desktop */}
              <input
                type="text" required placeholder="Nama Lengkap & Gelar"
                className="w-full px-3 py-2 text-base sm:text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white transition-all"
                value={nama} onChange={(e) => setNama(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[10px] md:text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Email Resmi BPS</label>
              {/* MODIFIKASI: text-base di HP untuk cegah iOS zoom, sm:text-xs kembali normal di desktop */}
              <input
                type="email" required placeholder="contoh@bps.go.id"
                className="w-full px-3 py-2 text-base sm:text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white transition-all"
                value={email} onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[10px] md:text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Hak Akses Peran</label>
              {/* MODIFIKASI: text-base di HP untuk cegah iOS zoom, sm:text-xs kembali normal di desktop */}
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
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 sm:py-2 px-4 rounded-xl shadow-sm text-xs transition-all h-[42px] sm:h-[34px] disabled:bg-slate-300 cursor-pointer"
            >
              {loadingUser ? 'Menyimpan...' : '⚡ Daftarkan Akun'}
            </button>
          </form>
        </div>

        {/* TABEL DAFTAR PEGAWAI INTERNAL */}
        <div>
          <h2 className="text-sm md:text-base font-bold text-slate-800 mb-3">Daftar Akun Terdaftar (Internal BPS)</h2>
          <div className="overflow-x-auto max-h-[300px] overflow-y-auto border border-slate-100 rounded-xl scrollbar-thin">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Nama / Email</th>
                  <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Peran</th>
                  <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Aktivasi Login</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100 text-xs">
                {usersList.map((usr) => (
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
                      <span className={`text-xs font-bold ${usr.is_first_login ? 'text-amber-500' : 'text-emerald-500'}`}>
                        {usr.is_first_login ? '⌛ Menunggu Aktivasi' : '✓ Sudah Aktif'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* PANEL 3: PEMBERSIHAN / HAPUS PETUGAS MITRA (PML/PCL) */}
      <section className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-slate-200">
        {/* MODIFIKASI: flex-col di HP agar input pencarian ditarik ke bawah judul dengan rapi, sm:flex-row di desktop */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-base md:text-lg font-bold text-slate-800 flex items-center gap-2">
              <UserMinus className="text-rose-500 shrink-0" size={18} />
              Manajemen Eliminasi Petugas Lapangan (PML / PCL)
            </h2>
            <p className="text-slate-500 text-xs mt-0.5">Cari dan hapus data petugas eksternal yang mengundurkan diri atau tidak terpakai dari sistem.</p>
          </div>
          
          {/* Input Live Search */}
          {/* MODIFIKASI: max-w-none di HP agar kolom pencarian memenuhi lebar layar mobile */}
          <div className="relative max-w-none sm:max-w-xs w-full">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
              <Search size={16} />
            </span>
            {/* MODIFIKASI: text-base di HP untuk cegah iOS zoom, py-2 di HP agar nyaman di-tap */}
            <input
              type="text"
              placeholder="Cari nama atau email petugas..."
              className="w-full pl-9 pr-4 py-2 sm:py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-base sm:text-xs focus:outline-none focus:ring-1 focus:ring-rose-500 focus:bg-white transition-all"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Tabel Petugas Eksternal */}
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto border border-slate-100 rounded-xl scrollbar-thin">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Nama Lengkap / Email</th>
                <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Kecamatan</th>
                <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Posisi</th>
                <th className="px-4 py-2.5 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Aksi</th>
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
                    <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider ${
                      ptg.posisi_tugas === 'PML' ? 'bg-purple-50 text-purple-700 border border-purple-200' : 'bg-teal-50 text-teal-700 border border-teal-200'
                    }`}>
                      {ptg.posisi_tugas}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-center">
                    {/* MODIFIKASI: Memperluas area padding tombol aksi hapus (p-2) agar pas dengan tap target jempol HP */}
                    <button
                      onClick={() => handleDeletePetugas(ptg.email, ptg.nama_petugas)}
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all inline-block"
                      title="Hapus Petugas Permanen"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {petugasList.length === 0 && (
                <tr>
                  <td colSpan="4" className="px-4 py-10 text-center text-slate-400 font-medium">
                    {loadingPetugas ? 'Memuat database petugas...' : 'Data petugas tidak ditemukan.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}