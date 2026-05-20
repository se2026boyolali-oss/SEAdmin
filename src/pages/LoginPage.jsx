// src/pages/LoginPage.jsx
import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);

    const inputEmail = email.toLowerCase().trim();

    try {
      // Langkah A: Coba login biasa ke Supabase Auth (Untuk user yang sudah aktivasi)
      const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({ 
        email: inputEmail, 
        password 
      });

      // Langkah B: Jika akun auth belum ada atau password default dicoba pertama kali
      if (loginError) {
        
        // 1. Cek apakah email ini sudah didaftarkan terlebih dahulu oleh Admin di tabel app_users
        const { data: registeredUser } = await supabase
          .from('app_users')
          .select('*')
          .eq('email', inputEmail)
          .maybeSingle();

        // 2. Cek apakah termasuk kategori PML (Jika tidak ada di app_users, cek data eksternal di tabel petugas)
        let registeredPml = null;
        if (!registeredUser) {
          const { data: pmlCheck } = await supabase
            .from('petugas')
            .select('*')
            .eq('email', inputEmail)
            .eq('posisi_tugas', 'PML')
            .eq('status', 'Diterima')
            .maybeSingle();
          registeredPml = pmlCheck;
        }

        // KUNCI KEAMANAN MUTLAK: Jika email tidak terdata sama sekali di sistem, TOLAK langsung!
        if (!registeredUser && !registeredPml) {
          throw new Error('Email Anda belum didaftarkan di dalam sistem. Silakan hubungi Admin BPS Kabupaten Boyolali.');
        }

        // KUNCI KEAMANAN KEDUA: Jika terdaftar tetapi password masukan bukan password default aktivasi '123456'
        if (password !== '123456') {
          throw new Error('Email terdaftar di basis data, namun password awal yang Anda masukkan salah.');
        }

        // --- PROSES AKTIVASI AKUN LEGAL VIA SDK (Lolos Validasi Keamanan) ---
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: inputEmail,
          password: '123456',
        });

        if (signUpError) throw signUpError;

        const sessionUser = signUpData?.user || signUpData?.data?.user;

        if (sessionUser) {
          const newUid = sessionUser.id;

          if (registeredUser) {
            // JIKA DIA ADMIN / PEGAWAI: Perbarui baris data yang sudah di-input admin dengan UUID Auth resmi
            const { error: updateError } = await supabase
              .from('app_users')
              .update({ id: newUid, is_first_login: true })
              .eq('email', inputEmail); // Aman menggunakan target email karena sudah menjadi Primary Key baru

            if (updateError) throw updateError;

          } else if (registeredPml) {
            // JIKA DIA PML: Buat baris profil baru di app_users secara aman
            await supabase.from('app_users').delete().eq('email', inputEmail);
            
            const { error: insertError } = await supabase
              .from('app_users')
              .insert({
                id: newUid,
                email: inputEmail,
                nama_pengguna: registeredPml.nama_petugas,
                role: 'pml',
                kecamatan_tugas: registeredPml.kecamatan_tugas,
                is_first_login: true
              });

            if (insertError) throw insertError;
          }

          // Sukses melakukan aktivasi awal, alihkan langsung ke halaman ubah password resmi
          navigate('/change-password');
          return;
        } else {
          throw new Error('Gagal memproses pendaftaran otomatis. Pastikan status "Confirm Sign Up" di Dashboard Supabase Auth > Providers > Email sudah bernilai OFF.');
        }
      }

      // Langkah C: Jika login sukses (User lama yang datanya sudah sinkron di database)
      // Kita gunakan select berdasarkan email karena merupakan Primary Key utama yang konsisten
      const { data: profile, error: profileError } = await supabase
        .from('app_users')
        .select('is_first_login')
        .eq('email', inputEmail)
        .maybeSingle();

      if (profileError) throw profileError;

      const isFirstLogin = profile ? profile.is_first_login : true;

      if (isFirstLogin) {
        navigate('/change-password');
      } else {
        navigate('/'); // Lempar ke root, router App.jsx otomatis membagi halaman berdasarkan role
      }

    } catch (error) {
      setErrorMsg(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <h2 className="text-3xl font-black text-slate-900 tracking-tight">SENSUS EKONOMI 2026</h2>
        <p className="mt-2 text-sm text-slate-500 font-bold uppercase tracking-wider">BPS Kabupaten Boyolali</p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl rounded-2xl sm:px-10 border border-slate-200">
          <h3 className="text-xl font-bold text-slate-800 mb-6 text-center">Sign In</h3>
          
          {errorMsg && (
            <div className="bg-rose-50 border-l-4 border-rose-500 p-4 mb-4 rounded-xl">
              <p className="text-sm font-semibold text-rose-700">{errorMsg}</p>
            </div>
          )}

          <form className="space-y-6" onSubmit={handleLogin}>
            <div>
              <label className="block text-sm font-semibold text-slate-700">Alamat Email</label>
              <input
                type="email"
                required
                placeholder="email petugas"
                className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-xl shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm"
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
                className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-xl shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:bg-slate-300 transition-all"
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