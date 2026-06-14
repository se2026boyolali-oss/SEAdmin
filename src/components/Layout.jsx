import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { Users, Map, BarChart3, Settings, LogOut, User, Menu, X, ShieldAlert, PieChart, ChevronDown, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, logout } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // Otomatis buka accordion hanya jika admin/pegawai sedang berada di dalam sub-menu alokasi
  const [isAlokasiOpen, setIsAlokasiOpen] = useState(
    ['/dashboard-alokasi', '/alokasi'].includes(location.pathname)
  );

  useEffect(() => {
    if (['/dashboard-alokasi', '/alokasi'].includes(location.pathname)) {
      setIsAlokasiOpen(true);
    }
  }, [location.pathname]);

  const allMenuItems = [
    { name: 'Pemantauan Lapangan', path: '/dashboard-lapangan', icon: BarChart3, roles: ['admin', 'pegawai'] },
    { name: 'Cek Selisih Muatan', path: '/cek-selisih-muatan', icon: AlertTriangle, roles: ['admin', 'pegawai'] },
    { name: 'Dashboard Alokasi', path: '/dashboard-alokasi', icon: PieChart, roles: ['admin', 'pegawai'] },
    { name: 'Alokasi Petugas', path: '/alokasi', icon: Map, roles: ['admin', 'pegawai'] }, // 🔴 PML DIHAPUS DARI SINI
    { name: 'SLS Prioritas', path: '/prioritas', icon: ShieldAlert, roles: ['admin', 'pegawai'] },
    { name: 'Pengaturan', path: '/pengaturan', icon: Settings, roles: ['admin'] },
    { name: 'PCL Assignment', path: '/PCL-Assignment', icon: Users, roles: ['pcl'] },
  ];

  const allowedMenuItems = allMenuItems.filter(item => profile?.role && item.roles.includes(profile.role));
  const isPcl = profile?.role === 'pcl';

  // Proteksi Accordion: Hanya render jika user adalah admin atau pegawai
  const isAdminOrPegawai = ['admin', 'pegawai'].includes(profile?.role);

  const handleLogout = async () => {
    if (window.confirm("Apakah Anda yakin ingin keluar?")) {
      await logout();
      navigate('/login');
    }
  };

  // Komponen Sidebar
  const SidebarContent = ({ isMobile = false }) => (
    <div className="flex flex-col h-full bg-slate-900 text-white">
      <div className="p-5 border-b border-slate-800 flex justify-between items-center">
        <div>
          <h2 className="font-black text-emerald-400 text-lg">SE2026 Admin</h2>
          <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-1">MANAJEMEN SENSUS EKONOMI 2026</p>
        </div>
        {isMobile && (
          <button onClick={() => setIsMobileMenuOpen(false)} className="p-1 text-slate-400 hover:text-white md:hidden">
            <X size={20} />
          </button>
        )}
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {/* 1. Menu Utama */}
        {allowedMenuItems
          .filter(item => ['/dashboard-lapangan', '/cek-selisih-muatan'].includes(item.path))
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

        {/* 2. Menu Accordion Alokasi: Murni hanya untuk Manajemen Internal */}
        {isAdminOrPegawai && (
          <div className="space-y-1">
            <button 
              onClick={() => setIsAlokasiOpen(!isAlokasiOpen)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-bold transition-all ${isAlokasiOpen ? 'text-white bg-slate-800/40' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
            >
              <div className="flex items-center gap-3">
                <Map size={18} /> Alokasi
              </div>
              <ChevronDown size={16} className={`transition-transform ${isAlokasiOpen ? 'rotate-180' : ''}`} />
            </button>
            
            {isAlokasiOpen && (
              <div className="pl-6 space-y-1 animate-in slide-in-from-top-2 duration-150">
                <Link to="/dashboard-alokasi" onClick={() => isMobile && setIsMobileMenuOpen(false)}
                  className={`block px-3 py-2 text-xs font-bold rounded-lg transition-colors ${location.pathname === '/dashboard-alokasi' ? 'text-emerald-400 bg-slate-800/20' : 'text-slate-400 hover:text-emerald-400'}`}>
                  • Dashboard Alokasi
                </Link>
                <Link to="/alokasi" onClick={() => isMobile && setIsMobileMenuOpen(false)}
                  className={`block px-3 py-2 text-xs font-bold rounded-lg transition-colors ${location.pathname === '/alokasi' ? 'text-emerald-400 bg-slate-800/20' : 'text-slate-400 hover:text-emerald-400'}`}>
                  • Daftar Penugasan
                </Link>
              </div>
            )}
          </div>
        )}

        {/* 3. Menu Sisa */}
        {allowedMenuItems
          .filter(item => !['/dashboard-lapangan', '/cek-selisih-muatan', '/dashboard-alokasi', '/alokasi'].includes(item.path))
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
          <div className="text-xs truncate min-w-0">
            <p className="font-bold text-slate-200">{profile?.nama_pengguna || profile?.nama_petugas}</p>
            <p className="text-[10px] text-emerald-400 font-mono uppercase tracking-wider">{profile?.role}</p>
          </div>
        </div>
        <button onClick={handleLogout} className="flex items-center gap-2 text-rose-400 text-xs font-bold w-full p-2 hover:bg-rose-950/30 rounded-lg transition-colors">
          <LogOut size={16} /> Keluar
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen w-full bg-slate-50 overflow-hidden">
      {/* Mobile Drawer */}
      {isMobileMenuOpen && !isPcl && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs" onClick={() => setIsMobileMenuOpen(false)} />
          <div className="relative w-64 h-full animate-in slide-in-from-left duration-200">
            <SidebarContent isMobile />
          </div>
        </div>
      )}

      {/* Desktop Sidebar */}
      {!isPcl && <div className="hidden md:block w-64 shrink-0 h-full"><SidebarContent /></div>}

      {/* Main Content Content Canvas */}
      <div className="flex-1 flex flex-col overflow-hidden h-full">
        <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 shadow-xs shrink-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            {!isPcl && (
              <button onClick={() => setIsMobileMenuOpen(true)} className="md:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-lg">
                <Menu size={20} />
              </button>
            )}
            <h1 className="font-black text-slate-700 text-xs md:text-sm uppercase tracking-wider truncate">
              {isPcl ? 'Sensus Ekonomi 2026' : 'MANAJEMEN SE2026 BPS KABUPATEN BOYOLALI'}
            </h1>
          </div>
          
          {profile?.role === 'pml' && profile?.kecamatan_tugas && (
            <div className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-[10px] font-black uppercase shrink-0 tracking-wide">
              Kec: {profile.kecamatan_tugas}
            </div>
          )}
        </header>

        <main className="flex-1 overflow-auto p-4 sm:p-6 bg-slate-50/50">
          <Outlet />
        </main>
      </div>
    </div>
  );
}