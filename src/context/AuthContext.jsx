import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import { supabase } from '../supabaseClient'; 

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // ─── STATE SAKELAR GLOBAL (TERINTEGRASI) ───────────────────────────
  const [allowAllocation, setAllowAllocation] = useState(true);
  const [allowManualMode, setAllowManualMode] = useState(false);
  const [isMaintenance, setIsMaintenance] = useState(false);

  // 🔄 OPTIMASI: Menyimpan email terakhir yang sukses di-fetch agar tidak balapan
  const lastFetchedEmail = useRef(null);

  // ─── OPTIMASI ULTIMATE: FETCH SEMUA SETTING & PROFILE GABUNGAN ───
// ─── OPTIMASI ULTIMATE: FETCH SEMUA SETTING & PROFILE GABUNGAN ───
  const initSessionData = async (currentUser) => {
    const email = currentUser?.email;
    const cleanEmail = email ? email.toLowerCase().trim() : null;

    // 🛡️ PERBAIKAN SIKLUS: Jika loading masih aktif dan dipicu oleh user null, abaikan agar tidak menimpa fetch valid
    if (!cleanEmail && loading && lastFetchedEmail.current) return;

    if (cleanEmail === lastFetchedEmail.current && lastFetchedEmail.current !== null) return;
    lastFetchedEmail.current = cleanEmail;

    // 1. JALUR INTERUPSI OFFLINE TOTAL
    if (!navigator.onLine) {
      const cachedAlloc = localStorage.getItem('cache_allow_allocation');
      if (cachedAlloc !== null) setAllowAllocation(JSON.parse(cachedAlloc));

      const cachedManual = localStorage.getItem('cache_allow_manual_upload');
      if (cachedManual !== null) setAllowManualMode(cachedManual === 'true');

      const cachedMaint = localStorage.getItem('cache_is_maintenance');
      if (cachedMaint !== null) setIsMaintenance(JSON.parse(cachedMaint));

      if (cleanEmail) {
        const cachedProfile = localStorage.getItem(`cache_profile_${cleanEmail}`);
        if (cachedProfile) setProfile(JSON.parse(cachedProfile));
      }
      setLoading(false);
      return;
    }

    try {
      // 2. TEMBAK KEYS SEKALIGUS
      const requests = [
        supabase.from('app_settings')
          .select('key, value_boolean')
          .in('key', ['allow_allocation_changes', 'allow_manual_upload', 'is_maintenance']),
      ];

      if (cleanEmail) {
        // 🚀 SOLUSI .ilike(): Kebal terhadap perbedaan huruf besar/kecil di tabel database
        requests.push(
          supabase.from('app_users')
            .select('nama_pengguna, role, kecamatan_tugas, is_first_login')
            .ilike('email', cleanEmail)
            .maybeSingle()
        );
      }

      const responses = await Promise.all(requests);
      const settingsRes = responses[0];
      const userRes = responses[1] || null;

      // Pemrosesan Array Setting Gabungan
      if (settingsRes && settingsRes.data) {
        const allocSetting = settingsRes.data.find(s => s.key === 'allow_allocation_changes');
        if (allocSetting) {
          setAllowAllocation(allocSetting.value_boolean);
          localStorage.setItem('cache_allow_allocation', JSON.stringify(allocSetting.value_boolean));
        }

        const manualSetting = settingsRes.data.find(s => s.key === 'allow_manual_upload');
        if (manualSetting) {
          const isAllowed = manualSetting.value_boolean === true;
          setAllowManualMode(isAllowed);
          localStorage.setItem('cache_allow_manual_upload', isAllowed ? 'true' : 'false');
        }

        const maintSetting = settingsRes.data.find(s => s.key === 'is_maintenance');
        if (maintSetting) {
          setIsMaintenance(maintSetting.value_boolean);
          localStorage.setItem('cache_is_maintenance', JSON.stringify(maintSetting.value_boolean));
        }
      }

      // Proses hasil profil user
      if (userRes && userRes.data) {
        setProfile(userRes.data);
        localStorage.setItem(`cache_profile_${cleanEmail}`, JSON.stringify(userRes.data));
      } else if (cleanEmail) {
        // 🛡️ FAIL-SAFE: Jika akun auth Supabase ada tapi email tidak terdaftar di tabel app_users
        console.warn(`Email ${cleanEmail} tidak ditemukan di tabel app_users.`);
        setProfile(null);
      }
    } catch (err) {
      console.error('Gagal sinkronisasi data awal auth:', err.message);
      if (cleanEmail) {
        const fallback = localStorage.getItem(`cache_profile_${cleanEmail}`);
        if (fallback) setProfile(JSON.parse(fallback));
      }
    } finally {
      setLoading(false);
    }
  };

  const refreshProfile = async () => {
    lastFetchedEmail.current = null;
    if (user) await initSessionData(user);
  };

  useEffect(() => {
    // 1. Ambil session awal
    supabase.auth.getSession().then(({ data: { session } }) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      initSessionData(currentUser);
    });

    // 2. Pasang listener auth change
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const currentUser = session?.user ?? null;

      if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && currentUser) {
        setUser(currentUser);
        initSessionData(currentUser);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setProfile(null);
        lastFetchedEmail.current = null;
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const logout = async () => {
    if (user?.email) {
      localStorage.removeItem(`cache_profile_${user.email.toLowerCase().trim()}`);
    }
    lastFetchedEmail.current = null;
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      profile, 
      loading, 
      allowAllocation,     
      setAllowAllocation,  
      allowManualMode,      
      setAllowManualMode,
      isMaintenance,        
      logout, 
      refreshProfile 
    }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);