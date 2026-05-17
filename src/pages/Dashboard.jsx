import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
    PieChart, Pie, Cell, Legend 
} from 'recharts';
import { 
    Users, MapPin, CheckCircle, AlertCircle, TrendingUp, LayoutDashboard 
} from 'lucide-react';

const Dashboard = () => {
    const [stats, setStats] = useState({
        total: 0,
        allocated: 0,
        unallocated: 0,
        progress: 0
    });
    const [chartData, setChartData] = useState([]);
    const [loading, setLoading] = useState(true);

    const COLORS = ['#10b981', '#f43f5e']; // Hijau untuk Sukses, Merah untuk Sisa

    useEffect(() => {
        fetchDashboardData();
    }, []);

 const fetchDashboardData = async () => {
    setLoading(true);
    try {
        const { data, error } = await supabase
            .from('kecamatan_summary')
            .select('*')
            .order('code', { ascending: true }); // Diurutkan berdasarkan Kode Kecamatan

        if (error) throw error;

        // Hitung statistik global
        const totalSls = data.reduce((acc, curr) => acc + curr.total, 0);
        const totalAlloc = data.reduce((acc, curr) => acc + curr.allocated, 0);
        
        setStats({
            total: totalSls,
            allocated: totalAlloc,
            unallocated: totalSls - totalAlloc,
            progress: Math.round((totalAlloc / totalSls) * 100)
        });

        // Format data untuk Chart Persentase
        const formattedChartData = data.map(item => ({
            code: item.code,
            name: item.name,
            displayName: `${item.code} - ${item.name}`, // Label: "120 - Mojosongo"
            percentage: Math.round((item.allocated / item.total) * 100),
            remaining: 100 - Math.round((item.allocated / item.total) * 100)
        }));
        
        setChartData(formattedChartData);

    } catch (err) {
        console.error("Dashboard Error:", err.message);
    } finally {
        setLoading(false);
    }
};

    // Komponen Kartu Statistik Kecil
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
                    title="Total Target SLS" 
                    value={stats.total.toLocaleString()} 
                    icon={MapPin} 
                    colorClass="bg-blue-50 text-blue-600"
                    subtitle="Wilayah Kerja Terdaftar"
                />
                <StatCard 
                    title="Telah Dialokasikan" 
                    value={stats.allocated.toLocaleString()} 
                    icon={CheckCircle} 
                    colorClass="bg-emerald-50 text-emerald-600"
                    subtitle={`${stats.progress}% dari total target`}
                />
                <StatCard 
                    title="Sisa Alokasi" 
                    value={stats.unallocated.toLocaleString()} 
                    icon={AlertCircle} 
                    colorClass="bg-rose-50 text-rose-600"
                    subtitle="Membutuhkan Penugasan"
                />
                <StatCard 
                    title="Persentase Progres" 
                    value={`${stats.progress}%`} 
                    icon={TrendingUp} 
                    colorClass="bg-amber-50 text-amber-600"
                    subtitle="SLS yang Sudah Dialokasikan"
                />
            </div>

            {/* BAGIAN GRAFIK */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* BAR CHART: PROGRES PER KECAMATAN */}
<div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
    <div className="flex items-center justify-between mb-6">
        <h4 className="font-bold text-slate-700 flex items-center gap-2">
             Progres Alokasi per Kecamatan (%)
        </h4>
        <span className="text-[10px] bg-indigo-50 px-2 py-1 rounded font-bold text-indigo-600 uppercase tracking-wider">
            Urutan: Kode Wilayah
        </span>
    </div>
    <div className="h-[400px] w-full">
        <ResponsiveContainer width="100%" height="100%">
            <BarChart 
                data={chartData} 
                margin={{ top: 20, right: 30, left: 0, bottom: 70 }}
            >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                    dataKey="displayName" 
                    angle={-45} 
                    textAnchor="end" 
                    interval={0} 
                    fontSize={10} 
                    tick={{fill: '#64748b', fontWeight: 600}} 
                    height={80}
                />
                {/* YAxis diset statis 0 - 100 */}
                <YAxis 
                    domain={[0, 100]} 
                    fontSize={12} 
                    axisLine={false} 
                    tickLine={false} 
                    tickFormatter={(val) => `${val}%`}
                    tick={{fill: '#64748b'}} 
                />
                <Tooltip 
                    cursor={{fill: '#f8fafc'}}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    formatter={(value) => [`${value}%`]}
                />
                <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{paddingBottom: '20px', fontSize: '12px'}} />
                
                {/* Bar Progres */}
                <Bar 
                    name="Teralokasi (%)" 
                    dataKey="percentage" 
                    stackId="a" 
                    fill="#10b981" 
                    barSize={25} 
                />
                
                {/* Bar Sisa */}
                <Bar 
                    name="Belum Alokasi (%)" 
                    dataKey="remaining" 
                    stackId="a" 
                    fill="#e2e8f0" // Abu-abu muda untuk sisa persentase agar tidak terlalu "berisik"
                    radius={[4, 4, 0, 0]} 
                    barSize={25} 
                />
            </BarChart>
        </ResponsiveContainer>
    </div>
</div>

                {/* PIE CHART: KOMPOSISI GLOBAL */}
<div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
    <h4 className="font-bold text-slate-700 mb-6">Progres Alokasi Kabupaten</h4>
    <div className="flex-1 relative">
        <ResponsiveContainer width="100%" height={300}>
            <PieChart>
                <Pie
                    data={[
                        { name: 'Selesai', value: stats.allocated },
                        { name: 'Sisa', value: stats.unallocated }
                    ]}
                    innerRadius={70}
                    outerRadius={100}
                    paddingAngle={8}
                    dataKey="value"
                    // Menampilkan persentase di luar Pie
                    label={({ percent }) => `${(percent * 100).toFixed(1)}%`}
                >
                    <Cell fill={COLORS[0]} />
                    <Cell fill={COLORS[1]} />
                </Pie>
                <Tooltip 
                    formatter={(value) => [`${value} SLS`, 'Jumlah']}
                />
            </PieChart>
        </ResponsiveContainer>

        {/* Label Persentase di Tengah Donut */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[60px] text-center pointer-events-none">
            <span className="text-2xl font-black text-slate-800">{stats.progress}%</span>
            <p className="text-[10px] uppercase font-bold text-slate-400">Teralokasi</p>
        </div>

        <div className="space-y-3 mt-4">
            <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-xl">
                <div className="flex flex-col">
                    <span className="text-xs font-bold text-emerald-700">Teralokasi</span>
                    <span className="text-[10px] text-emerald-600">{( (stats.allocated / stats.total) * 100 ).toFixed(1)}% dari target</span>
                </div>
                <span className="font-black text-emerald-800">{stats.allocated.toLocaleString()}</span>
            </div>
            
            <div className="flex items-center justify-between p-3 bg-rose-50 rounded-xl">
                <div className="flex flex-col">
                    <span className="text-xs font-bold text-rose-700">Belum Alokasi</span>
                    <span className="text-[10px] text-rose-600">{( (stats.unallocated / stats.total) * 100 ).toFixed(1)}% sisa</span>
                </div>
                <span className="font-black text-rose-800">{stats.unallocated.toLocaleString()}</span>
            </div>
        </div>
    </div>
</div>

            </div>
        </div>
    );
};

export default Dashboard;