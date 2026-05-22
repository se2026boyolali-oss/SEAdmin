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
      // 1. Update password di sistem Supabase Auth
      const { error: authError } = await supabase.auth.updateUser({ password: newPassword });
      if (authError) throw authError;

      // 2. REVISI: Update status menggunakan EMAIL agar bypass deteksi UUID yang belum sinkron
      const targetEmail = user?.email || user?.data?.user?.email;
      
      if (!targetEmail) {
        throw new Error("Sesi email pengguna tidak terbaca. Silakan coba login kembali.");
      }

      const { error: profileError } = await supabase
        .from('app_users')
        .update({ is_first_login: false })
        .eq('email', targetEmail.toLowerCase().trim()); // Menggunakan email sebagai jangkar pelacak

      if (profileError) {
        throw new Error(`Gagal memperbarui profil di database: ${profileError.message}`);
      }

      // 3. Jalankan fungsi refresh dari context untuk memperbarui data profile global
      await refreshProfile();
      
      // 4. Berikan jeda super mikro agar state benar-benar terisi di React, lalu pindah ke halaman utama
      setTimeout(() => {
        navigate('/', { replace: true });
      }, 100);

    } catch (error) {
      setErrorMsg(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <h3 className="text-2xl font-bold text-gray-900 mb-2 text-center">Ubah Password Awal</h3>
          <p className="text-sm text-gray-500 mb-6 text-center">
            Demi keamanan, Anda diwajibkan mengganti password default (123456) pada login pertama kali.
          </p>

          {errorMsg && (
            <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-4 rounded">
              <p className="text-sm text-red-700">{errorMsg}</p>
            </div>
          )}

          <form className="space-y-6" onSubmit={handleChangePassword}>
            <div>
              <label className="block text-sm font-medium text-gray-700">Password Baru</label>
              <input
                type="password"
                required
                placeholder="Minimal 6 karakter"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Konfirmasi Password Baru</label>
              <input
                type="password"
                required
                placeholder="Ulangi password baru"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:bg-gray-400"
            >
              {loading ? 'Menyimpan...' : 'Simpan & Masuk Aplikasi'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}