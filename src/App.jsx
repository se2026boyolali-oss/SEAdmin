// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import AlokasiPage from './pages/AlokasiPage';
import Dashboard from './pages/Dashboard';
import LoginPage from './pages/LoginPage';
import SettingsPage from './pages/SettingsPage';
import ChangePasswordPage from './pages/ChangePasswordPage';

// --- KOMPONEN PROTEKSI RUTE (PROTECTED ROUTE) ---
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return <div className="p-10 text-center font-bold text-slate-500">Memeriksa Sesi...</div>;
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
    // Jika PML tersasar, alihkan otomatis ke halaman alokasi milik mereka
    if (profile.role === 'pml') {
      return <Navigate to="/alokasi" replace />;
    }
    // Default alihan untuk role lain yang salah alamat
    return <Navigate to="/" replace />;
  }

  return children;
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
            <ProtectedRoute allowedRoles={['admin', 'pegawai', 'pml']}>
              <Layout />
            </ProtectedRoute>
          }
        >
          {/* Dashboard hanya untuk Admin dan Pegawai */}
          <Route 
            index 
            element={
              <ProtectedRoute allowedRoles={['admin', 'pegawai']}>
                <Dashboard />
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
          
          {/* Pengaturan hanya eksklusif untuk Admin */}
          <Route 
            path="pengaturan" 
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <SettingsPage />
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