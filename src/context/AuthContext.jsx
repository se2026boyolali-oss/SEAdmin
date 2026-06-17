// src/context/AuthContext.jsx
import React, { createContext, useState, useEffect, useContext } from 'react';
import { supabase } from '../supabaseClient'; 

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // ─── STATE SAKELAR GLOBAL ALOKASI ───────────────────────────────────
  const [allowAllocation, setAllowAllocation] = useState(true);

  // ─── FUNGSI AMBIL PENGATURAN SAKELAR DARI DATABASE / CACHE ───────────
  const fetchSettings = async () => {
    // INTERUPSI OFFLINE: Jika luring, ambil langsung dari LocalStorage
    if (!navigator.onLine) {
      const cachedSettings = localStorage.getItem('cache_allow_allocation');
      if (cachedSettings !== null) {
        setAllowAllocation(JSON.parse(cachedSettings));
      }
      return;
    }

    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value_boolean')
        .eq('key', 'allow_allocation_changes')
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setAllowAllocation(data.value_boolean);
        // Sinkronisasi Cache lokal
        localStorage.setItem('cache_allow_allocation', JSON.stringify(data.value_boolean));
      }
    } catch (error) {
      console.error('Error fetching global settings:', error.message);
    }
  };

  // ─── FUNGSI AMBIL PROFIL BERDASARKAN EMAIL DENGAN BACKUP OFFLINE ─────
  const fetchUserProfile = async (userEmail) => {
    if (!userEmail) return;
    const cleanEmail = userEmail.toLowerCase().trim();

    // INTERUPSI OFFLINE: Jika luring, bypass query Supabase & baca LocalStorage
    if (!navigator.onLine) {
      console.warn("🌐 [AuthContext] Aplikasi luring. Memuat profil dari cache perangkat.");
      const cachedProfile = localStorage.getItem(`cache_profile_${cleanEmail}`);
      if (cachedProfile) {
        setProfile(JSON.parse(cachedProfile));
      }
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('app_users')
        .select('nama_pengguna, role, kecamatan_tugas, is_first_login')
        .eq('email', cleanEmail)
        .maybeSingle();

      if (error) throw error;
      
      setProfile(data);
      if (data) {
        // Sinkronisasi Cache lokal agar data di HP selalu paling update saat online
        localStorage.setItem(`cache_profile_${cleanEmail}`, JSON.stringify(data));
      }
    } catch (error) {
      console.error('Error fetching user profile:', error.message);
      // Fallback jika internet tiba-tiba putus di tengah-tengah query
      const fallbackProfile = localStorage.getItem(`cache_profile_${cleanEmail}`);
      if (fallbackProfile) setProfile(JSON.parse(fallbackProfile));
    } finally {
      setLoading(false);
    }
  };

  // Fungsi pembantu refresh data profil & settings
  const refreshProfile = async () => {
    await fetchSettings();
    if (user?.email) {
      await fetchUserProfile(user.email);
    }
  };

useEffect(() => {
  // Ambil pengaturan global sekali di awal
  fetchSettings();

  // 1. Cek sesi login aktif pertama kali
  supabase.auth.getSession().then(({ data: { session } }) => {
    const currentUser = session?.user ?? null;
    setUser(currentUser);
    if (currentUser?.email) {
      fetchUserProfile(currentUser.email);
    } else {
      setLoading(false);
    }
  });

  // 2. Dengarkan perubahan status auth (Hanya dipasang 1x)
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    const currentUser = session?.user ?? null;
    
    // Optimasi: Hanya fetch profil jika user-nya memang berubah/baru login
    setUser((prevUser) => {
      if (currentUser?.email !== prevUser?.email) {
        if (currentUser?.email) {
          fetchUserProfile(currentUser.email);
        } else {
          setProfile(null);
          setLoading(false);
        }
      } else {
        // Jika user sama (misal hanya refresh token token), matikan loading langsung
        setLoading(false);
      }
      return currentUser;
    });
  });

  return () => subscription.unsubscribe();
}, []); // <-- DIKOSONGKAN agar berjalan sekali saja saat aplikasi dimuat

  const logout = async () => {
    // Bersihkan cache spesifik user saat logout agar tidak bertumpuk di HP orang lain
    if (user?.email) {
      localStorage.removeItem(`cache_profile_${user.email.toLowerCase().trim()}`);
    }
    await supabase.auth.signOut();
    setProfile(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      profile, 
      loading, 
      allowAllocation,     
      setAllowAllocation,  
      logout, 
      refreshProfile 
    }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);