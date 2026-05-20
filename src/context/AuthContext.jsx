// src/context/AuthContext.jsx
import React, { createContext, useState, useEffect, useContext } from 'react';
import { supabase } from '../supabaseClient'; 

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // ─── STATE BARU UNTUK SAKELAR GLOBAL ALOKASI ──────────────────────────
  const [allowAllocation, setAllowAllocation] = useState(true);

  // ─── FUNGSI AMBIL PENGATURAN SAKELAR DARI DATABASE ────────────────────
  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value_boolean')
        .eq('key', 'allow_allocation_changes')
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setAllowAllocation(data.value_boolean);
      }
    } catch (error) {
      console.error('Error fetching global settings:', error.message);
    }
  };

  // ─── FUNGSI AMBIL PROFIL BERDASARKAN EMAIL (PRIMARY KEY BARU) ─────────
  const fetchUserProfile = async (userEmail) => {
    if (!userEmail) return;
    try {
      const { data, error } = await supabase
        .from('app_users')
        .select('nama_pengguna, role, kecamatan_tugas, is_first_login')
        .eq('email', userEmail.toLowerCase().trim())
        .maybeSingle(); // Aman dari error coercing jika data kosong

      if (error) throw error;
      setProfile(data);
    } catch (error) {
      console.error('Error fetching user profile:', error.message);
    } finally {
      setLoading(false);
    }
  };

  // Fungsi pembantu untuk memicu pembaruan profile & settings dari luar komponen (misal setelah ganti password)
  const refreshProfile = async () => {
    await fetchSettings();
    if (user?.email) {
      await fetchUserProfile(user.email);
    }
  };

  useEffect(() => {
    // Jalankan pengambilan status sakelar alokasi saat aplikasi dimuat pertama kali
    fetchSettings();

    // 1. Cek sesi login yang sedang aktif saat aplikasi pertama kali dimuat
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user?.email) {
        fetchUserProfile(session.user.email);
      } else {
        setLoading(false);
      }
    });

    // 2. Dengarkan perubahan status auth (login / logout / token refreshed)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user?.email) {
        fetchUserProfile(session.user.email);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [user?.email]);

  const logout = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      profile, 
      loading, 
      allowAllocation,     // Diconsumsi oleh AlokasiPage & SettingsPage
      setAllowAllocation,  // Diperbarui oleh SettingsPage
      logout, 
      refreshProfile 
    }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);