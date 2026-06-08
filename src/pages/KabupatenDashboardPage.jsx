import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { 
    BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { 
    Users, AlertTriangle, ShieldAlert, CheckCircle2, 
    Search, ArrowRight, User, MapPin, Calendar, HardDrive, X 
} from 'lucide-react';

export default function PetugasControlCenterPage() {
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState('PCL'); // 'PCL' atau 'PML'
    const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'stagnan', 'aktif'
    const [selectedKecamatan, setSelectedKecamatan] = useState(null); 
    
    // Core Data States
    const [globalMetrics, setGlobalMetrics] = useState({ totalPcl: 0, pclAktifHariIni: 0, totalPml: 0, pmlAktifHariIni: 0, totalStagnan: 0 });
    const [filteredMetrics, setFilteredMetrics] = useState({ totalPcl: 0, pclAktifHariIni: 0, totalPml: 0, pmlAktifHariIni: 0, totalStagnan: 0 });
    const [masterPclList, setMasterPclList] = useState([]);
    const [masterPmlList, setMasterPmlList] = useState([]);
    const [kecamatanChartData, setKecamatanChartData] = useState([]);
    const [selectedPetugas, setSelectedPetugas] = useState(null);
    const [trendChartData, setTrendChartData] = useState([]);

    useEffect(() => { fetchOperationalData(); }, []);

    // Rekalkulasi Metrik & Tren Line Chart setiap kali Kecamatan dikunci/diklik
    useEffect(() => {
        const now = new Date();

        // Fungsi Pembantu: Menghitung tren 14 hari terakhir secara dinamis dengan Waktu Lokal (Mencegah pergeseran tanggal UTC)
        const hitungTrenHarian = (listPcl, listPml, logsPcl, logsPml) => {
            const trendDataRaw = [];
            for (let i = 13; i >= 0; i--) {
                const d = new Date();
                d.setDate(now.getDate() - i);
                
                // Perbaikan format penanggalan lokal (YYYY-MM-DD)
                const tahun = d.getFullYear();
                const bulan = String(d.getMonth() + 1).padStart(2, '0');
                const hari = String(d.getDate()).padStart(2, '0');
                const dateString = `${tahun}-${bulan}-${hari}`;
                
                const pclAktifTgl = new Set(logsPcl.filter(l => l.tanggal === dateString).map(l => l.petugas_email)).size;
                const pclPct = listPcl.length > 0 ? Math.round((pclAktifTgl / listPcl.length) * 100) : 0;
                
                const pmlAktifTgl = new Set(logsPml.filter(l => l.tanggal === dateString).map(l => l.pml_email)).size;
                const pmlPct = listPml.length > 0 ? Math.round((pmlAktifTgl / listPml.length) * 100) : 0;

                const labelTanggal = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });

                trendDataRaw.push({
                    tanggalLabel: labelTanggal,
                    'PCL Aktif (%)': pclPct,
                    'PML Aktif (%)': pmlPct
                });
            }
            return trendDataRaw;
        };

        // Ambil kumpulan log mentah dari master list untuk kalkulasi harian
        const seluruhLogPcl = masterPclList.flatMap(p => p.rawLogs || []);
        const seluruhLogPml = masterPmlList.flatMap(p => p.rawLogs || []);

        // CASE 1: JIKA TIDAK ADA KECAMATAN YANG DIKLIK (TAMPILKAN GLOBAL KABUPATEN)
        if (!selectedKecamatan) {
            setFilteredMetrics(globalMetrics);
            const trendGlobal = hitungTrenHarian(masterPclList, masterPmlList, seluruhLogPcl, seluruhLogPml);
            setTrendChartData(trendGlobal);
            return;
        }

        // CASE 2: JIKA KECAMATAN DIKLIK (FILTER SPESIFIK WILAYAH KECAMATAN)
        const pclKec = masterPclList.filter(p => p.kecamatan_tugas === selectedKecamatan);
        const pmlKec = masterPmlList.filter(p => p.kecamatan_tugas === selectedKecamatan);
        
        const pclAktif = pclKec.filter(p => p.statusHariIni === 'AKTIF').length;
        const pmlAktif = pmlKec.filter(p => p.statusHariIni === 'AKTIF').length;
        const stagnan = [...pclKec, ...pmlKec].filter(p => p.isStagnan).length;

        setFilteredMetrics({
            totalPcl: pclKec.length,
            pclAktifHariIni: pclAktif,
            totalPml: pmlKec.length,
            pmlAktifHariIni: pmlAktif,
            totalStagnan: stagnan
        });

        // Filter log check-in yang hanya dimiliki oleh petugas di kecamatan terpilih
        const logPclKec = seluruhLogPcl.filter(l => pclKec.some(p => p.email === l.petugas_email));
        const logPmlKec = seluruhLogPml.filter(l => pmlKec.some(p => p.email === l.pml_email));
        
        const trendKecamatan = hitungTrenHarian(pclKec, pmlKec, logPclKec, logPmlKec);
        setTrendChartData(trendKecamatan);

    }, [selectedKecamatan, globalMetrics, masterPclList, masterPmlList]);

    const fetchOperationalData = async () => {
        setLoading(true);
        const now = new Date();
        const tglHariIni = now.toISOString().split('T')[0];

        const [petugasRes, logsPclRes, logsPmlRes, masterSlsRes] = await Promise.all([
            supabase.from('petugas').select('email, nama_petugas, posisi_tugas, status, kecamatan_tugas').eq('status', 'Diterima'),
            supabase.from('log_checkin_pcl').select('idsubsls, tanggal, presidentialStatus, petugas_email' === 'idsubsls, tanggal, petugas_email' ? 'idsubsls, tanggal, petugas_email' : 'idsubsls, tanggal, petugas_email'), 
            supabase.from('log_checkin_pml').select('pml_email, tanggal, idsubsls'),
            supabase.from('muatan_sls').select('idsubsls, nmsls, nmkec, nmdesa')
        ]);

        if (petugasRes.error || logsPclRes.error || logsPmlRes.error || masterSlsRes.error) {
            console.error("Gagal mengambil data operasional");
            setLoading(false);
            return;
        }

        const allPetugas = petugasRes.data;
        const logsPcl = logsPclRes.data;
        const logsPml = logsPmlRes.data;
        const masterSls = masterSlsRes.data;

        const allPcl = allPetugas.filter(p => p.posisi_tugas === 'PCL');
        const allPml = allPetugas.filter(p => p.posisi_tugas === 'PML');

        let pclAktifCount = 0;
        let pmlAktifCount = 0;
        let totalStagnanCount = 0;

        // 1. PROSES DATA DETIL PCL
        const detailedPcl = allPcl.map(pcl => {
            const pclLogs = logsPcl.filter(l => l.petugas_email === pcl.email);
            const checkinHariIni = pclLogs.some(l => l.tanggal === tglHariIni);
            if (checkinHariIni) pclAktifCount++;

            const urutLog = [...pclLogs].sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));
            const terakhirActivity = urutLog.length > 0 ? new Date(urutLog[0].tanggal) : null;
            const hariSelesai = terakhirActivity ? Math.floor((now - terakhirActivity) / (1000 * 60 * 60 * 24)) : 999;
            const isStagnan = hariSelesai >= 3;
            if (isStagnan) totalStagnanCount++;

            const jangkauanSls = Array.from(new Set(pclLogs.map(l => l.idsubsls))).map(id => {
                return masterSls.find(s => s.idsubsls === id) || { nmsls: 'Unknown SLS', nmkec: '-' };
            });

            return {
                ...pcl,
                terakhirAktivitas: terakhirActivity ? terakhirActivity.toLocaleDateString('id-ID') : 'Belum Lapangan',
                hariSifatStagnan: hariSelesai,
                isStagnan,
                statusHariIni: checkinHariIni ? 'AKTIF' : (isStagnan ? 'STAGNAN' : 'ABSEN'),
                totalSlsDisentuh: jangkauanSls.length,
                daftarSls: jangkauanSls,
                totalInput: pclLogs.length,
                arrayTanggalAktif: pclLogs.map(l => parseInt(l.tanggal.split('-')[2], 10)),
                rawLogs: pclLogs 
            };
        });

        // 2. PROSES DATA DETIL PML
        const detailedPml = allPml.map(pml => {
            const pmlLogs = logsPml.filter(l => l.pml_email === pml.email);
            const checkinHariIni = pmlLogs.some(l => l.tanggal === tglHariIni);
            if (checkinHariIni) pmlAktifCount++;

            const urutLog = [...pmlLogs].sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));
            const terakhirActivity = urutLog.length > 0 ? new Date(urutLog[0].tanggal) : null;
            const hariSelesai = terakhirActivity ? Math.floor((now - terakhirActivity) / (1000 * 60 * 60 * 24)) : 999;
            const isStagnan = hariSelesai >= 3;
            if (isStagnan) totalStagnanCount++;

            const jangkauanSls = Array.from(new Set(pmlLogs.map(l => l.idsubsls))).map(id => {
                return masterSls.find(s => s.idsubsls === id) || { nmsls: 'Unknown SLS', nmkec: '-' };
            });

            return {
                ...pml,
                terakhirAktivitas: terakhirActivity ? terakhirActivity.toLocaleDateString('id-ID') : 'Belum Lapangan',
                hariSifatStagnan: hariSelesai,
                isStagnan,
                statusHariIni: checkinHariIni ? 'AKTIF' : (isStagnan ? 'STAGNAN' : 'ABSEN'),
                totalSlsDisentuh: jangkauanSls.length,
                daftarSls: jangkauanSls,
                totalInput: pmlLogs.length,
                arrayTanggalAktif: pmlLogs.map(l => parseInt(l.tanggal.split('-')[2], 10)),
                rawLogs: pmlLogs 
            };
        });

        // 3. AGREGASI DATA GRAFIK PER KECAMATAN (URUT KODE WILAYAH)
        const daftarKecamatan = Array.from(new Set(allPetugas.map(p => p.kecamatan_tugas).filter(Boolean)));
        
        const chartAgregasi = daftarKecamatan.map(kec => {
            const pclKec = detailedPcl.filter(p => p.kecamatan_tugas === kec);
            const pmlKec = detailedPml.filter(p => p.kecamatan_tugas === kec);

            const pclActivePct = pclKec.length > 0 ? Math.round((pclKec.filter(p => p.statusHariIni === 'AKTIF').length / pclKec.length) * 100) : 0;
            const pmlActivePct = pmlKec.length > 0 ? Math.round((pmlKec.filter(p => p.statusHariIni === 'AKTIF').length / pmlKec.length) * 100) : 0;

            return {
                name: kec,
                'PCL Aktif (%)': pclActivePct,
                'PML Aktif (%)': pmlActivePct
            };
        }).sort((a, b) => a.name.localeCompare(b.name, 'id', { numeric: true }));

        setGlobalMetrics({
            totalPcl: allPcl.length,
            pclAktifHariIni: pclAktifCount,
            totalPml: allPml.length,
            pmlAktifHariIni: pmlAktifCount,
            totalStagnan: totalStagnanCount
        });

        setKecamatanChartData(chartAgregasi);
        setMasterPclList(detailedPcl.sort((a, b) => (a.kecamatan_tugas || '').localeCompare(b.kecamatan_tugas || '', 'id', { numeric: true })));
        setMasterPmlList(detailedPml.sort((a, b) => (a.kecamatan_tugas || '').localeCompare(b.kecamatan_tugas || '', 'id', { numeric: true })));
        setLoading(false);
    };

    const listDataAktif = activeTab === 'PCL' ? masterPclList : masterPmlList;
    
    const filteredList = listDataAktif.filter(p => {
        const matchSearch = (p.nama_petugas || '').toLowerCase().includes(searchTerm.toLowerCase()) || p.email.toLowerCase().includes(searchTerm.toLowerCase());
        const matchKecamatan = selectedKecamatan ? p.kecamatan_tugas === selectedKecamatan : true;
        
        if (filterStatus === 'stagnan') return matchSearch && matchKecamatan && p.isStagnan;
        if (filterStatus === 'aktif') return matchSearch && matchKecamatan && p.statusHariIni === 'AKTIF';
        return matchSearch && matchKecamatan;
    });

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-slate-50 text-slate-500 text-xs font-bold tracking-wider">
                <div className="animate-pulse">MENYUSUN KONTROL SPASIAL KABUPATEN...</div>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-6 bg-slate-50 min-h-screen text-slate-800 font-sans antialiased">
            
            {/* HEADER */}
            <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-2 border-b border-slate-200 pb-4">
                <div>
                    <h1 className="text-sm font-black tracking-wider text-slate-800 uppercase flex items-center gap-2">
                        <ShieldAlert className="text-indigo-600" size={16}/> Sensus Ekonomi Field Control Center
                    </h1>
                    <p className="text-[11px] text-slate-400 font-medium">Monitoring spasial integrasi keaktifan berjenjang PCL dan PML Kabupaten.</p>
                </div>
                <button onClick={fetchOperationalData} className="text-[10px] bg-white border border-slate-200 px-3 py-1.5 rounded-xl text-indigo-600 font-black hover:bg-slate-100 transition shadow-sm">
                    REFRESH DATA REALTIME
                </button>
            </div>

            {/* MONITORING METRICS BOARD */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Keaktifan PCL {selectedKecamatan && `(${selectedKecamatan})`}</div>
                    <div className="flex items-baseline justify-between mt-1">
                        <div className="text-xl font-black text-slate-800">
                            {filteredMetrics.pclAktifHariIni}
                            <span className="text-xs font-normal text-slate-400">/{filteredMetrics.totalPcl} PCL</span>
                        </div>
                        <div className="text-sm font-black text-indigo-600">
                            {filteredMetrics.totalPcl > 0 ? Math.round((filteredMetrics.pclAktifHariIni / filteredMetrics.totalPcl) * 100) : 0}%
                        </div>
                    </div>
                    <div className="w-full bg-slate-100 h-1 mt-2 rounded-full overflow-hidden">
                        <div className="bg-indigo-600 h-full transition-all duration-300" style={{ width: `${filteredMetrics.totalPcl > 0 ? (filteredMetrics.pclAktifHariIni/filteredMetrics.totalPcl)*100 : 0}%` }}></div>
                    </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="text-[10px] font-bold text-slate-400 tracking-tight uppercase">Keaktifan PML {selectedKecamatan && `(${selectedKecamatan})`}</div>
                    <div className="flex items-baseline justify-between mt-1">
                        <div className="text-xl font-black text-indigo-600">
                            {filteredMetrics.pmlAktifHariIni}
                            <span className="text-xs font-normal text-slate-400">/{filteredMetrics.totalPml} PML</span>
                        </div>
                        <div className="text-sm font-black text-indigo-600">
                            {filteredMetrics.totalPml > 0 ? Math.round((filteredMetrics.pmlAktifHariIni / filteredMetrics.totalPml) * 100) : 0}%
                        </div>
                    </div>
                    <div className="w-full bg-slate-100 h-1 mt-2 rounded-full overflow-hidden">
                        <div className="bg-indigo-600 h-full transition-all duration-300" style={{ width: `${filteredMetrics.totalPml > 0 ? (filteredMetrics.pmlAktifHariIni/filteredMetrics.totalPml)*100 : 0}%` }}></div>
                    </div>
                </div>

                <div className="bg-rose-50 p-4 rounded-2xl border border-rose-100 shadow-sm">
                    <div className="text-[10px] font-bold text-rose-600 uppercase tracking-tight">Total Stagnan</div>
                    <div className="flex items-baseline justify-between mt-1">
                        <div className="text-xl font-black text-rose-600">
                            {filteredMetrics.totalStagnan}
                            <span className="text-xs font-normal text-rose-400"> Petugas</span>
                        </div>
                        <div className="text-xs font-bold text-rose-500">
                            {((filteredMetrics.totalPcl + filteredMetrics.totalPml) > 0) ? Math.round((filteredMetrics.totalStagnan / (filteredMetrics.totalPcl + filteredMetrics.totalPml)) * 100) : 0}%
                        </div>
                    </div>
                    <div className="text-[9px] text-rose-400 font-bold mt-1">Sakit / Istirahat lapangan &gt;= 3 hari.</div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Filter Wilayah</div>
                        <div className="text-xs font-black text-slate-700 uppercase mt-1">
                            {selectedKecamatan ? (
                                <span className="text-indigo-600 flex items-center gap-1 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">📍 {selectedKecamatan}</span>
                            ) : (
                                <span className="text-slate-400">Boyolali (Semua)</span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* SECTION GRAFIK: GRID BERDAMPINGAN */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                
                {/* GRAFIK 1: KECAMATAN (KIRI) */}
{/* GRAFIK 1: KECAMATAN (KIRI) */}
                <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between overflow-hidden"> {/* PERBAIKAN: Tambah overflow-hidden di sini */}
                    <div className="flex justify-between items-center mb-4">
                        <div>
                            <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider">Rasio Keaktifan per Kecamatan</h3>
                            <p className="text-[10px] text-slate-400 font-bold mt-0.5">Klik batang wilayah untuk mengunci data dashboard</p>
                        </div>
                        {selectedKecamatan && (
                            <button onClick={() => { setSelectedKecamatan(null); setSelectedPetugas(null); }} className="text-[9px] uppercase font-black bg-rose-50 text-rose-600 px-2.5 py-1 rounded-lg border border-rose-100 flex items-center gap-1 transition hover:bg-rose-100">
                                <X size={10}/> Clear Filter
                            </button>
                        )}
                    </div>
                    
                    {/* PERBAIKAN: Tambahkan overflow-hidden juga pada container pembungkus ini */}
                    <div className="w-full overflow-x-auto overflow-y-hidden scrollbar-thin">
                        <div className="h-60 w-full min-w-[500px] md:min-w-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={kecamatanChartData} onClick={(e) => { if (e && e.activeLabel) { setSelectedKecamatan(e.activeLabel); setSelectedPetugas(null); } }} margin={{ bottom: 35 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={8} tickLine={false} angle={-45} textAnchor="end" interval={0} height={45} tick={{fontWeight: 700}} />
                                    <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} unit="%" domain={[0, 100]} />
                                    
                                    {/* PERBAIKAN: Tambahkan useTranslate3d={true} dan isAnimationActive={false} (opsional untuk akurasi posisi instan) */}
<Tooltip 
    portal={null} // 1. KUNCI UTAMA: Memaksa Tooltip dirender di dalam DOM SVG grafik, bukan membuat portal liar di luar
    position={{ y: 10 }} // 2. OPSI TERBAIK: Mengunci Tooltip di bagian atas grafik secara statis, hanya bergeser horizontal (X) mengikuti kursor
    contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '11px' }} 
/>
                                    
                                    <Legend wrapperStyle={{ fontSize: '9px' }} verticalAlign="top" align="right" />
                                    <Bar dataKey="PCL Aktif (%)" fill="#6366f1" radius={[3, 3, 0, 0]} barSize={10} cursor="pointer" />
                                    <Bar dataKey="PML Aktif (%)" fill="#10b981" radius={[3, 3, 0, 0]} barSize={10} cursor="pointer" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                {/* GRAFIK 2: DIAGRAM GARIS TREN 2 MINGGU (KANAN) */}
                <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
                    <div className="flex justify-between items-center mb-4">
                        <div>
                            <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider">
                                Tren Keaktifan {selectedKecamatan ? `Kec. ${selectedKecamatan}` : '(Kabupaten)'}
                            </h3>
                            <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                                {selectedKecamatan ? 'Memantau stabilitas pergerakan log harian di wilayah terpilih' : 'Monitoring stabilitas pergerakan log harian tingkat kabupaten'}
                            </p>
                        </div>
                        {selectedKecamatan && (
                            <span className="text-[8px] font-black uppercase bg-indigo-50 text-indigo-600 px-2 py-1 rounded-md border border-indigo-100/60">
                                Terfilter Spasial
                            </span>
                        )}
                    </div>

                    <div className="h-60 w-full mt-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={trendChartData} margin={{ bottom: 5, left: -10, right: 10 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="tanggalLabel" stroke="#94a3b8" fontSize={9} tickLine={false} tick={{fontWeight: 600}} />
                                <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} unit="%" domain={[0, 100]} />
                                <Tooltip contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '11px' }} />
                                <Legend wrapperStyle={{ fontSize: '9px' }} verticalAlign="top" align="right" />
                                <Line type="monotone" dataKey="PCL Aktif (%)" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                                <Line type="monotone" dataKey="PML Aktif (%)" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* UNIFIED CONTROL TOOLBAR */}
            <div className="p-3 bg-white border border-slate-200 rounded-2xl flex flex-col lg:flex-row gap-3 justify-between items-center mb-4 shadow-sm">
                <div className="flex bg-indigo-50 p-1 rounded-xl border border-indigo-100/60 w-full lg:w-auto">
                    {['PCL', 'PML'].map((role) => (
                        <button key={role} onClick={() => { setActiveTab(role); setSelectedPetugas(null); }}
                            className={`text-xs uppercase font-black px-5 py-2 rounded-lg tracking-wider flex-1 lg:flex-none transition ${activeTab === role ? 'bg-indigo-600 text-white shadow-sm' : 'text-indigo-400 hover:text-indigo-600'}`}>
                            {role === 'PCL' ? '👥 Petugas PCL' : '👔 Petugas PML'}
                        </button>
                    ))}
                </div>

                <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto items-center flex-1 lg:justify-end">
                    <div className="relative w-full sm:w-64">
                        <Search className="absolute left-3 top-3 text-slate-400" size={13}/>
                        <input type="text" placeholder={`Cari nama / email ${activeTab}...`} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-slate-50 text-xs border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-slate-700 focus:outline-none focus:border-indigo-500" />
                    </div>
                    <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 w-full sm:w-auto">
                        {['all', 'stagnan', 'aktif'].map((st) => (
                            <button key={st} onClick={() => setFilterStatus(st)} className={`text-[10px] uppercase font-black px-4 py-1.5 rounded-lg flex-1 sm:flex-none transition ${filterStatus === st ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400'}`}>
                                {st === 'all' ? 'Semua Status' : st}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* INTEGRASI LAYOUT INDUK */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
                
                {/* TIM BODY TABLE */}
                <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm w-full">
                    <div className="overflow-x-auto w-full">
                        <table className="w-full text-left border-collapse table-auto">
                            <thead>
                                <tr className="border-b border-slate-200 bg-slate-50 text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                                    <th className="p-3">Profil Petugas ({activeTab})</th>
                                    <th className="p-3">Kecamatan Tugas</th>
                                    <th className="p-3">Status Lapangan</th>
                                    <th className="p-3">Update Terakhir</th>
                                    <th className="p-3 text-right">Aksi</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                                {filteredList.length === 0 ? (
                                    <tr>
                                        <td colSpan="5" className="p-8 text-center text-slate-400 text-xs font-bold uppercase bg-white">Tidak ada data petugas di kriteria ini.</td>
                                    </tr>
                                ) : (
                                    filteredList.map((petugas) => {
                                        const tidakAktif = petugas.statusHariIni === 'ABSEN' || petugas.statusHariIni === 'STAGNAN';
                                        return (
                                            <tr 
                                                key={petugas.email} 
                                                className={`transition cursor-pointer ${
                                                    selectedPetugas?.email === petugas.email 
                                                        ? 'bg-indigo-50/80 font-bold border-l-2 border-indigo-600' 
                                                        : tidakAktif ? 'bg-slate-100/60 hover:bg-slate-100' : 'bg-white hover:bg-slate-50'
                                                }`} 
                                                onClick={() => setSelectedPetugas(petugas)}
                                            >
                                                <td className="p-3">
                                                    <div className={`text-xs ${tidakAktif ? 'text-slate-500 font-semibold' : 'font-bold text-slate-800'}`}>{petugas.nama_petugas || 'Tanpa Nama'}</div>
                                                    <div className="text-[10px] text-slate-400 font-mono tracking-tight">{petugas.email}</div>
                                                </td>
                                                <td className="p-3 font-bold text-indigo-600">📍 {petugas.kecamatan_tugas || '-'}</td>
                                                <td className="p-3">
                                                    <span className={`inline-block text-[9px] font-black tracking-wide px-2 py-0.5 rounded ${
                                                        petugas.statusHariIni === 'AKTIF' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                                                        petugas.statusHariIni === 'STAGNAN' ? 'bg-rose-50 text-rose-600 border border-rose-100 animate-pulse' :
                                                        'bg-slate-200 text-slate-500'
                                                    }`}>
                                                        {petugas.statusHariIni}
                                                    </span>
                                                </td>
                                                <td className="p-3">
                                                    <div className={tidakAktif ? 'text-slate-400' : 'text-slate-600'}>{petugas.terakhirAktivitas}</div>
                                                    {petugas.isStagnan && <div className="text-[9px] text-rose-500 font-bold">Mogok {petugas.hariSifatStagnan} Hari</div>}
                                                </td>
                                                <td className="p-3 text-right">
                                                    <button className="text-[10px] text-indigo-600 bg-indigo-50 hover:bg-indigo-100 font-bold px-2.5 py-1 rounded-lg inline-flex items-center gap-1 transition">Detail <ArrowRight size={10}/></button>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* DETIL PANEL SIDEBAR KANAN */}
                <div className="bg-white rounded-3xl border border-slate-200 p-5 sticky top-4 shadow-sm lg:col-span-1">
                    {selectedPetugas ? (
                        <div>
                            <div className="flex items-start gap-3 border-b border-slate-100 pb-3 mb-4">
                                <div className="p-2.5 bg-indigo-50 rounded-2xl border border-indigo-100 text-indigo-600"><User size={18}/></div>
                                <div className="overflow-hidden">
                                    <span className="text-[9px] font-extrabold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full uppercase tracking-wider">{selectedPetugas.posisi_tugas}</span>
                                    <div className="text-xs font-black text-slate-800 uppercase tracking-wide truncate mt-1">{selectedPetugas.nama_petugas}</div>
                                    <div className="text-[10px] text-slate-400 font-mono truncate">{selectedPetugas.email}</div>
                                </div>
                            </div>
                            
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-center">
                                        <span className="text-[9px] text-slate-400 uppercase block font-bold">Total Submit Log</span>
                                        <span className="text-xs font-black text-slate-700 mt-0.5 block">🗄️ {selectedPetugas.totalInput} Kali</span>
                                    </div>
                                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-center">
                                        <span className="text-[9px] text-slate-400 uppercase block font-bold">Cakupan Wilayah</span>
                                        <span className="text-xs font-black text-slate-700 mt-0.5 block">🗺️ {selectedPetugas.totalSlsDisentuh} SLS</span>
                                    </div>
                                </div>

                                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                                    <span className="text-[9px] text-slate-400 uppercase block font-bold mb-2 flex items-center gap-1">
                                        <Calendar size={11} className="text-indigo-500" /> Histori Presensi Lapangan (Mei 2026)
                                    </span>
                                    
                                    <div className="grid grid-cols-7 gap-1 text-center text-[8px] font-black text-slate-400 uppercase border-b border-slate-200 pb-1 mb-1.5">
                                        <div>S</div><div>S</div><div>R</div><div>K</div><div>J</div><div>S</div><div>M</div>
                                    </div>
                                    
                                    <div className="grid grid-cols-7 gap-1 text-center">
                                        {[...Array(4)].map((_, i) => <div key={`b-${i}`} className="h-5"></div>)}
                                        
                                        {[...Array(31)].map((_, i) => {
                                            const dateNum = i + 1;
                                            const isPetugasAktif = selectedPetugas.arrayTanggalAktif?.includes(dateNum);

                                            let dateBg = "bg-white text-slate-600 border border-slate-100";
                                            if (isPetugasAktif) {
                                                dateBg = "bg-emerald-500 text-white font-black shadow-sm shadow-emerald-200";
                                            } else if (dateNum === new Date().getDate()) {
                                                dateBg = "bg-slate-200 text-slate-800 border border-slate-300 font-bold";
                                            }

                                            return (
                                                <div 
                                                    key={dateNum} 
                                                    title={isPetugasAktif ? `Petugas Aktif Lapangan` : `Tidak Ada Log`}
                                                    className={`h-5 w-5 mx-auto rounded-md text-[9px] flex items-center justify-center transition-all select-none ${dateBg}`}
                                                >
                                                    {dateNum}
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="flex items-center gap-3 mt-2 pt-1.5 border-t border-slate-200/60 text-[8px] text-slate-400 font-bold uppercase">
                                        <div className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-emerald-500 block"></span> Pemantauan Aktif</div>
                                        <div className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-white border border-slate-200 block"></span> Kosong/Absen</div>
                                    </div>
                                </div>

                                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                    <span className="text-[9px] text-slate-400 uppercase block font-bold mb-1">Kecamatan Penugasan</span>
                                    <span className="text-xs font-black text-indigo-600 block">📍 Kecamatan {selectedPetugas.kecamatan_tugas || '-'}</span>
                                </div>

                                <div>
                                    <span className="text-[9px] text-slate-400 uppercase font-bold tracking-wider block mb-1.5">Daftar SLS Terkait Log ({selectedPetugas.totalSlsDisentuh})</span>
                                    <div className="max-h-32 overflow-y-auto space-y-1 bg-slate-50 p-2 rounded-xl border border-slate-100">
                                        {selectedPetugas.daftarSls.length === 0 ? (
                                            <div className="text-[10px] text-slate-400 p-2 text-center font-bold">Belum ada jejak SLS di sistem.</div>
                                        ) : (
                                            selectedPetugas.daftarSls.map((sls, idx) => (
                                                <div key={idx} className="text-[10px] bg-white border border-slate-100 p-2 rounded-lg flex flex-col shadow-sm">
                                                    <span className="font-bold text-indigo-600">{sls.nmsls}</span>
                                                    <span className="text-[9px] text-slate-400 mt-0.5">Desa {sls.nmdesa}</span>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                                
                                <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl text-[10px] text-slate-500 flex items-center gap-1.5">
                                    <Calendar size={12} className="text-slate-400"/>
                                    <span>Log Terakhir Terdeteksi: <strong className="text-slate-700">{selectedPetugas.terakhirAktivitas}</strong></span>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-20 text-slate-400 flex flex-col items-center justify-center gap-2">
                            <AlertTriangle size={24} className="text-slate-300"/>
                            <p className="text-[10px] uppercase font-bold tracking-wider">Belum Ada Petugas Terpilih</p>
                            <p className="text-[9px] text-slate-400 max-w-[180px] leading-relaxed">Klik salah satu baris petugas di tabel kiri atau pilih batang kecamatan di atas untuk memfilter data operasional.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}