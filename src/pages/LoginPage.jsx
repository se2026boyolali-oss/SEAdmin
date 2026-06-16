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
    let isMounted = true;
    setLoading(true);

    const inputEmail = email.toLowerCase().trim();

    try {
      // Langkah A: Coba login biasa ke Supabase Auth
      const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({ 
        email: inputEmail, 
        password 
      });

      // Langkah B: Aktivasi Pertama Kali / Password Default
      if (loginError) {
        const [checkUser, checkPetugas] = await Promise.all([
          supabase.from('app_users').select('*').eq('email', inputEmail).maybeSingle(),
          supabase.from('petugas').select('*').eq('email', inputEmail).eq('status', 'Diterima')
        ]);

        const registeredUser = checkUser.data;
        const allPetugasData = checkPetugas.data || [];

        const registeredPml = allPetugasData.find(p => p.posisi_tugas === 'PML') || null;
        const registeredPcl = allPetugasData.find(p => p.posisi_tugas === 'PCL') || null;

        if (!registeredUser && !registeredPml && !registeredPcl) {
          throw new Error('Email Anda belum didaftarkan di dalam sistem. Silakan hubungi Admin BPS Kabupaten Boyolali.');
        }

        if (password !== '123456') {
          if (registeredUser && registeredUser.id !== null) {
            throw new Error('Email terdaftar, namun password yang Anda masukkan salah. Silakan coba lagi atau hubungi Admin untuk reset password.');
          } else {
            throw new Error('Email terdaftar di basis data, namun password awal untuk aktivasi pertama kali salah (Gunakan: 123456).');
          }
        }

        let signUpData = null;
        let signUpError = null;

        try {
          const res = await supabase.auth.signUp({
            email: inputEmail,
            password: '123456',
          });
          signUpData = res.data;
          signUpError = res.error;
        } catch (signUpCatchErr) {
          signUpError = signUpCatchErr;
        }

        if (signUpError) {
          if (signUpError.message?.toLowerCase().includes("already registered") || signUpError.status === 429) {
            const { data: retryData, error: retryError } = await supabase.auth.signInWithPassword({
              email: inputEmail,
              password: '123456'
            });
            if (retryError) throw new Error('Gagal melakukan aktivasi otomatis atau server sedang sibuk. Silakan bersihkan histori browser Anda atau tunggu 1 menit.');
            signUpData = retryData;
          } else {
            throw signUpError;
          }
        }

        const sessionUser = signUpData?.user || signUpData?.data?.user;

        if (sessionUser) {
          const newUid = sessionUser.id;

          // 🛠️ FIX BUG: Ditambahkan AWAIT agar data lama dipastikan terhapus bersih sebelum melakukan insert profil baru
          await supabase.from('app_users').delete().eq('email', inputEmail);

          const finalNama = registeredPml?.nama_petugas || registeredPcl?.nama_petugas || registeredUser?.nama_pengguna;
          const finalRole = registeredPml ? 'pml' : (registeredPcl ? 'pcl' : (registeredUser?.role || 'pcl'));
          const finalKecamatan = registeredPml?.kecamatan_tugas || registeredPcl?.kecamatan_tugas || registeredUser?.kecamatan_tugas;

          const { error: insertError } = await supabase
            .from('app_users')
            .insert({
              id: newUid,
              email: inputEmail,
              nama_pengguna: finalNama,
              role: finalRole,
              kecamatan_tugas: finalKecamatan,
              is_first_login: true
            });

          if (insertError) throw insertError;

          navigate('/change-password');
          return;
        } else {
          throw new Error('Gagal memproses pendaftaran otomatis. Pastikan status "Confirm Sign Up" di Dashboard Supabase Auth sudah bernilai OFF.');
        }
      }

      // Langkah C: Login Berhasil (User Lama)
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
        navigate('/'); 
      }

    } catch (error) {
      setErrorMsg(error.message);
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
          
          {errorMsg && (
            <div className="bg-rose-50 border-l-4 border-rose-500 p-4 mb-4 rounded-xl">
              <p className="text-sm font-semibold text-rose-700">{errorMsg}</p>
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