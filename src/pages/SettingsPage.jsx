// src/pages/SettingsPage.jsx
import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';

export default function SettingsPage() {
  const { profile, allowAllocation, setAllowAllocation } = useAuth();
  
  // State Manajemen User
  const [usersList, setUsersList] = useState([]);
  const [nama, setNama] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('pegawai');
  
  const [loadingUser, setLoadingUser] = useState(false);
  const [loadingToggle, setLoadingToggle] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  // Ambil daftar user dari tabel app_users jika login sebagai Admin
  const fetchUsers = async () => {
    if (profile?.role !== 'admin') return;
    const { data, error } = await supabase
      .from('app_users')
      .select('*')
      .order('role', { ascending: true })
      .order('nama_pengguna', { ascending: true });
    
    if (!error && data) setUsersList(data);
  };

  useEffect(() => {
    fetchUsers();
  }, [profile]);

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
          id: null, // NULL di awal karena belum aktivasi auth
          email: targetEmail,
          nama_pengguna: nama.trim(),
          role: role,
          kecamatan_tugas: null, // Pegawai/Admin tidak dikunci ke kecamatan tertentu
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
      fetchUsers(); // Refresh tabel data
    } catch (error) {
      setMessage({ text: error.message, type: 'error' });
    } finally {
      setLoadingUser(false);
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

      setAllowAllocation(nextState); // Update state global di context
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

  // Proteksi Halaman: Jika bukan admin, blokir akses halaman pengaturan ini
  if (profile?.role !== 'admin') {
    return (
      <div className="p-8 text-center">
        <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl inline-block font-semibold">
          ⚠️ Akses Ditolak: Halaman ini hanya boleh diakses oleh Admin BPS Kabupaten Boyolali.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">PENGATURAN SISTEM</h1>
        <p className="text-slate-500 text-sm">Pengaturan Manajemen SE 2026.</p>
      </div>

      {/* Kotak Notifikasi Respon */}
      {message.text && (
        <div className={`p-4 rounded-xl border-l-4 font-semibold text-sm ${
          message.type === 'success' ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-rose-50 border-rose-500 text-rose-700'
        }`}>
          {message.text}
        </div>
      )}

      {/* PANEL 1: SAKELAR ON/OFF PENGISIAN ALOKASI */}
      <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <h2 className="text-lg font-bold text-slate-800 mb-2">Akses Alokasi Wilayah</h2>
        <p className="text-slate-500 text-sm mb-6">Kunci atau izinkan seluruh petugas (Pegawai & PML) untuk mengedit data alokasi di halaman alokasi petugas.</p>
        
        <div className="flex items-center space-x-4 bg-slate-50 p-4 rounded-xl border border-slate-100 max-w-md justify-between">
          <div>
            <span className="block font-bold text-slate-700">Status Pengisian Alokasi</span>
            <span className={`text-xs font-bold uppercase tracking-wider ${allowAllocation ? 'text-emerald-600' : 'text-rose-600'}`}>
              {allowAllocation ? '● Diizinkan (Buka Akses)' : '■ Dikunci (Waktu Habis)'}
            </span>
          </div>
          
          <button
            onClick={handleToggleAllocation}
            disabled={loadingToggle}
            className={`px-4 py-2 rounded-xl text-xs font-bold shadow-sm text-white transition-all ${
              allowAllocation 
                ? 'bg-rose-600 hover:bg-rose-700 focus:ring-rose-500' 
                : 'bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500'
            } disabled:bg-slate-300`}
          >
            {loadingToggle ? 'Memproses...' : allowAllocation ? 'Kunci Alokasi (OFF)' : 'Buka Alokasi (ON)'}
          </button>
        </div>
      </section>

      {/* PANEL 2: MANAJEMEN PENDAFTARAN USER BARU */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Kolom Kiri: Form Input Tambah Pegawai */}
        <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 lg:col-span-1 h-fit">
          <h2 className="text-lg font-bold text-slate-800 mb-4">Daftarkan Pegawai Organik</h2>
          <form onSubmit={handleAddUser} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider">Nama Lengkap</label>
              <input
                type="text" required placeholder="Nama Lengkap"
                className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm"
                value={nama} onChange={(e) => setNama(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider">Email BPS</label>
              <input
                type="email" required placeholder="contoh@bps.go.id"
                className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm"
                value={email} onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider">Hak Akses Peran</label>
              <select
                className="mt-1 block w-full px-3 py-2 border border-slate-300 bg-white rounded-xl focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm"
                value={role} onChange={(e) => setRole(e.target.value)}
              >
                <option value="pegawai">Pegawai Organik</option>
                <option value="admin">Administrator Sistem</option>
              </select>
            </div>
            <button
              type="submit" disabled={loadingUser}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-2 px-4 rounded-xl shadow-sm text-sm transition-all disabled:bg-slate-300"
            >
              {loadingUser ? 'Menyimpan...' : 'Kunci & Daftarkan Data'}
            </button>
          </form>
        </section>

        {/* Kolom Kanan: Tabel Daftar Pegawai Terdaftar */}
        <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 lg:col-span-2">
          <h2 className="text-lg font-bold text-slate-800 mb-4">Daftar Akun Terdaftar</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Nama / Email</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Peran</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Aktivasi Login</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100 text-sm">
                {usersList.map((usr) => (
                  <tr key={usr.email}>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="font-semibold text-slate-800">{usr.nama_pengguna}</div>
                      <div className="text-xs text-slate-400">{usr.email}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide ${
                        usr.role === 'admin' ? 'bg-amber-100 text-amber-800' : usr.role === 'pegawai' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-800'
                      }`}>
                        {usr.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`text-xs font-bold ${usr.is_first_login ? 'text-amber-500' : 'text-emerald-500'}`}>
                        {usr.is_first_login ? '⌛ Menunggu Aktivasi' : '✓ Sudah Aktif'}
                      </span>
                    </td>
                  </tr>
                ))}
                {usersList.length === 0 && (
                  <tr>
                    <td colSpan="3" className="px-4 py-8 text-center text-slate-400 font-medium">Belum ada pegawai kedinasan yang didaftarkan.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}