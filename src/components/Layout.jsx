// src/components/Layout.jsx
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { Users, Map, BarChart3, Settings, LogOut, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, logout } = useAuth();

  // Definisikan semua menu yang mungkin ada
  const allMenuItems = [
    { name: 'Dashboard', path: '/', icon: BarChart3, roles: ['admin', 'pegawai'] },
    { name: 'Alokasi Petugas', path: '/alokasi', icon: Map, roles: ['admin', 'pegawai', 'pml'] },
    { name: 'Pengaturan', path: '/pengaturan', icon: Settings, roles: ['admin'] },
  ];

  // Filter menu berdasarkan role user yang sedang login
  // Jika profile belum termuat, default ke list kosong []
  const allowedMenuItems = allMenuItems.filter(item => 
    profile?.role && item.roles.includes(profile.role)
  );

  const handleLogout = async () => {
    if (window.confirm("Apakah Anda yakin ingin keluar dari aplikasi?")) {
      await logout();
      navigate('/login');
    }
  };

  return (
    <div className="flex h-screen w-full bg-slate-50">
      
      {/* SIDEBAR */}
      <div className="w-64 bg-slate-900 text-white flex flex-col transition-all">
        {/* Brand Header */}
        <div className="p-5 font-bold text-xl border-b border-slate-800 text-emerald-400 flex flex-col">
          <span>SE2026 Admin</span>
          <span className="text-[10px] text-slate-400 font-medium tracking-wider uppercase mt-1">
            Kab. Boyolali
          </span>
        </div>
        
        {/* Navigasi Menu Sesuai Hak Akses */}
        <nav className="flex-1 px-3 py-4 space-y-2">
          {allowedMenuItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.name}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                  isActive 
                    ? 'bg-emerald-600 text-white' 
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon size={20} />
                <span className="font-medium text-sm">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* Informasi Akun & Tombol Keluar di Bagian Bawah Sidebar */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/40 flex flex-col gap-2">
          <div className="flex items-center gap-2.5 px-2 py-1">
            <div className="p-1.5 bg-slate-800 text-slate-300 rounded-lg">
              <User size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-slate-200 truncate uppercase">
                {profile?.nama_pengguna || 'User'}
              </p>
              <p className="text-[10px] text-emerald-400 font-semibold uppercase tracking-tight">
                Role: {profile?.role}
              </p>
            </div>
          </div>
          
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-rose-400 hover:bg-rose-950/30 hover:text-rose-300 rounded-md transition-colors mt-1"
          >
            <LogOut size={18} />
            <span>Keluar Aplikasi</span>
          </button>
        </div>
      </div>

      {/* AREA KONTEN UTAMA */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header Atas */}
        <header className="h-14 bg-white border-b flex items-center justify-between px-6 shadow-sm">
          <h1 className="font-bold text-slate-700 text-sm md:text-base tracking-wide">
            MANAJEMEN SE2026 BPS KABUPATEN BOYOLALI
          </h1>
          
          {/* Badge Wilayah Tugas Khusus PML */}
          {profile?.role === 'pml' && profile?.kecamatan_tugas && (
            <div className="bg-indigo-50 border border-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-tight">
              Wilayah: {profile.kecamatan_tugas}
            </div>
          )}
        </header>

        {/* Area Render Halaman */}
        <main className="flex-1 overflow-auto p-6">
          <Outlet /> 
        </main>
      </div>

    </div>
  );
}