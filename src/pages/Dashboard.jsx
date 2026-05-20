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
    // 1. STATE MANAGEMENT (Semua Hooks diletakkan di dalam fungsi komponen)
    const [stats, setStats] = useState({
        total: 0,
        allocated: 0,
        unallocated: 0,
        progress: 0
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

            // Hitung statistik global dengan proteksi fallback nilai jika data kosong
            const totalSls = kecData ? kecData.reduce((acc, curr) => acc + (curr.total || 0), 0) : 0;
            const totalAlloc = kecData ? kecData.reduce((acc, curr) => acc + (curr.allocated || 0), 0) : 0;
            const globalProgress = totalSls > 0 ? Math.round((totalAlloc / totalSls) * 100) : 0;

            setStats({
                total: totalSls,
                allocated: totalAlloc,
                unallocated: totalSls - totalAlloc,
                progress: globalProgress
            });

            // Format data untuk Bar Chart (Mencegah NaN / Infinity jika total wilayah bernilai 0)
            const formattedChartData = kecData.map(item => {
                const totalItem = item.total || 0;
                const allocItem = item.allocated || 0;
                const pct = totalItem > 0 ? Math.round((allocItem / totalItem) * 100) : 0;

                return {
                    code: item.code,
                    name: item.name,
                    displayName: `${item.code} - ${item.name}`,
                    percentage: pct,
                    remaining: 100 - pct
                };
            });
            setChartData(formattedChartData);

            // ─── AMBIL DATA AGREGASI BEBAN PETUGAS DARI MUATAN_SLS ─────────
// ─── AMBIL DATA AGREGASI BEBAN PETUGAS DARI MUATAN_SLS (BERDASARKAN MUATAN) ───
            // Pastikan memasukkan nama kolom jumlah muatan Anda (misal: jml_muatan atau muatan)
            // ─── AMBIL DATA AGREGASI BEBAN BERDASARKAN MUATAN & KECAMATAN ───
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
                let totalMuatanTerbimbing = 0;

                rawSls.forEach(item => {
                    if (item.petugas_id) {
                        const muatanSlsIni = Number(item.perkiraan_jumlah_beban) || 0;
                        totalMuatanTerbimbing += muatanSlsIni;

                        const nama = item.petugas?.nama_petugas || item.petugas_id;
                        const kecamatan = item.nmkec || 'Kec. Unknown';
                        
                        // KUNCI PERUBAHAN: Buat identifier unik gabungan nama + kecamatan
                        // agar jika ada nama petugas yang sama di kecamatan berbeda tidak bertabrakan
                        const key = `${nama} (${kecamatan})`;
                        
                        loadMap[key] = (loadMap[key] || 0) + muatanSlsIni;
                    }
                });

                const petugasArray = Object.keys(loadMap).map(key => ({
                    name: key, // Sekarang otomatis berisi format: "Nama Petugas (Kecamatan)"
                    count: loadMap[key]
                }));

                const totalPetugasAktif = petugasArray.length;
                const avgLoad = totalPetugasAktif > 0 ? Math.round(totalMuatanTerbimbing / totalPetugasAktif) : 0;

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
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-start justify-between">
            <div>
                <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
                <h3 className="text-3xl font-black text-slate-800">{value}</h3>
                {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
            </div>
            <div className={`p-3 rounded-xl ${colorClass}`}>
                <Icon size={24} />
            </div>
        </div>
    );

    if (loading) return <div className="p-10 text-center font-bold text-slate-500">Menyusun Data...</div>;

    return (
        <div className="p-6 space-y-8 bg-slate-50 min-h-screen">
            {/* HEADER */}
            <div className="flex items-center gap-3">
                <div className="bg-indigo-600 p-2 rounded-lg text-white">
                    <LayoutDashboard size={24} />
                </div>
                <div>
                    <h1 className="text-2xl font-black text-slate-800">Dashboard Alokasi Petugas</h1>
                    <p className="text-sm text-slate-500 font-medium">Sensus Ekonomi 2026</p>
                </div>
            </div>

            {/* 4 KARTU STATISTIK UTAMA */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard 
                    title="Total Target SLS" value={stats.total.toLocaleString()} 
                    icon={MapPin} colorClass="bg-blue-50 text-blue-600" subtitle="Wilayah Kerja Terdaftar"
                />
                <StatCard 
                    title="Telah Dialokasikan" value={stats.allocated.toLocaleString()} 
                    icon={CheckCircle} colorClass="bg-emerald-50 text-emerald-600" subtitle={`${stats.progress}% dari total target`}
                />
                <StatCard 
                    title="Sisa Alokasi" value={stats.unallocated.toLocaleString()} 
                    icon={AlertCircle} colorClass="bg-rose-50 text-rose-600" subtitle="Membutuhkan Penugasan"
                />
                <StatCard 
                    title="Persentase Progres" value={`${stats.progress}%`} 
                    icon={TrendingUp} colorClass="bg-amber-50 text-amber-600" subtitle="SLS yang Sudah Dialokasikan"
                />
            </div>

            {/* BAGIAN GRAFIK RECHARTS */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* BAR CHART */}
                <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="flex items-center justify-between mb-6">
                        <h4 className="font-bold text-slate-700 flex items-center gap-2">Progres Alokasi per Kecamatan (%)</h4>
                        <span className="text-[10px] bg-indigo-50 px-2 py-1 rounded font-bold text-indigo-600 uppercase tracking-wider">Urutan: Kode Wilayah</span>
                    </div>
                    <div className="h-[400px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 70 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="displayName" angle={-45} textAnchor="end" interval={0} fontSize={10} tick={{fill: '#64748b', fontWeight: 600}} height={80} />
                                <YAxis domain={[0, 100]} fontSize={12} axisLine={false} tickLine={false} tickFormatter={(val) => `${val}%`} tick={{fill: '#64748b'}} />
                                <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} formatter={(value) => [`${value}%`]} />
                                <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{paddingBottom: '20px', fontSize: '12px'}} />
                                <Bar name="Teralokasi (%)" dataKey="percentage" stackId="a" fill="#10b981" barSize={25} />
                                <Bar name="Belum Alokasi (%)" dataKey="remaining" stackId="a" fill="#e2e8f0" radius={[4, 4, 0, 0]} barSize={25} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* PIE CHART */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                    <h4 className="font-bold text-slate-700 mb-6">Progres Alokasi Kabupaten</h4>
                    <div className="flex-1 relative">
                        <ResponsiveContainer width="100%" height={300}>
                            <PieChart>
                                <Pie
                                    data={[{ name: 'Selesai', value: stats.allocated }, { name: 'Sisa', value: stats.unallocated }]}
                                    innerRadius={70} outerRadius={100} paddingAngle={8} dataKey="value"
                                    label={({ percent }) => `${(percent * 100).toFixed(1)}%`}
                                >
                                    <Cell fill={COLORS[0]} />
                                    <Cell fill={COLORS[1]} />
                                </Pie>
                                <Tooltip formatter={(value) => [`${value} SLS`, 'Jumlah']} />
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[60px] text-center pointer-events-none">
                            <span className="text-2xl font-black text-slate-800">{stats.progress}%</span>
                            <p className="text-[10px] uppercase font-bold text-slate-400">Teralokasi</p>
                        </div>
                        <div className="space-y-3 mt-4">
                            <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-xl">
                                <div className="flex flex-col">
                                    <span className="text-xs font-bold text-emerald-700">Teralokasi</span>
                                    <span className="text-[10px] text-emerald-600">{stats.total > 0 ? ((stats.allocated / stats.total) * 100).toFixed(1) : "0.0"}% dari target</span>
                                </div>
                                <span className="font-black text-emerald-800">{stats.allocated.toLocaleString()}</span>
                            </div>
                            <div className="flex items-center justify-between p-3 bg-rose-50 rounded-xl">
                                <div className="flex flex-col">
                                    <span className="text-xs font-bold text-rose-700">Belum Alokasi</span>
                                    <span className="text-[10px] text-rose-600">{stats.total > 0 ? ((stats.unallocated / stats.total) * 100).toFixed(1) : "0.0"}% sisa</span>
                                </div>
                                <span className="font-black text-rose-800">{stats.unallocated.toLocaleString()}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ─── PANEL BARU: ANALISIS SEBARAN BEBAN PETUGAS (KIRI: 1 KOLOM, KANAN: 2 KOLOM SKEW) ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* 1. KARTU RATA-RATA BEBAN (1 Kolom) */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center items-center text-center">
                    <div className="p-4 bg-indigo-50 text-indigo-600 rounded-full mb-3">
                        <TrendingUp size={32} />
                    </div>
                    <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">Rata-Rata Beban Kerja</p>
                    <h3 className="text-5xl font-black text-slate-800 my-2">{loadStats.averageLoad}</h3>
                    <p className="text-xs text-slate-400 font-medium px-6 leading-relaxed">
                        Rata-rata beban kerja per petugas dihitung dari total jumlah muatan yang telah dialokasikan.
                    </p>
                </div>

                {/* 2. TABEL PERBANDINGAN EKSTREM TOP 10 (2 Kolom) */}
                <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-2 gap-6">
                    
                    {/* SUB-KOLOM A: TOP 10 TERBANYAK */}
                    <div>
                        <h4 className="font-bold text-slate-700 text-sm mb-4 flex items-center gap-2 border-b border-slate-100 pb-2">
                            <AlertTriangle size={16} className="text-rose-500" />
                            10 Petugas dengan Beban Terbanyak
                        </h4>
                        <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1 scrollbar-thin">
                            {loadStats.topHeavy.map((petugas, idx) => (
                                <div key={idx} className="flex items-center justify-between p-2.5 bg-slate-50 hover:bg-slate-100/80 rounded-xl border border-slate-100 transition-all">
                                    <div className="flex items-center gap-2 truncate">
                                        <span className="text-xs font-bold text-slate-400 w-5 text-right">{idx + 1}.</span>
                                        <span className="text-xs font-semibold text-slate-700 truncate">{petugas.name}</span>
                                    </div>
                                    <span className="bg-rose-50 text-rose-700 text-[11px] font-black px-2 py-0.5 rounded-md shrink-0">
                                        {petugas.count}
                                    </span>
                                </div>
                            ))}
                            {loadStats.topHeavy.length === 0 && <p className="text-xs text-center text-slate-400 py-4">Tidak ada alokasi data.</p>}
                        </div>
                    </div>

                    {/* SUB-KOLOM B: TOP 10 TERSEDITIK */}
                    <div>
                        <h4 className="font-bold text-slate-700 text-sm mb-4 flex items-center gap-2 border-b border-slate-100 pb-2">
                            <Award size={16} className="text-emerald-500" />
                            10 Petugas dengan Beban Tersedikit
                        </h4>
                        <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1 scrollbar-thin">
                            {loadStats.topLight.map((petugas, idx) => (
                                <div key={idx} className="flex items-center justify-between p-2.5 bg-slate-50 hover:bg-slate-100/80 rounded-xl border border-slate-100 transition-all">
                                    <div className="flex items-center gap-2 truncate">
                                        <span className="text-xs font-bold text-slate-400 w-5 text-right">{idx + 1}.</span>
                                        <span className="text-xs font-semibold text-slate-700 truncate">{petugas.name}</span>
                                    </div>
                                    <span className="bg-emerald-50 text-emerald-700 text-[11px] font-black px-2 py-0.5 rounded-md shrink-0">
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