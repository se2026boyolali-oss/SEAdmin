// src/components/Layout.jsx
import { Outlet, Link, useLocation } from 'react-router-dom';
import { Users, Map, BarChart3, Settings } from 'lucide-react';

export default function Layout() {
  const location = useLocation();

  const menuItems = [
    { name: 'Dashboard', path: '/', icon: BarChart3 },
    { name: 'Alokasi Petugas', path: '/alokasi', icon: Map },
    //{ name: 'Data Petugas', path: '/petugas', icon: Users },
    //{ name: 'Pengaturan', path: '/pengaturan', icon: Settings },
  ];

  return (
    <div className="flex h-screen w-full bg-slate-50">
      {/* SIDEBAR */}
      <div className="w-64 bg-slate-900 text-white flex flex-col transition-all">
        <div className="p-5 font-bold text-xl border-b border-slate-800 text-emerald-400">
          SE2026 Admin
        </div>
        
        <nav className="flex-1 px-3 py-4 space-y-2">
          {menuItems.map((item) => {
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
      </div>

      {/* AREA KONTEN UTAMA */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header Tipis */}
        <header className="h-14 bg-white border-b flex items-center px-6 shadow-sm">
          <h1 className="font-semibold text-slate-700">MANAJEMEN SE2026 BPS KABUPATEN BOYOLALI</h1>
        </header>

        {/* Tempat halaman di-render (Split Screen nanti masuk ke sini) */}
        <main className="flex-1 overflow-auto p-6">
          <Outlet /> 
        </main>
      </div>
    </div>
  );
}