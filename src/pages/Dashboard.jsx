// src/pages/Dashboard.jsx
import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
    PieChart, Pie, Cell, Legend 
} from 'recharts';
import { 
    MapPin, CheckCircle, AlertCircle, TrendingUp, LayoutDashboard, Award, AlertTriangle
} from 'lucide-react';

const Dashboard = () => {
    // 1. STATE MANAGEMENT
    const [stats, setStats] = useState({
        total: 0,
        allocated: 0,
        unallocated: 0,
        progress: 0,
        totalPml: 0,
        totalPcl: 0
    });
    const [loadStats, setLoadStats] = useState({
        averageLoad: 0,
        topHeavy: [],
        topLight: []
    });
    const [chartData, setChartData] = useState([]);
    const [loading, setLoading] = useState(true);

    const COLORS = ['#10b981', '#f43f5e']; 

    useEffect(() => {
        fetchDashboardData();
    }, []);

    const fetchDashboardData = async () => {
        setLoading(true);
        try {
            // ─── AMBIL DATA KECAMATAN SUMMARY ──────────────────────────────
            const { data: kecData, error: kecError } = await supabase
                .from('kecamatan_summary')
                .select('*')
                .order('code', { ascending: true });

            if (kecError) throw kecError;

            // Hitung statistik global
            const totalSls = kecData ? kecData.reduce((acc, curr) => acc + (curr.total || 0), 0) : 0;
            const totalAlloc = kecData ? kecData.reduce((acc, curr) => acc + (curr.allocated || 0), 0) : 0;
            const globalProgress = totalSls > 0 ? Math.round((totalAlloc / totalSls) * 100) : 0;

            // ─── AMBIL DATA HITUNGAN TOTAL PML DAN PCL ──────────────────────
            const { count: pmlCount, error: pmlError } = await supabase
                .from('petugas')
                .select('*', { count: 'exact', head: true })
                .eq('posisi_tugas', 'PML');

            const { count: pclCount, error: pclError } = await supabase
                .from('petugas')
                .select('*', { count: 'exact', head: true })
                .eq('posisi_tugas', 'PCL');

            if (pmlError) throw pmlError;
            if (pclError) throw pclError;

            setStats({
                total: totalSls,
                allocated: totalAlloc,
                unallocated: totalSls - totalAlloc,
                progress: globalProgress,
                totalPml: pmlCount || 0,
                totalPcl: pclCount || 0
            });

            // Format data untuk Bar Chart
            const formattedChartData = kecData.map(item => {
                const totalItem = item.total || 0;
                const allocItem = item.allocated || 0;
                const pct = totalItem > 0 ? Math.round((allocItem / totalItem) * 100) : 0;

                return {
                    code: item.code,
                    name: item.name,
                    displayName: item.code + ' - ' + item.name,
                    percentage: pct,
                    remaining: 100 - pct
                };
            });
            setChartData(formattedChartData);

            // ─── AMBIL DATA AGREGASI BEBAN PETUGAS DARI MUATAN_SLS ─────────
            const { data: rawSls, error: slsError } = await supabase
                .from('muatan_sls')
                .select(`
                    idsubsls,
                    petugas_id,
                    perkiraan_jumlah_beban,
                    nmkec,
                    petugas:petugas_id (nama_petugas)
                `);

            if (slsError) throw slsError;

            if (rawSls && rawSls.length > 0) {
                const loadMap = {};
                let totalMuTarget = 0;

                rawSls.forEach(item => {
                    if (item.petugas_id) {
                        const muatanSlsIni = Number(item.perkiraan_jumlah_beban) || 0;
                        totalMuTarget += muatanSlsIni;

                        const nama = item.petugas?.nama_petugas || item.petugas_id;
                        const kecamatan = item.nmkec || 'Kec. Unknown';
                        const key = nama + ' (' + kecamatan + ')';
                        
                        loadMap[key] = (loadMap[key] || 0) + muatanSlsIni;
                    }
                });

                const petugasArray = Object.keys(loadMap).map(key => ({
                    name: key,
                    count: loadMap[key]
                }));

                const totalPetugasAktif = petugasArray.length;
                const avgLoad = totalPetugasAktif > 0 ? Math.round(totalMuTarget / totalPetugasAktif) : 0;

                const sortedHeavy = [...petugasArray].sort((a, b) => b.count - a.count).slice(0, 10);
                const sortedLight = [...petugasArray].sort((a, b) => a.count - b.count).slice(0, 10);

                setLoadStats({
                    averageLoad: avgLoad,
                    topHeavy: sortedHeavy,
                    topLight: sortedLight
                });
            }

        } catch (err) {
            console.error("Dashboard Error:", err.message);
        } finally {
            setLoading(false);
        }
    };

    // Komponen Kartu Statistik Atas
    const StatCard = ({ title, value, icon: Icon, colorClass, subtitle }) => (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-start justify-between h-full">
            <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-500 mb-1 truncate">{title}</p>
                <h3 className="text-2xl font-black text-slate-800 tracking-tight">{value}</h3>
                {subtitle && <p className="text-[11px] text-slate-400 mt-1 truncate font-medium">{subtitle}</p>}
            </div>
            <div className={`p-2.5 rounded-xl shrink-0 ml-2 ${colorClass}`}>
                <Icon size={20} />
            </div>
        </div>
    );

    if (loading) return <div className="p-10 text-center font-bold text-slate-500">Menyusun Data...</div>;

    return (
        // MODIFIKASI: Mengurangi padding luar di mobile agar space layar HP maksimal (p-4 ke p-6)
        <div className="p-4 md:p-6 space-y-6 md:space-y-8 bg-slate-50 min-h-screen">
            
            {/* HEADER */}
            <div className="flex items-center gap-3">
                <div className="bg-indigo-600 p-2 rounded-lg text-white shrink-0">
                    <LayoutDashboard size={22} />
                </div>
                <div>
                    {/* MODIFIKASI: Skala teks judul dinamis berdasarkan layar */}
                    <h1 className="text-xl md:text-2xl font-black text-slate-800 leading-tight">Dashboard Alokasi Petugas</h1>
                    <p className="text-xs md:text-sm text-slate-500 font-medium">Sensus Ekonomi 2026</p>
                </div>
            </div>

            {/* 1 BARIS GRID UTAMA: 4 KARTU SLS + KARTU PETUGAS MINI */}
            {/* MODIFIKASI: Grid diatur sm:grid-cols-2 dan kartu ke-5 dibuat meluas di layar sedang agar seimbang */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 md:gap-5">
                <StatCard 
                    title="Total Target SLS" value={stats.total.toLocaleString()} 
                    icon={MapPin} colorClass="bg-blue-50 text-blue-600" subtitle="Wilayah Kerja Terdaftar"
                />
                <StatCard 
                    title="Telah Dialokasikan" value={stats.allocated.toLocaleString()} 
                    icon={CheckCircle} colorClass="bg-emerald-50 text-emerald-600" subtitle={stats.progress + '% dari total target'}
                />
                <StatCard 
                    title="Sisa Alokasi" value={stats.unallocated.toLocaleString()} 
                    icon={AlertCircle} colorClass="bg-rose-50 text-rose-600" subtitle="Membutuhkan Penugasan"
                />
                <StatCard 
                    title="Persentase Progres" value={stats.progress + '%'} 
                    icon={TrendingUp} colorClass="bg-amber-50 text-amber-600" subtitle="SLS Sudah Dialokasikan"
                />
                
                {/* KARTU KE-5: INTEGRASI TOTAL PML & PCL MINI WORKSPACE */}
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center h-full sm:col-span-2 lg:col-span-1">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 text-center sm:text-left">Jumlah Petugas</p>
                    <div className="grid grid-cols-2 gap-2 flex-1 items-center">
                        <div className="bg-indigo-50/60 border border-indigo-100/70 p-2 rounded-xl text-center">
                            <span className="text-xl font-black text-indigo-700 block leading-none mb-1">{stats.totalPml}</span>
                            <span className="text-[9px] font-extrabold text-indigo-500 uppercase tracking-tight">PML</span>
                        </div>
                        <div className="bg-violet-50/60 border border-violet-100/70 p-2 rounded-xl text-center">
                            <span className="text-xl font-black text-violet-700 block leading-none mb-1">{stats.totalPcl}</span>
                            <span className="text-[9px] font-extrabold text-violet-500 uppercase tracking-tight">PCL</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* BAGIAN GRAFIK RECHARTS */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
                
                {/* BAR CHART */}
                <div className="lg:col-span-2 bg-white p-4 md:p-6 rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
                        <h4 className="font-bold text-slate-700 text-sm md:text-base flex items-center gap-2">Progres Alokasi per Kecamatan (%)</h4>
                        <span className="self-start sm:self-auto text-[9px] bg-indigo-50 px-2 py-1 rounded font-bold text-indigo-600 uppercase tracking-wider">Urutan: Kode Wilayah</span>
                    </div>
                    {/* MODIFIKASI: Ditambahkan kontainer overflow-x-auto agar di HP grafik bisa di-swipe horizontal, tidak hancur berhimpitan */}
                    <div className="w-full overflow-x-auto scrollbar-thin">
                        <div className="h-[400px] w-full min-w-[750px] md:min-w-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData} margin={{ top: 20, right: 10, left: -20, bottom: 70 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="displayName" angle={-45} textAnchor="end" interval={0} fontSize={10} tick={{fill: '#64748b', fontWeight: 600}} height={80} />
                                    <YAxis domain={[0, 100]} fontSize={11} axisLine={false} tickLine={false} tickFormatter={(val) => val + '%'} tick={{fill: '#64748b'}} />
                                    <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} formatter={(value) => [value + '%']} />
                                    <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{paddingBottom: '20px', fontSize: '11px'}} />
                                    <Bar name="Teralokasi (%)" dataKey="percentage" stackId="a" fill="#10b981" barSize={20} />
                                    <Bar name="Belum Alokasi (%)" dataKey="remaining" stackId="a" fill="#e2e8f0" radius={[4, 4, 0, 0]} barSize={20} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                {/* PIE CHART */}
                <div className="bg-white p-4 md:p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                    <h4 className="font-bold text-slate-700 mb-4 text-sm md:text-base">Progres Alokasi Kabupaten</h4>
                    <div className="flex-1 relative min-h-[300px]">
                        <ResponsiveContainer width="100%" height={260}>
                            <PieChart>
                                <Pie
                                    data={[{ name: 'Selesai', value: stats.allocated }, { name: 'Sisa', value: stats.unallocated }]}
                                    innerRadius={65} outerRadius={90} paddingAngle={6} dataKey="value"
                                    label={({ percent }) => (percent * 100).toFixed(1) + '%'}
                                >
                                    <Cell fill={COLORS[0]} />
                                    <Cell fill={COLORS[1]} />
                                </Pie>
                                <Tooltip formatter={(value) => [value + ' SLS', 'Jumlah']} />
                            </PieChart>
                        </ResponsiveContainer>
                        {/* MODIFIKASI: Penataan posisi teks tengah lingkaran menggunakan top & transform agar presisi di mobile */}
                        <div className="absolute top-[110px] left-1/2 -translate-x-1/2 text-center pointer-events-none">
                            <span className="text-2xl font-black text-slate-800">{stats.progress}%</span>
                            <p className="text-[9px] uppercase font-bold text-slate-400 tracking-wider">Teralokasi</p>
                        </div>
                        <div className="space-y-2 mt-4">
                            <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-xl">
                                <div className="flex flex-col">
                                    <span className="text-xs font-bold text-emerald-700">Teralokasi</span>
                                    <span className="text-[10px] text-emerald-600">{stats.total > 0 ? ((stats.allocated / stats.total) * 100).toFixed(1) : '0.0'}% dari target</span>
                                </div>
                                <span className="font-black text-emerald-800 text-sm">{stats.allocated.toLocaleString()}</span>
                            </div>
                            <div className="flex items-center justify-between p-3 bg-rose-50 rounded-xl">
                                <div className="flex flex-col">
                                    <span className="text-xs font-bold text-rose-700">Belum Alokasi</span>
                                    <span className="text-[10px] text-rose-600">{stats.total > 0 ? ((stats.unallocated / stats.total) * 100).toFixed(1) : '0.0'}% sisa</span>
                                </div>
                                <span className="font-black text-rose-800 text-sm">{stats.unallocated.toLocaleString()}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* PANEL ANALISIS SEBARAN BEBAN PETUGAS */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
                {/* 1. KARTU RATA-RATA BEBAN */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center items-center text-center">
                    <div className="p-3 bg-indigo-50 text-indigo-600 rounded-full mb-3">
                        <TrendingUp size={28} />
                    </div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Rata-Rata Beban Kerja</p>
                    <h3 className="text-4xl md:text-5xl font-black text-slate-800 my-2">{loadStats.averageLoad}</h3>
                    <p className="text-[11px] text-slate-400 font-medium px-4 leading-relaxed">
                        Rata-rata beban kerja per petugas dihitung dari total jumlah muatan yang telah dialokasikan.
                    </p>
                </div>

                {/* 2. TABEL PERBANDINGAN EKSTREM TOP 10 */}
                <div className="lg:col-span-2 bg-white p-4 md:p-6 rounded-2xl border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* SUB-KOLOM A: TOP 10 TERBANYAK */}
                    <div>
                        <h4 className="font-bold text-slate-700 text-xs md:text-sm mb-4 flex items-center gap-2 border-b border-slate-100 pb-2">
                            <AlertTriangle size={15} className="text-rose-500" />
                            10 Petugas dengan Beban Terbanyak
                        </h4>
                        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1 scrollbar-thin">
                            {loadStats.topHeavy.map((petugas, idx) => (
                                <div key={idx} className="flex items-center justify-between p-2 bg-slate-50 hover:bg-slate-100/80 rounded-xl border border-slate-100/60 transition-all">
                                    <div className="flex items-center gap-2 truncate">
                                        <span className="text-[11px] font-bold text-slate-400 w-4 text-right">{idx + 1}.</span>
                                        <span className="text-xs font-semibold text-slate-700 truncate">{petugas.name}</span>
                                    </div>
                                    <span className="bg-rose-50 text-rose-700 text-[10px] font-black px-2 py-0.5 rounded-md shrink-0 ml-2">
                                        {petugas.count}
                                    </span>
                                </div>
                            ))}
                            {loadStats.topHeavy.length === 0 && <p className="text-xs text-center text-slate-400 py-4">Tidak ada alokasi data.</p>}
                        </div>
                    </div>

                    {/* SUB-KOLOM B: TOP 10 TERSEDITIK */}
                    <div>
                        <h4 className="font-bold text-slate-700 text-xs md:text-sm mb-4 flex items-center gap-2 border-b border-slate-100 pb-2">
                            <Award size={15} className="text-emerald-500" />
                            10 Petugas dengan Beban Tersedikit
                        </h4>
                        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1 scrollbar-thin">
                            {loadStats.topLight.map((petugas, idx) => (
                                <div key={idx} className="flex items-center justify-between p-2 bg-slate-50 hover:bg-slate-100/80 rounded-xl border border-slate-100/60 transition-all">
                                    <div className="flex items-center gap-2 truncate">
                                        <span className="text-[11px] font-bold text-slate-400 w-4 text-right">{idx + 1}.</span>
                                        <span className="text-xs font-semibold text-slate-700 truncate">{petugas.name}</span>
                                    </div>
                                    <span className="bg-emerald-50 text-emerald-700 text-[10px] font-black px-2 py-0.5 rounded-md shrink-0 ml-2">
                                        {petugas.count}
                                    </span>
                                </div>
                            ))}
                            {loadStats.topLight.length === 0 && <p className="text-xs text-center text-slate-400 py-4">Tidak ada alokasi data.</p>}
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default Dashboard;