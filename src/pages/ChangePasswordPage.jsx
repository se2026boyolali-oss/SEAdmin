// src/pages/ChangePasswordPage.jsx
import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ChangePasswordPage() {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { user, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    // Validasi Sederhana di Sisi Klien
    if (newPassword.length < 6) {
      setErrorMsg('Password baru minimal harus 6 karakter!');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('Konfirmasi password tidak cocok!');
      return;
    }

    setLoading(true);

    try {
      // 1. Ambil data email dari session user auth
      const targetEmail = user?.email || user?.data?.user?.email;
      
      if (!targetEmail) {
        throw new Error("Sesi email pengguna tidak terbaca atau telah kedaluwarsa. Silakan coba masuk kembali.");
      }

      // 2. Update password baru di sistem Supabase Auth
      const { error: authError } = await supabase.auth.updateUser({ password: newPassword });
      if (authError) throw authError;

      // 3. Update flag is_first_login menjadi false di tabel profile (app_users)
      const { error: profileError } = await supabase
        .from('app_users')
        .update({ is_first_login: false })
        .eq('email', targetEmail.toLowerCase().trim()); // Menggunakan email sebagai jangkar pelacak aman

      if (profileError) {
        throw new Error(`Gagal memperbarui status aktivasi di database: ${profileError.message}`);
      }

      // 4. Paksa AuthContext untuk menarik ulang data profil terbaru dari Supabase
      // Langkah ini krusial agar role dan nama_pengguna tidak bernilai kosong/null saat pindah halaman
      await refreshProfile();
      
      // 5. Berikan jeda waktu (delay) yang cukup agar state global di React Context benar-benar berubah
      // lalu bersihkan histori navigasi (replace: true) menuju ke halaman utama agar tidak bisa di-back
      setTimeout(() => {
        navigate('/', { replace: true });
      }, 400);

    } catch (error) {
      setErrorMsg(error.message || 'Terjadi kesalahan sistem saat memperbarui password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center py-6 px-4 sm:py-12 sm:px-6 lg:px-8">
      
      {/* Container Header */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center mb-4">
        <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">SENSUS EKONOMI 2026</h2>
        <p className="mt-1 text-xs text-slate-500 font-bold uppercase tracking-wider">BPS Kabupaten Boyolali</p>
      </div>

      {/* Container Card Form */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-6 px-4 shadow-xl sm:rounded-lg sm:px-10 border border-slate-200 rounded-2xl">
          <h3 className="text-xl font-bold text-slate-800 mb-2 text-center">Ubah Password Awal</h3>
          <p className="text-xs sm:text-sm text-slate-500 mb-6 text-center leading-relaxed">
            Demi keamanan sistem, Anda diwajibkan mengganti password default <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-rose-600 font-bold">123456</span> pada saat aktivasi atau login pertama kali.
          </p>

          {/* Notifikasi Error */}
          {errorMsg && (
            <div className="bg-rose-50 border-l-4 border-rose-500 p-4 mb-4 rounded-xl animate-in fade-in duration-200">
              <p className="text-xs sm:text-sm font-semibold text-rose-700">{errorMsg}</p>
            </div>
          )}

          <form className="space-y-5 sm:space-y-6" onSubmit={handleChangePassword}>
            {/* Input Password Baru */}
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-slate-700">Password Baru</label>
              <input
                type="password"
                required
                placeholder="Minimal 6 karakter"
                disabled={loading}
                className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-xl shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 text-base sm:text-sm disabled:bg-slate-50 transition-all"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>

            {/* Input Konfirmasi Password */}
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-slate-700">Konfirmasi Password Baru</label>
              <input
                type="password"
                required
                placeholder="Ulangi password baru Anda"
                disabled={loading}
                className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-xl shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 text-base sm:text-sm disabled:bg-slate-50 transition-all"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>

            {/* Tombol Submit */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:bg-slate-300 transition-all cursor-pointer"
              >
                {loading ? 'Menyimpan & Sinkronisasi Sesi...' : 'Simpan & Masuk Aplikasi'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}