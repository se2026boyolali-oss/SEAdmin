import React, { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { supabase } from './supabaseClient';

import LoginPage from './pages/LoginPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import Layout from './components/Layout';

// 🤖 Impor komponen Chat Assistant AI global
import ChatAssistant from './components/ChatAssistant';

const KabupatenDashboardPage = lazy(() => import('./pages/KabupatenDashboardPage'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const AnomaliMonitoringPage = lazy(() => import('./pages/AnomaliMonitoringPage'));
const AlokasiPage = lazy(() => import('./pages/AlokasiPage'));
const PrioritasPage = lazy(() => import('./pages/PrioritasPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const PmlMonitoringPage = lazy(() => import('./pages/PmlMonitoringPage'));
const PclAssignmentPage = lazy(() => import('./pages/PclAssignmentPage'));
const DashboardMonitoring = lazy(() => import('./pages/DashboardMonitoring'));
const OrangPentingPage = lazy(() => import('./pages/OrangPentingPage'));
const OrangPentingFormPublik = lazy(() => import('./pages/OrangPentingFormPublik'));

// 🧱 Komponen Tampilan Halaman Maintenance
const MaintenancePage = () => (
  <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white p-6 text-center">
    <div className="text-4xl mb-4">⚙️</div>
    <h1 className="text-xl font-black uppercase tracking-wider text-amber-400">Sistem Dalam Pemeliharaan</h1>
    <p className="text-xs text-slate-400 max-w-sm mt-2 font-mono">
      Proses sinkronisasi data dan pemeliharaan server sedang berlangsung. Aplikasi akan segera kembali online. Terima kasih atas kesabaran Anda.
    </p>
  </div>
);

const PageLoader = () => (
  <div className="p-10 text-center text-xs font-black uppercase tracking-widest text-slate-400">
    Memuat Komponen Halaman...
  </div>
);

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, profile, loading } = useAuth();
  
  if (loading) return null; 
  if (!user) return <Navigate to="/login" replace />;
  
  if (profile?.is_first_login && window.location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }
  
  if (profile && allowedRoles && !allowedRoles.includes(profile.role)) {
    if (profile.role === 'pml') return <Navigate to="/PML-Monitoring" replace />;
    if (profile.role === 'pcl') return <Navigate to="/PCL-Assignment" replace />;
    return <Navigate to="/login" replace />;
  }

  if (!profile && allowedRoles && !allowedRoles.includes('pcl') && !allowedRoles.includes('pml')) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
        <div className="text-xs font-bold text-slate-400 animate-spin mb-2">⏳</div>
        <div className="text-[10px] uppercase font-mono tracking-wider text-slate-400">Sinkronisasi Hak Akses...</div>
      </div>
    );
  }
  
  return children;
};

const PublicRoute = ({ children }) => {
  const { user, profile, loading } = useAuth();
  
  if (loading) return null;
  if (user && profile) {
    if (profile.role === 'pcl') return <Navigate to="/PCL-Assignment" replace />;
    if (profile.role === 'pml') return <Navigate to="/PML-Monitoring" replace />;
    return <Navigate to="/dashboard-lapangan" replace />;
  }
  return children;
};

function AppContent() {
  const { user, profile, loading: authLoading } = useAuth();
  const [isMaintenance, setIsMaintenance] = useState(false);
  const [checkingSettings, setCheckingSettings] = useState(true);

  // 🔄 Ambil status maintenance dari database secara real-time
  useEffect(() => {
    async function fetchMaintenanceStatus() {
      try {
        const { data, error } = await supabase
          .from('app_settings')
          .select('value_boolean')
          .eq('key', 'is_maintenance')
          .single();
        
        if (data) {
          setIsMaintenance(data.value_boolean);
        }
      } catch (err) {
        console.error("Gagal memuat konfigurasi sistem:", err);
      } finally {
        setCheckingSettings(false);
      }
    }

    fetchMaintenanceStatus();

    // Opsional: Realtime subscription agar otomatis berubah jika Admin menekan switch on/off
    const settingsSubscription = supabase
      .channel('public:app_settings')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'app_settings', filter: 'key=eq.is_maintenance' }, (payload) => {
        setIsMaintenance(payload.new.value_boolean);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(settingsSubscription);
    };
  }, []);

  if (authLoading || checkingSettings) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100">
        <div className="text-sm font-black uppercase tracking-widest text-slate-500 animate-pulse">
          Memeriksa Sesi Sistem...
        </div>
      </div>
    );
  }

  // 🛡️ INTERCEPTOR MAINTENANCE: Jika sistem dikunci, dan yang login BUKAN Admin, tendang ke halaman Maintenance
  if (isMaintenance && profile?.role !== 'admin') {
    return <MaintenancePage />;
  }

  return (
    <Suspense fallback={<PageLoader />}>
      
      {/* 🤖 Menyuntikkan Chat Assistant AI secara global di semua halaman */}
      {/* Komponen ini otomatis diabaikan jika user belum login di dalam logikanya */}
      <ChatAssistant />

      <Routes>
        {/* Rute Publik Terbuka Bebas Tanpa Login */}
        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
        <Route path="/entrise" element={<OrangPentingFormPublik />} />
        
        <Route path="/change-password" element={<ProtectedRoute><ChangePasswordPage /></ProtectedRoute>} />
        
        {/* Rute Lapangan Mandiri */}
        <Route path="/PML-Monitoring" element={<ProtectedRoute allowedRoles={['pml']}><PmlMonitoringPage /></ProtectedRoute>} />
        <Route path="/PCL-Assignment" element={<ProtectedRoute allowedRoles={['pcl']}><PclAssignmentPage /></ProtectedRoute>} />

        {/* Rute Internal Manajemen - Murni Admin & Pegawai */}
        <Route path="/" element={<ProtectedRoute allowedRoles={['admin', 'pegawai']}><Layout /></ProtectedRoute>}>
          <Route index element={<Navigate to="/dashboard-monitoring" replace />} />
          <Route path="dashboard-lapangan" element={<ProtectedRoute allowedRoles={['admin', 'pegawai']}><KabupatenDashboardPage /></ProtectedRoute>} />
          <Route path="dashboard-alokasi" element={<ProtectedRoute allowedRoles={['admin', 'pegawai']}><Dashboard /></ProtectedRoute>} />
          <Route path="cek-selisih-muatan" element={<ProtectedRoute allowedRoles={['admin', 'pegawai']}><AnomaliMonitoringPage /></ProtectedRoute>} />
          <Route path="alokasi" element={<ProtectedRoute allowedRoles={['admin', 'pegawai']}><AlokasiPage /></ProtectedRoute>} />
          <Route path="prioritas" element={<ProtectedRoute allowedRoles={['admin', 'pegawai']}><PrioritasPage /></ProtectedRoute>} />
          <Route path="dashboard-monitoring" element={<ProtectedRoute allowedRoles={['admin', 'pegawai']}><DashboardMonitoring /></ProtectedRoute>} />
          <Route path="orang-penting" element={<ProtectedRoute allowedRoles={['admin', 'pegawai']}><OrangPentingPage /></ProtectedRoute>} />
          
          <Route path="pengaturan" element={<ProtectedRoute allowedRoles={['admin']}><SettingsPage /></ProtectedRoute>} />
        </Route>

        {/* Wildcard Route */}
        <Route path="*" element={
          !user ? <Navigate to="/login" replace /> :
          profile?.role === 'pcl' ? <Navigate to="/PCL-Assignment" replace /> :
          profile?.role === 'pml' ? <Navigate to="/PML-Monitoring" replace /> :
          <Navigate to="/dashboard-lapangan" replace />
        } />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  );
}