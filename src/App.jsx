// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import AlokasiPage from './pages/AlokasiPage';
import Dashboard from './pages/Dashboard';
import LoginPage from './pages/LoginPage';
import SettingsPage from './pages/SettingsPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import PclAssignmentPage from './pages/PclAssignmentPage';
import PmlMonitoringPage from './pages/PmlMonitoringPage'; 
import PrioritasPage from './pages/PrioritasPage';

// --- KOMPONEN PROTEKSI RUTE (PROTECTED ROUTE) ---
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return <div className="p-10 max-md:p-6 text-center font-bold text-slate-500 max-md:text-sm">Memeriksa Sesi...</div>;
  }

  // 1. Jika belum login, tendang ke halaman login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // 2. Jika baru pertama login dan belum ubah password, paksa ke halaman ubah password
  if (profile?.is_first_login && window.location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  // 3. Jika sudah login tetapi role tidak diizinkan mengakses halaman ini
  if (allowedRoles && profile && !allowedRoles.includes(profile.role)) {
    // Jika PML tersasar ke rute terlarang (seperti rute prioritas), alihkan otomatis ke dasbor monitoring lapangan milik mereka
    if (profile.role === 'pml') {
      return <Navigate to="/PML-Monitoring" replace />;
    }
    // Jika PCL tersasar ke rute terlarang, kembalikan ke halaman tugas mereka
    if (profile.role === 'pcl') {
      return <Navigate to="/PCL-Assignment" replace />;
    }
    // Default alihan untuk role lain
    return <Navigate to="/" replace />;
  }

  return children;
};

// --- KOMPONEN LANDASAN UTAMA (HOME ROUTE ROUTER) ---
const HomeRouter = () => {
  const { profile } = useAuth();

  if (profile?.role === 'pcl') {
    return <Navigate to="/PCL-Assignment" replace />;
  }
  if (profile?.role === 'pml') {
    return <Navigate to="/alokasi" replace />;
  }
  
  // Jika Admin atau Pegawai Organik, arahkan ke halaman Dashboard internal
  return <Dashboard />;
};


function AppContent() {
  return (
    <BrowserRouter>
      <Routes>
        {/* RUTE PUBLIK (Bisa diakses tanpa login) */}
        <Route path="/login" element={<LoginPage />} />

        {/* RUTE UBAH PASSWORD (Harus login dulu, tapi bebas role) */}
        <Route 
          path="/change-password" 
          element={
            <ProtectedRoute>
              <ChangePasswordPage />
            </ProtectedRoute>
          } 
        />

        {/* RUTE TERPROTEKSI UTAMA (Masuk ke dalam Layout) */}
        <Route 
          path="/" 
          element={
            <ProtectedRoute allowedRoles={['admin', 'pegawai', 'pml', 'pcl']}>
              <Layout />
            </ProtectedRoute>
          }
        >
          {/* Index dialihkan menggunakan komponen HomeRouter yang dinamis */}
          <Route 
            index 
            element={
              <ProtectedRoute allowedRoles={['admin', 'pegawai', 'pml', 'pcl']}>
                <HomeRouter />
              </ProtectedRoute>
            } 
          />
          
          {/* Alokasi bisa diakses oleh Admin, Pegawai, dan PML */}
          <Route 
            path="alokasi" 
            element={
              <ProtectedRoute allowedRoles={['admin', 'pegawai', 'pml']}>
                <AlokasiPage />
              </ProtectedRoute>
            } 
          />

          {/* 👇 RUTE BARU: Monitoring SLS Prioritas hanya untuk Pegawai dan Admin */}
          <Route 
            path="prioritas" 
            element={
              <ProtectedRoute allowedRoles={['admin', 'pegawai']}>
                <PrioritasPage />
              </ProtectedRoute>
            } 
          />
          
          {/* Pengaturan hanya eksklusif untuk Admin */}
          <Route 
            path="pengaturan" 
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <SettingsPage />
              </ProtectedRoute>
            } 
          />

          {/* Rute Khusus untuk PCL Assignment */}
          <Route 
            path="PCL-Assignment" 
            element={
              <ProtectedRoute allowedRoles={['pcl']}>
                <PclAssignmentPage />
              </ProtectedRoute>
            } 
          />

          {/* Rute Khusus untuk PML Monitoring Lapangan Harian */}
          <Route 
            path="PML-Monitoring" 
            element={
              <ProtectedRoute allowedRoles={['pml']}>
                <PmlMonitoringPage />
              </ProtectedRoute>
            } 
          />
        </Route>

        {/* CATCH ALL: Jika mengetik rute ngawur, kembalikan ke home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}