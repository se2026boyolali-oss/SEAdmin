// src/components/Layout.jsx
import { useState } from 'react'; // 1. TAMBAHKAN USESTATE UNTUK MENU MOBILE
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { Users, Map, BarChart3, Settings, LogOut, User, Menu, X, ShieldAlert } from 'lucide-react'; // 💡 IMPORT SHIELDALERT DISINI
import { useAuth } from '../context/AuthContext';

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, logout } = useAuth();
  
  // State untuk mengontrol buka-tutup sidebar versi handphone
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Definisikan semua menu yang mungkin ada
  const allMenuItems = [
    { name: 'Dashboard', path: '/', icon: BarChart3, roles: ['admin', 'pegawai'] },
    { name: 'Alokasi Petugas', path: '/alokasi', icon: Map, roles: ['admin', 'pegawai', 'pml'] },
    // 👇 MENU BARU: MONITORING SLS PRIORITAS (Hanya untuk Admin & Pegawai)
    { name: 'SLS Prioritas', path: '/prioritas', icon: ShieldAlert, roles: ['admin', 'pegawai'] },
    { name: 'Pengaturan', path: '/pengaturan', icon: Settings, roles: ['admin'] },
    { name: 'PCL Assignment', path: '/PCL-Assignment', icon: Users, roles: ['pcl'] },
  ];

  // Filter menu berdasarkan role user yang sedang login
  const allowedMenuItems = allMenuItems.filter(item => 
    profile?.role && item.roles.includes(profile.role)
  );

  const handleLogout = async () => {
    if (window.confirm("Apakah Anda yakin ingin keluar dari aplikasi?")) {
      await logout();
      navigate('/login');
    }
  };

  // KONDISI PENENTU HIDE SIDEBAR: Apakah user merupakan PCL?
  const isPcl = profile?.role === 'pcl';

  return (
    <div className="flex h-screen w-full bg-slate-50 relative">
      
      {/* ========================================================================= */}
      {/* 3. MOBILE SIDEBAR (DRAWER OVERLAY) - HANYA UNTUK NON-PCL DI LAYAR MOBILE */}
      {/* ========================================================================= */}
      {!isPcl && isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          {/* Latar belakang gelap transparan (Backdrop) */}
          <div 
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          
          {/* Konten Menu Geser */}
          <div className="relative w-64 bg-slate-900 text-white flex flex-col h-full shadow-xl">
            {/* Tombol Tutup Menu (X) */}
            <button 
              onClick={() => setIsMobileMenuOpen(false)}
              className="absolute top-4 right-4 p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
            >
              <X size={20} />
            </button>

            {/* Brand Header Mobile */}
            <div className="p-5 font-bold text-xl border-b border-slate-800 text-emerald-400 flex flex-col">
              <span>SE2026 Admin</span>
              <span className="text-[10px] text-slate-400 font-medium tracking-wider uppercase mt-1">
                Kab. Boyolali
              </span>
            </div>
            
            {/* Navigasi Menu Mobile */}
            <nav className="flex-1 px-3 py-4 space-y-2 overflow-y-auto">
              {allowedMenuItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.name}
                    to={item.path}
                    onClick={() => setIsMobileMenuOpen(false)} // Otomatis tutup menu setelah klik
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

            {/* Profil & Logout Mobile */}
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
        </div>
      )}

      {/* ========================================================================= */}
      {/* SIDEBAR ORIGINAL DESKTOP: Ditambahkan `max-md:hidden` agar lenyap di HP */}
      {/* ========================================================================= */}
      {!isPcl && (
        <div className="w-64 bg-slate-900 text-white flex flex-col transition-all shrink-0 max-md:hidden">
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

          {/* Informasi Akun & Tombol Keluar */}
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
      )}

      {/* ========================================================================= */}
      {/* AREA KONTEN UTAMA & HEADER */}
      {/* ========================================================================= */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header Atas */}
        <header className="h-14 bg-white border-b flex items-center justify-between px-4 sm:px-6 shadow-sm shrink-0">
          
          {/* Kombinasi Hamburger Button + Judul */}
          <div className="flex items-center gap-2 min-w-0">
            {/* 4. TOMBOL HAMBURGER: Hanya muncul untuk non-PCL di layar HP */}
            {!isPcl && (
              <button 
                onClick={() => setIsMobileMenuOpen(true)}
                className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg md:hidden shrink-0"
              >
                <Menu size={20} />
              </button>
            )}
            <h1 className="font-bold text-slate-700 text-xs md:text-base tracking-wide uppercase truncate max-w-[180px] sm:max-w-none">
              {isPcl ? 'Sensus Ekonomi 2026' : 'MANAJEMEN SE2026 BPS KABUPATEN BOYOLALI'}
            </h1>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Badge Wilayah Tugas Khusus PML */}
            {profile?.role === 'pml' && profile?.kecamatan_tugas && (
              <div className="bg-indigo-50 border border-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-tight max-md:text-[10px] max-md:px-2">
                Wilayah: {profile.kecamatan_tugas}
              </div>
            )}

            {/* TOMBOL LOGOUT KHUSUS PCL */}
            {isPcl && (
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-600 hover:text-white rounded-xl transition-all shadow-sm"
              >
                <LogOut size={14} />
                <span>Keluar</span>
              </button>
            )}
          </div>
        </header>

        {/* Area Render Halaman */}
        <main className="flex-1 overflow-auto p-4 sm:p-6 max-md:p-3">
          <Outlet /> 
        </main>
      </div>

    </div>
  );
}