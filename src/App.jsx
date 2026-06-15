import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';

// 1. Core Pages (Impor biasa karena langsung diakses di awal)
import LoginPage from './pages/LoginPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import Layout from './components/Layout';

// 2. LAZY LOADING COMPONENT CHUNKS (Halaman berat di-import hanya jika dibutuhkan)
const KabupatenDashboardPage = lazy(() => import('./pages/KabupatenDashboardPage'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const AnomaliMonitoringPage = lazy(() => import('./pages/AnomaliMonitoringPage'));
const AlokasiPage = lazy(() => import('./pages/AlokasiPage'));
const PrioritasPage = lazy(() => import('./pages/PrioritasPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const PmlMonitoringPage = lazy(() => import('./pages/PmlMonitoringPage'));
const PclAssignmentPage = lazy(() => import('./pages/PclAssignmentPage'));

// Komponen Loading Skeleton mini untuk transisi antar halaman lazy load
const PageLoader = () => (
  <div className="p-10 text-center text-xs font-black uppercase tracking-widest text-slate-400">
    Memuat Komponen Halaman...
  </div>
);

// Gerbang Pelindung Rute Privat (Hanya untuk yang sudah login)
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, profile, loading } = useAuth();
  
  if (loading) return null; // Ditangani oleh loader global, tapi amankan dengan null
  if (!user) return <Navigate to="/login" replace />;
  
  if (profile?.is_first_login && window.location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }
  
  if (allowedRoles && profile && !allowedRoles.includes(profile.role)) {
    if (profile.role === 'pml') return <Navigate to="/PML-Monitoring" replace />;
    if (profile.role === 'pcl') return <Navigate to="/PCL-Assignment" replace />;
    return <Navigate to="/" replace />;
  }
  return children;
};

// 🛠️ TAMBAHAN BARU: Gerbang Pelindung Rute Publik (Mencegah user yang sudah login masuk ke halaman login lagi)
const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) return null;
  if (user) return <Navigate to="/" replace />; // Jika sudah login, tendang ke halaman utama
  return children;
};

const HomeRouter = () => {
  const { profile } = useAuth();
  if (profile?.role === 'pcl') return <Navigate to="/PCL-Assignment" replace />;
  if (profile?.role === 'pml') return <Navigate to="/PML-Monitoring" replace />;
  return <Navigate to="/dashboard-lapangan" replace />;
};

function AppContent() {
  const { loading } = useAuth();

  // 🛠️ PERBAIKAN UTAMA: Tahan aplikasi di sini sampai status authentikasi Supabase selesai dicek
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100">
        <div className="text-sm font-black uppercase tracking-widest text-slate-500 animate-pulse">
          Memeriksa Sesi Sistem...
        </div>
      </div>
    );
  }

  return (
    /* Suspense akan menangkap transisi lazy loading halaman tanpa merusak UI */
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Halaman login dilindungi oleh PublicRoute agar tidak konflik dengan sesi aktif */}
        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
        
        <Route path="/change-password" element={<ProtectedRoute><ChangePasswordPage /></ProtectedRoute>} />
        
        {/* Rute Lapangan Mandiri */}
        <Route path="/PML-Monitoring" element={<ProtectedRoute allowedRoles={['pml']}><PmlMonitoringPage /></ProtectedRoute>} />
        <Route path="/PCL-Assignment" element={<ProtectedRoute allowedRoles={['pcl']}><PclAssignmentPage /></ProtectedRoute>} />

        {/* Rute Internal & Manajemen Organisasi */}
        <Route path="/" element={<ProtectedRoute allowedRoles={['admin', 'pegawai', 'pml', 'pcl']}><Layout /></ProtectedRoute>}>
          <Route index element={<ProtectedRoute allowedRoles={['admin', 'pegawai', 'pml', 'pcl']}><HomeRouter /></ProtectedRoute>} />
          
          <Route path="dashboard-lapangan" element={<ProtectedRoute allowedRoles={['admin', 'pegawai']}><KabupatenDashboardPage /></ProtectedRoute>} />
          <Route path="dashboard-alokasi" element={<ProtectedRoute allowedRoles={['admin', 'pegawai']}><Dashboard /></ProtectedRoute>} />
          <Route path="cek-selisih-muatan" element={<ProtectedRoute allowedRoles={['admin', 'pegawai']}><AnomaliMonitoringPage /></ProtectedRoute>} />
          <Route path="alokasi" element={<ProtectedRoute allowedRoles={['admin', 'pegawai']}><AlokasiPage /></ProtectedRoute>} />
          <Route path="prioritas" element={<ProtectedRoute allowedRoles={['admin', 'pegawai']}><PrioritasPage /></ProtectedRoute>} />
          <Route path="pengaturan" element={<ProtectedRoute allowedRoles={['admin']}><SettingsPage /></ProtectedRoute>} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    /* 🛠️ PERBAIKAN POSISI: BrowserRouter diletakkan di level tertinggi membungkus semua komponen */
    <BrowserRouter>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  );
}