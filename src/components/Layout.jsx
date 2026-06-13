import { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { Users, Map, BarChart3, Settings, LogOut, User, Menu, X, ShieldAlert, PieChart, ChevronDown } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, logout } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAlokasiOpen, setIsAlokasiOpen] = useState(false);

  const allMenuItems = [
    { name: 'Pemantauan Lapangan', path: '/dashboard-lapangan', icon: BarChart3, roles: ['admin', 'pegawai'] },
    { name: 'Dashboard Alokasi', path: '/dashboard-alokasi', icon: PieChart, roles: ['admin', 'pegawai'] },
    { name: 'Alokasi Petugas', path: '/alokasi', icon: Map, roles: ['admin', 'pegawai', 'pml'] },
    { name: 'SLS Prioritas', path: '/prioritas', icon: ShieldAlert, roles: ['admin', 'pegawai'] },
    { name: 'Pengaturan', path: '/pengaturan', icon: Settings, roles: ['admin'] },
    { name: 'PCL Assignment', path: '/PCL-Assignment', icon: Users, roles: ['pcl'] },
  ];

  const allowedMenuItems = allMenuItems.filter(item => profile?.role && item.roles.includes(profile.role));
  const isPcl = profile?.role === 'pcl';

  const handleLogout = async () => {
    if (window.confirm("Apakah Anda yakin ingin keluar?")) {
      await logout();
      navigate('/login');
    }
  };

  // Komponen Sidebar agar tidak duplikasi kode
  const SidebarContent = ({ isMobile = false }) => (
    <div className="flex flex-col h-full bg-slate-900 text-white">
      <div className="p-5 border-b border-slate-800">
        <h2 className="font-black text-emerald-400 text-lg">SE2026 Admin</h2>
        <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-1">Kab. Boyolali</p>
      </div>

<nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
  {/* 1. Menu Utama: Pemantauan Lapangan (Bukan Accordion) */}
  {allowedMenuItems
    .filter(item => item.path === '/dashboard-lapangan')
    .map(item => {
      const Icon = item.icon;
      const isActive = location.pathname === item.path;
      return (
        <Link key={item.name} to={item.path} onClick={() => isMobile && setIsMobileMenuOpen(false)}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all ${isActive ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
          <Icon size={18} /> {item.name}
        </Link>
      );
    })}

  {/* 2. Menu Accordion: Alokasi (Tepat di bawah Pemantauan) */}
  {(profile?.role === 'admin' || profile?.role === 'pegawai') && (
    <div className="space-y-1">
      <button 
        onClick={() => setIsAlokasiOpen(!isAlokasiOpen)}
        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-bold transition-all ${isAlokasiOpen ? 'text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
      >
        <div className="flex items-center gap-3">
          <Map size={18} /> Alokasi
        </div>
        <ChevronDown size={16} className={`transition-transform ${isAlokasiOpen ? 'rotate-180' : ''}`} />
      </button>
      
      {isAlokasiOpen && (
        <div className="pl-6 space-y-1 animate-in slide-in-from-top-2">
          <Link to="/dashboard-alokasi" onClick={() => isMobile && setIsMobileMenuOpen(false)}
            className="block px-3 py-2 text-xs font-medium text-slate-400 hover:text-emerald-400 transition-colors">
            • Dashboard Alokasi
          </Link>
          <Link to="/alokasi" onClick={() => isMobile && setIsMobileMenuOpen(false)}
            className="block px-3 py-2 text-xs font-medium text-slate-400 hover:text-emerald-400 transition-colors">
            • Daftar Penugasan
          </Link>
        </div>
      )}
    </div>
  )}

  {/* 3. Menu Sisa: Prioritas & Pengaturan */}
  {allowedMenuItems
    .filter(item => !['/dashboard-lapangan', '/dashboard-alokasi', '/alokasi'].includes(item.path))
    .map(item => {
      const Icon = item.icon;
      const isActive = location.pathname === item.path;
      return (
        <Link key={item.name} to={item.path} onClick={() => isMobile && setIsMobileMenuOpen(false)}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all ${isActive ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
          <Icon size={18} /> {item.name}
        </Link>
      );
    })}
</nav>

      <div className="p-4 border-t border-slate-800 bg-slate-950">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-slate-800 rounded-lg"><User size={16} /></div>
          <div className="text-xs truncate">
            <p className="font-bold">{profile?.nama_pengguna}</p>
            <p className="text-[10px] text-emerald-400 uppercase">{profile?.role}</p>
          </div>
        </div>
        <button onClick={handleLogout} className="flex items-center gap-2 text-rose-400 text-xs font-bold w-full p-2 hover:bg-rose-950/30 rounded-lg">
          <LogOut size={16} /> Keluar
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen w-full bg-slate-50">
      {/* Mobile Drawer */}
      {isMobileMenuOpen && !isPcl && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)} />
          <div className="relative w-64 h-full"><SidebarContent isMobile /></div>
        </div>
      )}

      {/* Desktop Sidebar */}
      {!isPcl && <div className="hidden md:block w-64 shrink-0"><SidebarContent /></div>}

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 bg-white border-b flex items-center justify-between px-4 shadow-sm z-10">
          <div className="flex items-center gap-3">
            {!isPcl && (
              <button onClick={() => setIsMobileMenuOpen(true)} className="md:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-lg">
                <Menu size={20} />
              </button>
            )}
            <h1 className="font-black text-slate-700 text-xs md:text-sm uppercase tracking-wider">
              {isPcl ? 'Sensus Ekonomi 2026' : 'MANAJEMEN SE2026 BPS KABUPATEN BOYOLALI'}
            </h1>
          </div>
          
          {profile?.role === 'pml' && (
            <div className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-[10px] font-black uppercase">
              Wilayah: {profile.kecamatan_tugas}
            </div>
          )}
        </header>

        <main className="flex-1 overflow-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}