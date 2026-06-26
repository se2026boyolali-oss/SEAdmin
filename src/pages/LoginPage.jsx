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

    try {
      // Login langsung bawaan Supabase (akan otomatis pakai password lama yang sudah kita salin)
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.toLowerCase().trim(),
        password: password,
      });

      if (error) {
        throw new Error("Alamat email atau kata sandi Anda salah.");
      }

      // Ambil profile untuk cek halaman redirect
      const { data: profile } = await supabase
        .from('app_users')
        .select('is_first_login')
        .eq('email', email.toLowerCase().trim())
        .single();

      if (profile?.is_first_login) {
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