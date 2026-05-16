import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import AlokasiPage from './pages/AlokasiPage';
import Dashboard from './pages/Dashboard';

// Placeholder sederhana untuk halaman lain
const Petugas = () => (
  <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
    <h2 className="text-2xl font-bold text-slate-800">Manajemen Petugas</h2>
    <p className="text-slate-500 mt-2">Daftar petugas yang ditarik dari database Supabase.</p>
  </div>
);

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="alokasi" element={<AlokasiPage />} />
          <Route path="petugas" element={<Petugas />} />
          <Route path="pengaturan" element={<div>Halaman Pengaturan</div>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;