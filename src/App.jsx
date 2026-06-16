import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';

import LoginPage from './pages/LoginPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import Layout from './components/Layout';

const KabupatenDashboardPage = lazy(() => import('./pages/KabupatenDashboardPage'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const AnomaliMonitoringPage = lazy(() => import('./pages/AnomaliMonitoringPage'));
const AlokasiPage = lazy(() => import('./pages/AlokasiPage'));
const PrioritasPage = lazy(() => import('./pages/PrioritasPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const PmlMonitoringPage = lazy(() => import('./pages/PmlMonitoringPage'));
const PclAssignmentPage = lazy(() => import('./pages/PclAssignmentPage'));

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
  const { user, profile, loading } = useAuth();

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
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
        <Route path="/change-password" element={<ProtectedRoute><ChangePasswordPage /></ProtectedRoute>} />
        
        {/* Rute Lapangan Mandiri */}
        <Route path="/PML-Monitoring" element={<ProtectedRoute allowedRoles={['pml']}><PmlMonitoringPage /></ProtectedRoute>} />
        <Route path="/PCL-Assignment" element={<ProtectedRoute allowedRoles={['pcl']}><PclAssignmentPage /></ProtectedRoute>} />

        {/* Rute Internal Manajemen - Murni Admin & Pegawai */}
        <Route path="/" element={<ProtectedRoute allowedRoles={['admin', 'pegawai']}><Layout /></ProtectedRoute>}>
          <Route index element={<Navigate to="/dashboard-lapangan" replace />} />
          <Route path="dashboard-lapangan" element={<ProtectedRoute allowedRoles={['admin', 'pegawai']}><KabupatenDashboardPage /></ProtectedRoute>} />
          <Route path="dashboard-alokasi" element={<ProtectedRoute allowedRoles={['admin', 'pegawai']}><Dashboard /></ProtectedRoute>} />
          <Route path="cek-selisih-muatan" element={<ProtectedRoute allowedRoles={['admin', 'pegawai']}><AnomaliMonitoringPage /></ProtectedRoute>} />
          <Route path="alokasi" element={<ProtectedRoute allowedRoles={['admin', 'pegawai']}><AlokasiPage /></ProtectedRoute>} />
          <Route path="prioritas" element={<ProtectedRoute allowedRoles={['admin', 'pegawai']}><PrioritasPage /></ProtectedRoute>} />
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