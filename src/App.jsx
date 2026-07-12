import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';

import LoginPage from './pages/LoginPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import Layout from './components/Layout';
import ChatAssistant from './components/ChatAssistant';

const lazyWithRetry = (componentImport) => 
  lazy(async () => {
    try {
      return await componentImport();
    } catch (error) {
      console.error("Versi build baru terdeteksi di server. Memperbarui halaman...", error);
      window.location.reload(true);
      return { default: () => null };
    }
  });

const KabupatenDashboardPage = lazyWithRetry(() => import('./pages/KabupatenDashboardPage'));
const Dashboard = lazyWithRetry(() => import('./pages/Dashboard'));
const AnomaliMonitoringPage = lazyWithRetry(() => import('./pages/AnomaliMonitoringPage'));
const AlokasiPage = lazyWithRetry(() => import('./pages/AlokasiPage'));
const PrioritasPage = lazyWithRetry(() => import('./pages/PrioritasPage'));
const SettingsPage = lazyWithRetry(() => import('./pages/SettingsPage'));
const PMLMonitoringPage = lazyWithRetry(() => import('./pages/PmlMonitoringPage'));
const PclAssignmentPage = lazyWithRetry(() => import('./pages/PclAssignmentPage'));
const DashboardMonitoring = lazyWithRetry(() => import('./pages/DashboardMonitoring'));
const OrangPentingPage = lazyWithRetry(() => import('./pages/OrangPentingPage'));
const OrangPentingFormPublik = lazyWithRetry(() => import('./pages/OrangPentingFormPublik'));
const StatusPage = lazyWithRetry(() => import('./pages/StatusPage'));

// 🧱 Tampilan Halaman Pembatasan Akses Sementara dengan Info Tanggal Buka
// Ganti komponen AccessRestrictedPage lama Anda di App.jsx dengan ini:
const AccessRestrictedPage = ({ message, openedAt }) => {
  const formatTanggal = (isoString) => {
    if (!isoString) return null;
    try {
      const options = { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit',
        timeZoneName: 'short'
      };
      return new Date(isoString).toLocaleDateString('id-ID', options);
    } catch (e) {
      return null;
    }
  };

  const waktuBuka = formatTanggal(openedAt);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-tr from-slate-950 via-slate-900 to-slate-850 p-6">
      {/* Kartu Utama Berbasis Efek Kaca */}
      <div className="max-w-md w-full bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] p-8 rounded-3xl shadow-2xl text-center space-y-6 animate-fadeIn">
        
        {/* Lingkaran Indikator */}
        <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/20 rounded-full flex items-center justify-center mx-auto shadow-inner relative">
          <span className="text-3xl animate-pulse">⏳</span>
          <span className="absolute inset-0 rounded-full border border-amber-500/30 animate-ping opacity-25"></span>
        </div>

        {/* Teks Judul */}
        <div className="space-y-2">
          <h1 className="text-lg font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-400 uppercase">
            Akses Ditutup Sementara
          </h1>
          <div className="w-12 h-0.5 bg-gradient-to-r from-amber-500 to-transparent mx-auto rounded-full" />
        </div>

        {/* Isi Pesan */}
        <p className="text-slate-300 text-sm leading-relaxed font-normal px-2">
          {message || "Halaman ini sedang dinonaktifkan sementara untuk meningkatkan kelancaran sistem. Silakan buka kembali beberapa saat lagi."}
        </p>
        
        {/* Indikator Waktu Pembukaan */}
        {waktuBuka ? (
          <div className="bg-slate-950/60 border border-slate-800/80 p-4 rounded-2xl transition-all">
            <span className="block text-[10px] font-black text-slate-500 uppercase tracking-widest">
              Estimasi Selesai Pemeliharaan:
            </span>
            <span className="block text-xs font-bold text-emerald-400 mt-1.5 font-mono">
              {waktuBuka}
            </span>
          </div>
        ) : (
          <div className="text-[10px] font-mono text-slate-500 tracking-wider">
            ⚙️ Sistem sedang disesuaikan oleh Administrator
          </div>
        )}

        {/* Tombol Segarkan Manual */}
        <button 
          onClick={() => window.location.reload()}
          className="w-full py-2.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-slate-300 hover:text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all active:scale-[0.98] cursor-pointer"
        >
          Perbarui Halaman 🔄
        </button>
      </div>
    </div>
  );
};

const PageLoader = () => (
  <div className="p-10 text-center text-xs font-black uppercase tracking-widest text-slate-400">
    Memuat Komponen Halaman...
  </div>
);

const ProtectedRoute = ({ children, allowedRoles, featureKey }) => {
  const { user, profile, loading, accessControl } = useAuth();
  
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
  
  // 🛡️ INTERCEPTOR 1: Blokir Total per Role di tingkat Route Guard (Kecuali Admin)
  if (profile?.role !== 'admin' && accessControl?.[profile?.role]?.status === 'blocked') {
    return (
      <AccessRestrictedPage 
        message={`Maaf, akses masuk aplikasi untuk petugas ${profile?.role?.toUpperCase()} sedang ditutup sementara waktu untuk menjaga kelancaran sistem.`} 
        openedAt={accessControl?.[profile?.role]?.openedAt}
      />
    );
  }

  // 🛡️ INTERCEPTOR 2: Blokir Parsial Fitur Spesifik (Dashboard Monitoring PML)
  if (profile?.role === 'pml' && featureKey === 'dashboard-monitoring' && accessControl?.pml?.status === 'partial_dashboard') {
    return (
      <AccessRestrictedPage 
        message="Halaman Dashboard Monitoring sedang ditutup sementara untuk meningkatkan kelancaran aplikasi. Anda tetap dapat menggunakan menu utama PML lainnya." 
        openedAt={accessControl?.pml?.openedAt}
      />
    );
  }
  
  // Validasi Hak Akses Standar Route Guard
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
  const { user, profile, loading: authLoading, accessControl } = useAuth();

  if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100">
        <div className="text-sm font-black uppercase tracking-widest text-slate-500 animate-pulse">
          Memeriksa Sesi Sistem...
        </div>
      </div>
    );
  }

  // 🛡️ INTERCEPTOR GLOBAL: Jika role saat ini diblokir total, cegah proses render routing utama
  if (profile?.role !== 'admin' && accessControl?.[profile?.role]?.status === 'blocked') {
    return (
      <AccessRestrictedPage 
        message={`Maaf, akses masuk aplikasi untuk petugas ${profile?.role?.toUpperCase()} sedang ditutup sementara waktu untuk menjaga kelancaran sistem.`} 
        openedAt={accessControl?.[profile?.role]?.openedAt}
      />
    );
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <ChatAssistant />

      <Routes>
        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
        {/* Halaman publik /entrise tetap aman dan tidak terpengaruh karena berada di luar ProtectedRoute */}
        <Route path="/entrise" element={<OrangPentingFormPublik />} />
        
        <Route path="/change-password" element={<ProtectedRoute><ChangePasswordPage /></ProtectedRoute>} />
        
        <Route path="/PML-Monitoring" element={<ProtectedRoute allowedRoles={['pml']}><PMLMonitoringPage /></ProtectedRoute>} />
        <Route path="/PCL-Assignment" element={<ProtectedRoute allowedRoles={['pcl']}><PclAssignmentPage /></ProtectedRoute>} />

        <Route path="/" element={<ProtectedRoute allowedRoles={['admin', 'pegawai', 'pml']}><Layout /></ProtectedRoute>}>
          
          <Route index element={
            profile?.role === 'pml' 
              ? <Navigate to="/PML-Monitoring" replace /> 
              : <Navigate to="/dashboard-monitoring" replace />
          } />
          
          {/* 🌟 PENERAPAN BLOKIR PARSIAL: Mendeteksi restriksi dashboard dengan prop `featureKey` */}
          <Route path="dashboard-monitoring" element={
            <ProtectedRoute allowedRoles={['admin', 'pegawai', 'pml']} featureKey="dashboard-monitoring">
              <DashboardMonitoring />
            </ProtectedRoute>
          } />
          
          <Route path="dashboard-lapangan" element={<ProtectedRoute allowedRoles={['admin', 'pegawai']}><KabupatenDashboardPage /></ProtectedRoute>} />
          <Route path="dashboard-alokasi" element={<ProtectedRoute allowedRoles={['admin', 'pegawai']}><Dashboard /></ProtectedRoute>} />
          <Route path="cek-selisih-muatan" element={<ProtectedRoute allowedRoles={['admin', 'pegawai']}><AnomaliMonitoringPage /></ProtectedRoute>} />
          <Route path="alokasi" element={<ProtectedRoute allowedRoles={['admin', 'pegawai']}><AlokasiPage /></ProtectedRoute>} />
          <Route path="prioritas" element={<ProtectedRoute allowedRoles={['admin', 'pegawai']}><PrioritasPage /></ProtectedRoute>} />
          <Route path="orang-penting" element={<ProtectedRoute allowedRoles={['admin', 'pegawai']}><OrangPentingPage /></ProtectedRoute>} />
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