import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import AlokasiPage from './pages/AlokasiPage';
import Dashboard from './pages/Dashboard'; // Dashboard Lama
import KabupatenDashboardPage from './pages/KabupatenDashboardPage'; // Dashboard Baru
import LoginPage from './pages/LoginPage';
import SettingsPage from './pages/SettingsPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import PclAssignmentPage from './pages/PclAssignmentPage';
import PmlMonitoringPage from './pages/PmlMonitoringPage'; 
import PrioritasPage from './pages/PrioritasPage';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, profile, loading } = useAuth();
  if (loading) return <div className="p-10 text-center font-bold text-slate-500">Memeriksa Sesi...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (profile?.is_first_login && window.location.pathname !== '/change-password') return <Navigate to="/change-password" replace />;
  
  if (allowedRoles && profile && !allowedRoles.includes(profile.role)) {
    if (profile.role === 'pml') return <Navigate to="/PML-Monitoring" replace />;
    if (profile.role === 'pcl') return <Navigate to="/PCL-Assignment" replace />;
    return <Navigate to="/" replace />;
  }
  return children;
};

const HomeRouter = () => {
  const { profile } = useAuth();
  if (profile?.role === 'pcl') return <Navigate to="/PCL-Assignment" replace />;
  if (profile?.role === 'pml') return <Navigate to="/PML-Monitoring" replace />;
  // Arahkan Admin & Pegawai ke Dashboard Baru
  return <Navigate to="/dashboard-lapangan" replace />;
};

function AppContent() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/change-password" element={<ProtectedRoute><ChangePasswordPage /></ProtectedRoute>} />
        
        {/* Rute Lapangan */}
        <Route path="/PML-Monitoring" element={<ProtectedRoute allowedRoles={['pml']}><PmlMonitoringPage /></ProtectedRoute>} />
        <Route path="/PCL-Assignment" element={<ProtectedRoute allowedRoles={['pcl']}><PclAssignmentPage /></ProtectedRoute>} />

        {/* Rute Internal */}
        <Route path="/" element={<ProtectedRoute allowedRoles={['admin', 'pegawai', 'pml', 'pcl']}><Layout /></ProtectedRoute>}>
          <Route index element={<ProtectedRoute allowedRoles={['admin', 'pegawai', 'pml', 'pcl']}><HomeRouter /></ProtectedRoute>} />
          
          <Route path="dashboard-lapangan" element={<ProtectedRoute allowedRoles={['admin', 'pegawai']}><KabupatenDashboardPage /></ProtectedRoute>} />
          <Route path="dashboard-alokasi" element={<ProtectedRoute allowedRoles={['admin', 'pegawai']}><Dashboard /></ProtectedRoute>} />
          <Route path="alokasi" element={<ProtectedRoute allowedRoles={['admin', 'pegawai', 'pml']}><AlokasiPage /></ProtectedRoute>} />
          <Route path="prioritas" element={<ProtectedRoute allowedRoles={['admin', 'pegawai']}><PrioritasPage /></ProtectedRoute>} />
          <Route path="pengaturan" element={<ProtectedRoute allowedRoles={['admin']}><SettingsPage /></ProtectedRoute>} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default function App() {
  return <AuthProvider><AppContent /></AuthProvider>;
}