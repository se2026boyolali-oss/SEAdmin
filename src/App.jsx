import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';

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
const PMLMonitoringPage = lazy(() => import('./pages/PmlMonitoringPage'));
const PclAssignmentPage = lazy(() => import('./pages/PclAssignmentPage'));
const DashboardMonitoring = lazy(() => import('./pages/DashboardMonitoring'));
const OrangPentingPage = lazy(() => import('./pages/OrangPentingPage'));
const OrangPentingFormPublik = lazy(() => import('./pages/OrangPentingFormPublik'));

// 🚀 LAZY LOAD UNTUK HALAMAN AUDIT SCANNER BARU
const StatusPage = lazy(() => import('./pages/StatusPage'));

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
  
  if (user && !profile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
        <div className="text-xs font-bold text-indigo-600 animate-spin mb-2">⏳</div>
        <div className="text-[10px] uppercase font-mono tracking-wider text-slate-400">Sinkronisasi Hak Akses...</div>
      </div>
    );
  }
  
  if (profile?.is_first_login && window.location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }
  
  // 🛡️ MODIFIKASI DI SINI: Validasi Role Guard
  if (profile && allowedRoles && !allowedRoles.includes(profile.role)) {
    if (profile.role === 'pml') return <Navigate to="/PML-Monitoring" replace />;
    if (profile.role === 'pcl') return <Navigate to="/PCL-Assignment" replace />;
    return <Navigate to="/login" replace />;
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
  // ─── OPTIMASI MASTER: AMBIL DATA MAINTENANCE LANGSUNG DARI CONTEXT ───
  const { user, profile, loading: authLoading, isMaintenance } = useAuth();

  if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100">
        <div className="text-sm font-black uppercase tracking-widest text-slate-500 animate-pulse">
          Memeriksa Sesi Sistem...
        </div>
      </div>
    );
  }

  // 🛡️ INTERCEPTOR MAINTENANCE: Jika dikunci, non-admin langsung ditendang
  if (isMaintenance && profile?.role !== 'admin') {
    return <MaintenancePage />;
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <ChatAssistant />

      <Routes>
        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
        <Route path="/entrise" element={<OrangPentingFormPublik />} />
        
        <Route path="/change-password" element={<ProtectedRoute><ChangePasswordPage /></ProtectedRoute>} />
        
        <Route path="/PML-Monitoring" element={<ProtectedRoute allowedRoles={['pml']}><PMLMonitoringPage /></ProtectedRoute>} />
        <Route path="/PCL-Assignment" element={<ProtectedRoute allowedRoles={['pcl']}><PclAssignmentPage /></ProtectedRoute>} />

        {/* 🌟 1. Izinkan PML masuk ke Layout Utama */}
        <Route path="/" element={<ProtectedRoute allowedRoles={['admin', 'pegawai', 'pml']}><Layout /></ProtectedRoute>}>
          
          {/* 🌟 2. Logika Redirect Root (/) secara dinamis berdasarkan Role */}
          <Route index element={
            profile?.role === 'pml' 
              ? <Navigate to="/PML-Monitoring" replace /> 
              : <Navigate to="/dashboard-monitoring" replace />
          } />
          
          {/* 🌟 3. Beri hak akses 'pml' khusus untuk halaman Dashboard Monitoring */}
          <Route path="dashboard-monitoring" element={<ProtectedRoute allowedRoles={['admin', 'pegawai', 'pml']}><DashboardMonitoring /></ProtectedRoute>} />
          
          {/* Menu-menu di bawah ini tetap dikunci hanya untuk admin dan pegawai */}
          <Route path="dashboard-lapangan" element={<ProtectedRoute allowedRoles={['admin', 'pegawai']}><KabupatenDashboardPage /></ProtectedRoute>} />
          <Route path="dashboard-alokasi" element={<ProtectedRoute allowedRoles={['admin', 'pegawai']}><Dashboard /></ProtectedRoute>} />
          <Route path="cek-selisih-muatan" element={<ProtectedRoute allowedRoles={['admin', 'pegawai']}><AnomaliMonitoringPage /></ProtectedRoute>} />
          <Route path="alokasi" element={<ProtectedRoute allowedRoles={['admin', 'pegawai']}><AlokasiPage /></ProtectedRoute>} />
          <Route path="prioritas" element={<ProtectedRoute allowedRoles={['admin', 'pegawai']}><PrioritasPage /></ProtectedRoute>} />
          <Route path="orang-penting" element={<ProtectedRoute allowedRoles={['admin', 'pegawai']}><OrangPentingPage /></ProtectedRoute>} />
          
          {/* 🔓 HALAMAN BARU: Bisa diakses oleh role 'admin' dan 'pegawai' */}
          <Route path="rekap-status" element={<ProtectedRoute allowedRoles={['admin', 'pegawai']}><StatusPage /></ProtectedRoute>} />
          
          <Route path="pengaturan" element={<ProtectedRoute allowedRoles={['admin']}><SettingsPage /></ProtectedRoute>} />
        </Route>

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