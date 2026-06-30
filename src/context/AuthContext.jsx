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

  const isInitialFetched = useRef(false);

  // ─── OPTIMASI ULTIMATE: FETCH SEMUA SETTING & PROFILE GABUNGAN ───
  const initSessionData = async (currentUser) => {
    if (isInitialFetched.current) return;
    isInitialFetched.current = true;

    const email = currentUser?.email;
    const cleanEmail = email ? email.toLowerCase().trim() : null;

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
      // 2. TEMBAK 3 KEYS SEKALIGUS (Hemat Egress Masif 🚀)
      const requests = [
        supabase.from('app_settings')
          .select('key, value_boolean')
          .in('key', ['allow_allocation_changes', 'allow_manual_upload', 'is_maintenance']),
      ];

      if (cleanEmail) {
        requests.push(supabase.from('app_users').select('nama_pengguna, role, kecamatan_tugas, is_first_login').eq('email', cleanEmail).maybeSingle());
      }

      const [settingsRes, userRes] = await Promise.all(requests);

      // Pemrosesan Array Setting Gabungan
      if (settingsRes.data) {
        // a. Key: allow_allocation_changes
        const allocSetting = settingsRes.data.find(s => s.key === 'allow_allocation_changes');
        if (allocSetting) {
          setAllowAllocation(allocSetting.value_boolean);
          localStorage.setItem('cache_allow_allocation', JSON.stringify(allocSetting.value_boolean));
        }

        // b. Key: allow_manual_upload
        const manualSetting = settingsRes.data.find(s => s.key === 'allow_manual_upload');
        if (manualSetting) {
          const isAllowed = manualSetting.value_boolean === true;
          setAllowManualMode(isAllowed);
          localStorage.setItem('cache_allow_manual_upload', isAllowed ? 'true' : 'false');
        }

        // c. Key: is_maintenance
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
      }
    } catch (err) {
      console.error('Gagal sinkronisasi data awal auth:', err.message);
      // Fallback local storage
      if (cleanEmail) {
        const fallback = localStorage.getItem(`cache_profile_${cleanEmail}`);
        if (fallback) setProfile(JSON.parse(fallback));
      }
    } finally {
      setLoading(false);
    }
  };

  const refreshProfile = async () => {
    isInitialFetched.current = false;
    if (user) await initSessionData(user);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      initSessionData(currentUser);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const currentUser = session?.user ?? null;

      if (event === 'SIGNED_IN' && currentUser) {
        setUser(currentUser);
        initSessionData(currentUser);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setProfile(null);
        isInitialFetched.current = false;
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const logout = async () => {
    if (user?.email) {
      localStorage.removeItem(`cache_profile_${user.email.toLowerCase().trim()}`);
    }
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      profile, 
      loading, 
      allowAllocation,     
      setAllowAllocation,  
      allowManualMode,       // <--- SEBARKAN KE GLOBAL UI
      setAllowManualMode,
      isMaintenance,         // <--- SEBARKAN KE GLOBAL UI
      logout, 
      refreshProfile 
    }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);