// src/pages/LoginPage.jsx
import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState(''); // State baru untuk pesan sukses (Hijau)
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setLoading(true);

    const inputEmail = email.toLowerCase().trim();
    console.log("=== MEMULAI PROSES LOGIN DENGAN PROTEKSI ARSITEKTUR ===");

    try {
      // 1. Coba login secara normal ke Supabase Auth Baru
      console.log("Langkah 1: Mencoba login biasa...");
      const { data, error: loginError } = await supabase.auth.signInWithPassword({ 
        email: inputEmail, 
        password 
      });

      // Jika sukses langsung tanpa error (Berarti sudah pernah migrasi/klik kedua)
      if (!loginError && data?.user) {
        console.log("Akses Diterima! Mengalihkan ke Dashboard Utama...");
        navigate('/', { replace: true });
        return;
      }

      // Jika loginError terdeteksi tapi tidak memutus aliran try, lempar ke catch secara manual
      if (loginError) throw loginError;

    } catch (error) {
      console.log("Login baru ditolak/belum terdaftar. Memasuki jalur interceptor RPC...", error.message);
      
      try {
        // 2. JALUR UTAMA MIGRASI: Panggil RPC karena login biasa gagal/belum sinkron
        const { data: migrationSuccess, error: rpcError } = await supabase.rpc(
          'verify_and_migrate_legacy_password', 
          { input_email: inputEmail, input_password: password }
        );

        if (rpcError) {
          console.error("RPC Error:", rpcError);
          throw new Error("Terjadi gangguan komunikasi data sensus.");
        }

        if (migrationSuccess === true) {
          console.log("✅ Akun sukses ditanam lewat RPC!");
          setSuccessMsg("Email dan kata sandi Anda BENAR! Sehubungan dengan adanya pembaruan sistem dan perpindahan basis data Sensus, silakan klik sekali lagi tombol 'Masuk Aplikasi' di bawah untuk langsung menuju ke Dashboard.");
          return;
        } else {
          // Jika RPC menghasilkan false, berarti password-nya memang salah
          setErrorMsg("Alamat email atau kata sandi yang Anda masukkan salah.");
        }

      } catch (innerError) {
        console.error("Sistem Gagal Memproses RPC:", innerError);
        setErrorMsg("Terjadi kesalahan operasional sistem saat sinkronisasi basis data.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center py-8 px-4 sm:py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">SENSUS EKONOMI 2026</h2>
        <p className="mt-2 text-sm text-slate-500 font-bold uppercase tracking-wider">BPS Kabupaten Boyolali</p>
      </div>

      <div className="mt-6 sm:mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-6 px-4 shadow-xl rounded-2xl sm:py-8 sm:px-10 border border-slate-200">
          <h3 className="text-xl font-bold text-slate-800 mb-6 text-center">Sign In</h3>
          
          {/* 🔴 Tampilan Kotak Error (Tetap Merah) */}
          {errorMsg && (
            <div className="bg-rose-50 border-l-4 border-rose-500 p-4 mb-4 rounded-xl">
              <p className="text-sm font-semibold text-rose-700">{errorMsg}</p>
            </div>
          )}

          {/* 🟢 Tampilan Kotak Sukses Migrasi (Hijau Segar & Ramah) */}
          {successMsg && (
            <div className="bg-emerald-50 border-l-4 border-emerald-500 p-4 mb-4 rounded-xl">
              <p className="text-sm font-semibold text-emerald-800 leading-relaxed">{successMsg}</p>
            </div>
          )}

          <form className="space-y-5 sm:space-y-6" onSubmit={handleLogin}>
            <div>
              <label className="block text-sm font-semibold text-slate-700">Alamat Email</label>
              <input
                type="email"
                required
                placeholder="email petugas"
                className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-xl shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 text-base sm:text-sm"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700">Password</label>
              <input
                type="password"
                required
                placeholder="•••••"
                className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-xl shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 text-base sm:text-sm"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:bg-slate-300 transition-all cursor-pointer"
              >
                {loading ? 'Memvalidasi Akses...' : 'Masuk Aplikasi'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}