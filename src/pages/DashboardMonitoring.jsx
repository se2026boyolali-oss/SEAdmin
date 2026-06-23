import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';
import { supabase } from '../supabaseClient'; 

export default function DashboardMonitoring() {
    // --- STATE MANAGEMENT UTAMA ---
    const [selectedKecTab, setSelectedKecTab] = useState("SEMUA");
    const [selectedKecamatan, setSelectedKecamatan] = useState(null); 
    const [viewModeTab, setViewModeTab] = useState("DESA"); // DESA, PETUGAS, SLS
    const [selectedDesaCode, setSelectedDesaCode] = useState(null);
    const [selectedDesaName, setSelectedDesaName] = useState("");
    const [selectedPetugas, setSelectedPetugas] = useState(null);
    const [selectedPetugasEmail, setSelectedPetugasEmail] = useState(null); 

    const [loading, setLoading] = useState(true);
    const [rawData, setRawData] = useState([]);
    const [historyData, setHistoryData] = useState([]); // State data time-series
    
    // --- STATE STRUKTUR DATA MONITORING ---
    const [dataMonitoringWilayah, setDataMonitoringWilayah] = useState({
        kecamatan: [],
        desa: [],
        petugas: [],
        sls: [],
        muatanStatus: { selesai: 0, proses: 0, belum: 0 },
        statusSls: { selesai: 0, sedang: 0, belum: 0, total: 0 }
    });

    // --- STATE DATA ANOMALI CONTROL CENTER ---
    const [criticalPcl, setCriticalPcl] = useState({ macet: [], melambat: [] });
    const [chartTrenData, setChartTrenData] = useState([]);

    const susunanBarStatus = [
        { key: "submitted", label: "SUBMITTED BY Pencacah", fill: "#3b82f6", radius: undefined },  
        { key: "draft",     label: "DRAFT",                 fill: "#f97316", radius: undefined },  
        { key: "rejected",  label: "REJECTED BY Pengawas",  fill: "#ef4444", radius: undefined },  
        { key: "revoked",   label: "REVOKED BY Pengawas",   fill: "#991b1b", radius: undefined },  
        { key: "approved",  label: "APPROVED BY Pengawas",  fill: "#10b981", radius: undefined },  
        { key: "open",      label: "OPEN",                  fill: "#e2e8f0", radius: [4, 4, 0, 0] } 
    ];

    const namaKecamatanTerpilihText = selectedKecTab !== "SEMUA" 
        ? (dataMonitoringWilayah.kecamatan.find(k => k.kodeKec === selectedKecTab)?.nama_asli || selectedKecTab)
        : "";

    // --- FETCH DATA UTAMA & DATA RIWAYAT 15 HARI ---
    useEffect(() => {
        async function loadAllDashboardData() {
            try {
                setLoading(true);

                // 1. Ambil data progress lapangan real-time
                const { data: currentProgress, error: progressError } = await supabase
                    .from('progress_boyolali')
                    .select(`
                        idsubsls, kecamatan, kode_desa, nama_desa, kode_sls, nama_rt_dusun, status_progres,
                        muatan_sls (
                            nmsls, kdkec, nmkec, kddesa, nmdesa, petugas_id,
                            petugas (nama_petugas, posisi_tugas, id_pml_atasan)
                        )
                    `);
                if (progressError) throw progressError;

                // 2. Ambil data riwayat 15 hari terakhir untuk time-series
                const { data: historicalLogs, error: historyError } = await supabase
                    .from('history_progress_petugas')
                    .select('*')
                    .order('tanggal', { ascending: true });
                if (historyError) throw historyError;

                setRawData(currentProgress || []);
                setHistoryData(historicalLogs || []);
            } catch (err) {
                console.error("Control Center Load Error:", err.message);
            } finally {
                setLoading(false);
            }
        }
        loadAllDashboardData();
    }, []);

    // --- AGREGASI DATA & DETEKSI PETUGAS MACET ---
    useEffect(() => {
        if (rawData.length === 0) return;

        const kecMap = {};
        const desaMap = {};
        const petugasMap = {};
        const slsList = [];

        let globalApproved = 0, globalProses = 0, globalOpen = 0;
        let globalSlsSelesai = 0, globalSlsSedang = 0, globalSlsBelum = 0;

        rawData.forEach(row => {
            const relMuatan = row.muatan_sls || {};
            const relPetugas = relMuatan.petugas || {};

            const kodeKec = relMuatan.kdkec || "000";
            const namaKec = row.kecamatan || relMuatan.nmkec || "Unknown";
            const kodeDesa = row.kode_desa || relMuatan.kddesa || "000";
            const namaDesa = row.nama_desa || relMuatan.nmdesa || "Unknown";
            
            const emailPetugas = relMuatan.petugas_id || "Tanpa Petugas";
            const namaPetugas = relPetugas.nama_petugas ? `${relPetugas.nama_petugas} (${relPetugas.posisi_tugas || 'PCL'})` : emailPetugas;

            const statusProgres = row.status_progres || {};
            
            const s_submitted = parseInt(statusProgres["SUBMITTED BY Pencacah"]) || 0;
            const s_draft     = parseInt(statusProgres["DRAFT"]) || 0;
            const s_rejected  = parseInt(statusProgres["REJECTED BY Pengawas"]) || 0;
            const s_revoked   = parseInt(statusProgres["REVOKED BY Pengawas"]) || 0;
            const s_approved  = parseInt(statusProgres["APPROVED BY Pengawas"]) || 0;
            const s_open      = parseInt(statusProgres["OPEN"]) || 0;

            const totalTarget = s_submitted + s_draft + s_rejected + s_revoked + s_approved + s_open;

            let statusSlsKategori = "belum";
            if (totalTarget > 0) {
                if (s_approved === totalTarget) {
                    statusSlsKategori = "selesai";
                    globalSlsSelesai++;
                } else if (s_open < totalTarget) {
                    statusSlsKategori = "sedang";
                    globalSlsSedang++;
                } else {
                    globalSlsBelum++;
                }
            } else {
                globalSlsBelum++;
            }

            globalApproved += s_approved;
            globalProses   += (s_submitted + s_draft + s_rejected + s_revoked);
            globalOpen     += s_open;

            const initStrukturData = (kode, namaTampilan, namaAsli) => ({
                kodeKec, kodeDesa, nama: namaTampilan, nama_asli: namaAsli,
                submitted: 0, draft: 0, rejected: 0, revoked: 0, approved: 0, open: 0,
                t: 0, jml_sls: 0, sls_selesai: 0
            });

            if (!kecMap[kodeKec]) kecMap[kodeKec] = initStrukturData(kodeKec, `${namaKec} [${kodeKec}]`, namaKec);
            kecMap[kodeKec].submitted += s_submitted; kecMap[kodeKec].draft += s_draft;
            kecMap[kodeKec].rejected += s_rejected; kecMap[kodeKec].revoked += s_revoked;
            kecMap[kodeKec].approved += s_approved; kecMap[kodeKec].open += s_open;
            kecMap[kodeKec].t += totalTarget; kecMap[kodeKec].jml_sls += 1;
            if (statusSlsKategori === "selesai") kecMap[kodeKec].sls_selesai += 1;

            if (!desaMap[kodeDesa]) desaMap[kodeDesa] = initStrukturData(kodeDesa, namaDesa, namaDesa);
            desaMap[kodeDesa].submitted += s_submitted; desaMap[kodeDesa].draft += s_draft;
            desaMap[kodeDesa].rejected += s_rejected; desaMap[kodeDesa].revoked += s_revoked;
            desaMap[kodeDesa].approved += s_approved; desaMap[kodeDesa].open += s_open;
            desaMap[kodeDesa].t += totalTarget; desaMap[kodeDesa].jml_sls += 1;
            if (statusSlsKategori === "selesai") desaMap[kodeDesa].sls_selesai += 1;

            if (!petugasMap[emailPetugas]) {
                const initData = initStrukturData(emailPetugas, namaPetugas, namaPetugas);
                initData.email = emailPetugas;
                petugasMap[emailPetugas] = initData;
            }
            petugasMap[emailPetugas].submitted += s_submitted; petugasMap[emailPetugas].draft += s_draft;
            petugasMap[emailPetugas].rejected += s_rejected; petugasMap[emailPetugas].revoked += s_revoked;
            petugasMap[emailPetugas].approved += s_approved; petugasMap[emailPetugas].open += s_open;
            petugasMap[emailPetugas].t += totalTarget; petugasMap[emailPetugas].jml_sls += 1;
            if (statusSlsKategori === "selesai") petugasMap[emailPetugas].sls_selesai += 1;

            slsList.push({
                idsubsls: row.idsubsls, kodeKec, kodeDesa, petugas_id: emailPetugas,
                nama: row.nama_rt_dusun || relMuatan.nmsls || row.idsubsls,
                nama_asli: row.nama_rt_dusun || relMuatan.nmsls || row.idsubsls,
                total_target: totalTarget, total_realisasi: totalTarget - s_open,
                submitted: totalTarget > 0 ? Math.round((s_submitted / totalTarget) * 100) : 0,
                draft: totalTarget > 0 ? Math.round((s_draft / totalTarget) * 100) : 0,
                rejected: totalTarget > 0 ? Math.round((s_rejected / totalTarget) * 100) : 0,
                revoked: totalTarget > 0 ? Math.round((s_revoked / totalTarget) * 100) : 0,
                approved: totalTarget > 0 ? Math.round((s_approved / totalTarget) * 100) : 0,
                open: totalTarget > 0 ? Math.round((s_open / totalTarget) * 100) : 100,
                jml_sls: 1, sls_selesai: statusSlsKategori === "selesai" ? 1 : 0
            });
        });

        const formatKePersen = (obj) => {
            const total = obj.t || 1;
            return {
                ...obj, total_target: obj.t, total_realisasi: obj.t - obj.open,
                submitted: Math.round((obj.submitted / total) * 100),
                draft: Math.round((obj.draft / total) * 100),
                rejected: Math.round((obj.rejected / total) * 100),
                revoked: Math.round((obj.revoked / total) * 100),
                approved: Math.round((obj.approved / total) * 100),
                open: Math.round((obj.open / total) * 100)
            };
        };

        const sortedKecamatan = Object.values(kecMap).map(formatKePersen).sort((a, b) => a.kodeKec.localeCompare(b.kodeKec, undefined, { numeric: true }));
        const sortedDesa = Object.values(desaMap).map(formatKePersen).sort((a, b) => a.kodeDesa.localeCompare(b.kodeDesa, undefined, { numeric: true }));
        
        const sortedPetugas = Object.values(petugasMap)
            .map(formatKePersen)
            .sort((a, b) => (100 - b.open) - (100 - a.open));

        const sortedSls = slsList.sort((a, b) => a.idsubsls.localeCompare(b.idsubsls, undefined, { numeric: true }));

        setDataMonitoringWilayah({
            kecamatan: sortedKecamatan, desa: sortedDesa, petugas: sortedPetugas, sls: sortedSls,
            muatanStatus: { selesai: globalApproved, proses: globalProses, belum: globalOpen },
            statusSls: { selesai: globalSlsSelesai, sedang: globalSlsSedang, belum: globalSlsBelum, total: rawData.length }
        });

        // 🚀 METODE DETEKSI ANOMALI PETUGAS (Macet vs Melambat)
        const listMacet = [];
        const listMelambat = [];
        const tanggalUnik = [...new Set(historyData.map(h => h.tanggal))].sort();
        const tglHariIni = tanggalUnik[tanggalUnik.length - 1];
        const tgl3HariLalu = tanggalUnik[tanggalUnik.length - 4];

        Object.values(petugasMap).forEach(p => {
            if (p.email === "Tanpa Petugas") return;
            const logHariIni = historyData.find(h => h.petugas_id === p.email && h.tanggal === tglHariIni)?.total_capaian || (p.t - p.open);
            const log3HariLalu = historyData.find(h => h.petugas_id === p.email && h.tanggal === tgl3HariLalu)?.total_capaian || 0;
            
            const delta = logHariIni - log3HariLalu;

            if (delta === 0) {
                listMacet.push({ email: p.email, nama: p.nama_asli, delta, kodeKec: p.kodeKec });
            } else if (delta > 0 && delta < 10) {
                listMelambat.push({ email: p.email, nama: p.nama_asli, delta, kodeKec: p.kodeKec });
            }
        });

        setCriticalPcl({ macet: listMacet, melambat: listMelambat });

    }, [rawData, historyData]);

    // 🚀 AGREGASI DATA TIME-SERIES UNTUK GRAFIK TREN AREA CHART
    useEffect(() => {
        if (historyData.length === 0) return;

        const tanggalUnik = [...new Set(historyData.map(h => h.tanggal))].sort();
        
        const dataChartGaris = tanggalUnik.map(tgl => {
            let filteredLogs = historyData.filter(h => h.tanggal === tgl);

            if (selectedKecTab !== "SEMUA") {
                filteredLogs = filteredLogs.filter(h => h.kode_kec === selectedKecTab);
            }
            if (selectedDesaCode) {
                filteredLogs = filteredLogs.filter(h => h.kode_desa === selectedDesaCode);
            }
            if (selectedPetugasEmail) {
                filteredLogs = filteredLogs.filter(h => h.petugas_id === selectedPetugasEmail);
            }

            const total = filteredLogs.reduce((sum, item) => sum + (item.total_capaian || 0), 0);
            
            // Format tanggal agar ringkas di sumbu X (misal: 2026-06-23 -> 23 Jun)
            const dateObj = new Date(tgl);
            const labelTanggal = `${dateObj.getDate()} ${dateObj.toLocaleString('id-ID', { month: 'short' })}`;

            return { tanggalRaw: tgl, label: labelTanggal, "Capaian Kumulatif": total };
        });

        setChartTrenData(dataChartGaris);
    }, [historyData, selectedKecTab, selectedDesaCode, selectedPetugasEmail]);

    const handleDownloadSlsExcel = () => {
        alert("Fitur Export Excel terpicu untuk cakupan: " + selectedKecTab + " - Mode: " + viewModeTab);
    };
    
    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen text-slate-500 font-bold text-xs uppercase tracking-widest animate-pulse">
                ⏳ Sinkronisasi Komando Control Center Supabase...
            </div>
        );
    }

    return (
        <div className="p-6 bg-slate-100 min-h-screen space-y-6">
            
            {/* 🚀 BARIS ATAS: DASHBOARD CONTROL CENTER SUMMARY CARD */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white border-l-4 border-rose-500 p-4 rounded-2xl shadow-xs">
                    <div className="text-[9px] font-black uppercase text-slate-400 tracking-wider">PCL Macet Total (3 Hari Terakhir)</div>
                    <div className="text-2xl font-mono font-black text-rose-600 mt-1">{criticalPcl.macet.length} <span className="text-xs text-slate-400 font-sans font-bold">Orang</span></div>
                    <p className="text-[8px] text-slate-400 mt-1 font-bold">Capaian stagnan (penambahan 0 dokumen)</p>
                </div>
                <div className="bg-white border-l-4 border-amber-500 p-4 rounded-2xl shadow-xs">
                    <div className="text-[9px] font-black uppercase text-slate-400 tracking-wider">PCL Melambat Penugasan</div>
                    <div className="text-2xl font-mono font-black text-amber-600 mt-1">{criticalPcl.melambat.length} <span className="text-xs text-slate-400 font-sans font-bold">Orang</span></div>
                    <p className="text-[8px] text-slate-400 mt-1 font-bold">Produktivitas rendah (kurang dari 10 muatan)</p>
                </div>
                <div className="bg-white border-l-4 border-blue-500 p-4 rounded-2xl shadow-xs">
                    <div className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Antrean Review Pengawas (Submitted)</div>
                    <div className="text-2xl font-mono font-black text-blue-600 mt-1">{dataMonitoringWilayah.muatanStatus.proses.toLocaleString('id-ID')} <span className="text-xs text-slate-400 font-sans font-bold">Dokumen</span></div>
                    <p className="text-[8px] text-slate-400 mt-1 font-bold">Menunggu respon persetujuan/penolakan PML</p>
                </div>
                <div className="bg-white border-l-4 border-emerald-500 p-4 rounded-2xl shadow-xs">
                    <div className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Total Hasil Bersih (Approved)</div>
                    <div className="text-2xl font-mono font-black text-emerald-600 mt-1">{dataMonitoringWilayah.muatanStatus.selesai.toLocaleString('id-ID')} <span className="text-xs text-slate-400 font-sans font-bold">Muatan</span></div>
                    <p className="text-[8px] text-slate-400 mt-1 font-bold">Data sah yang sudah dikunci pengawas</p>
                </div>
            </div>

            {/* BARIS UTAMA: GRAFIK BATANG & REKAP BULAT */}
            <div className="bg-white p-5 border border-slate-200 rounded-3xl shadow-sm">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                            {selectedKecTab === "SEMUA"
                                ? "Capaian Realisasi Lapangan Kabupaten (Per Kecamatan)"
                                : selectedPetugasEmail 
                                    ? `Capaian Lapangan Petugas: ${selectedPetugas} - Per SLS`
                                    : `Capaian Realisasi Lapangan Kec. ${namaKecamatanTerpilihText} (${viewModeTab === "DESA" ? "Per Desa" : viewModeTab === "PETUGAS" ? "Per Petugas" : `Desa ${selectedDesaName || ''} - Per SLS`})`}
                        </h3>
                    </div>
                    <div className="flex items-center gap-3">
                        {selectedKecTab !== "SEMUA" && !selectedPetugasEmail && (
                            <div className="bg-slate-100 p-1 rounded-xl flex gap-1 border border-slate-200/60 shadow-inner">
                                <button onClick={() => { setViewModeTab("DESA"); setSelectedDesaCode(null); }} className={`text-[9px] font-black px-3 py-1.5 rounded-lg transition-all uppercase tracking-wide ${viewModeTab === "DESA" ? "bg-white text-slate-800 shadow-sm" : "text-slate-400 hover:text-slate-600 hover:bg-slate-200/50"}`}>📍 Per Desa</button>
                                <button onClick={() => setViewModeTab("PETUGAS")} className={`text-[9px] font-black px-3 py-1.5 rounded-lg transition-all uppercase tracking-wide ${viewModeTab === "PETUGAS" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400 hover:text-slate-600 hover:bg-slate-200/50"}`}>🏃‍♂️ Per Petugas</button>
                            </div>
                        )}
                        {selectedKecTab !== "SEMUA" && (
                            <button
                                onClick={() => {
                                    if (viewModeTab === "SLS") {
                                        if (selectedPetugasEmail) {
                                            setViewModeTab("PETUGAS");
                                            setSelectedPetugasEmail(null);
                                            setSelectedPetugas(null);
                                        } else {
                                            setViewModeTab("DESA");
                                            setSelectedDesaCode(null);
                                        }
                                    } else {
                                        setSelectedKecTab("SEMUA");
                                        setSelectedKecamatan(null);
                                        setSelectedPetugas(null);
                                        setSelectedPetugasEmail(null);
                                    }
                                }}
                                className="bg-slate-800 hover:bg-slate-900 text-white text-[9px] font-black px-4 py-1.5 rounded-xl transition-all uppercase tracking-wider shadow-sm flex items-center gap-1"
                            >
                                ← Kembali
                            </button>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
                    <div className="lg:col-span-3 w-full overflow-x-auto overflow-y-hidden scrollbar-thin">
                        <div className="h-[420px] w-full min-w-[500px] md:min-w-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={
                                        selectedKecTab === "SEMUA"
                                            ? dataMonitoringWilayah.kecamatan
                                            : viewModeTab === "DESA"
                                                ? dataMonitoringWilayah.desa.filter(d => d.kodeKec === selectedKecTab)
                                                : viewModeTab === "PETUGAS"
                                                    ? dataMonitoringWilayah.petugas.filter(p => p.kodeKec === selectedKecTab)
                                                    : selectedPetugasEmail
                                                        ? dataMonitoringWilayah.sls.filter(s => s.petugas_id === selectedPetugasEmail) 
                                                        : dataMonitoringWilayah.sls.filter(s => s.kodeKec === selectedKecTab && s.kodeDesa === selectedDesaCode)
                                    }
                                    margin={{ bottom: 40, left: -15, right: 10, top: 10 }}
                                    barCategoryGap="25%"
                                >
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="nama" stroke="#94a3b8" fontSize={8} tickLine={false} angle={-45} textAnchor="end" interval={0} height={50} tick={{ fontWeight: 700 }} />
                                    <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} unit="%" domain={[0, 100]} />
                                    
                                    <Tooltip
                                        cursor={{ fill: '#f8fafc', opacity: 0.5 }}
                                        content={({ active, payload }) => {
                                            if (active && payload && payload.length) {
                                                const data = payload[0].payload;
                                                return (
                                                    <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xl text-[11px] space-y-1.5 font-sans min-w-[210px] z-50">
                                                        <div className="font-black text-slate-800 uppercase tracking-wide border-b border-slate-100 pb-1.5 mb-1 flex items-center gap-1">
                                                            {viewModeTab === "PETUGAS" ? "🏃‍♂️" : viewModeTab === "SLS" ? "🏠" : "📍"} {data.nama_asli}
                                                        </div>
                                                        <div className="space-y-1 font-medium text-slate-500">
                                                            <div className="flex justify-between border-b border-slate-50 pb-1 mb-1">
                                                                <span>Total Target:</span>
                                                                <strong className="text-slate-800 font-mono">{data.total_target.toLocaleString('id-ID')} Muatan</strong>
                                                            </div>
                                                            <div className="flex justify-between items-center"><span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#10b981]"></span> Approved:</span><strong className="text-emerald-600 font-mono">{data.approved}%</strong></div>
                                                            <div className="flex justify-between items-center"><span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#3b82f6]"></span> Submitted:</span><strong className="text-blue-600 font-mono">{data.submitted}%</strong></div>
                                                            <div className="flex justify-between items-center"><span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#f97316]"></span> Draft:</span><strong className="text-orange-600 font-mono">{data.draft}%</strong></div>
                                                            <div className="flex justify-between items-center"><span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#ef4444]"></span> Rejected:</span><strong className="text-red-600 font-mono">{data.rejected}%</strong></div>
                                                            <div className="flex justify-between items-center"><span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#991b1b]"></span> Revoked:</span><strong className="text-red-950 font-mono">{data.revoked}%</strong></div>
                                                            <div className="flex justify-between items-center"><span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#94a3b8]"></span> Open:</span><strong className="text-slate-500 font-mono">{data.open}%</strong></div>
                                                        </div>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        }}
                                    />

                                    {susunanBarStatus.map((b) => (
                                        <Bar
                                            key={b.key} dataKey={b.key} stackId="a" fill={b.fill} maxBarSize={30} radius={b.radius}
                                            style={{ cursor: (viewModeTab !== 'SLS') ? 'pointer' : 'default' }}
                                            onClick={(clickedItem) => {
                                                if (!clickedItem) return;
                                                if (selectedKecTab === "SEMUA") {
                                                    const matchKode = clickedItem.nama ? clickedItem.nama.match(/\d+/) : null;
                                                    if (matchKode && matchKode[0]) {
                                                        setSelectedKecTab(matchKode[0]);
                                                        setSelectedKecamatan(matchKode[0]);
                                                        setSelectedPetugas(null);
                                                        setSelectedPetugasEmail(null);
                                                        setViewModeTab("DESA");
                                                    }
                                                }
                                                else if (viewModeTab === "DESA" && clickedItem.kodeDesa) {
                                                    setSelectedDesaCode(clickedItem.kodeDesa);
                                                    setSelectedDesaName(clickedItem.nama_asli);
                                                    setViewModeTab("SLS");
                                                }
                                                else if (viewModeTab === "PETUGAS" && clickedItem.email) {
                                                    setSelectedPetugasEmail(clickedItem.email);
                                                    setSelectedPetugas(clickedItem.nama_asli);
                                                    setViewModeTab("SLS");
                                                }
                                            }}
                                        >
                                            {b.key === "open" && (
                                                <LabelList
                                                    position="insideBottom" offset={8}
                                                    style={{ fill: '#1e293b', fontSize: '10px', fontWeight: '900', fontFamily: 'monospace' }}
                                                    valueAccessor={(entry) => {
                                                        if (!entry) return "";
                                                        const rawData = entry.payload || entry;
                                                        const totalProgres = 100 - (parseFloat(rawData.open) || 0);
                                                        return totalProgres > 0 ? `${totalProgres.toFixed(0)}%` : "0%";
                                                    }}
                                                />
                                            )}
                                        </Bar>
                                    ))}
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="lg:col-span-1 space-y-4 border-l border-slate-100 pl-2 lg:pl-4">
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center lg:text-left">Progres Lapangan</div>
                        <div className="h-44 w-full relative group">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart margin={{ top: 0, right: 0, bottom: 5, left: 0 }}>
                                    <Pie
                                        data={[
                                            { name: 'Selesai', value: dataMonitoringWilayah.muatanStatus.selesai },
                                            { name: 'Proses', value: dataMonitoringWilayah.muatanStatus.proses },
                                            { name: 'Belum', value: dataMonitoringWilayah.muatanStatus.belum }
                                        ]}
                                        cx="50%" cy="45%" innerRadius={42} outerRadius={55} paddingAngle={3} dataKey="value" stroke="none"
                                    >
                                        <Cell fill="#10b981" /><Cell fill="#f97316" /><Cell fill="#e2e8f0" />
                                    </Pie>
                                    <text x="50%" y="35%" textAnchor="middle" dominantBaseline="middle" className="fill-slate-800 font-mono font-black text-[14px]">
                                        {(dataMonitoringWilayah.muatanStatus.selesai + dataMonitoringWilayah.muatanStatus.proses + dataMonitoringWilayah.muatanStatus.belum).toLocaleString('id-ID')}
                                    </text>
                                </PieChart>
                            </ResponsiveContainer>
                        </div>

                        <div className="space-y-2 mt-4">
                            {[
                                { label: 'SLS Selesai Didata', count: dataMonitoringWilayah.statusSls.selesai, color: 'bg-emerald-500' },
                                { label: 'SLS Sedang Didata', count: dataMonitoringWilayah.statusSls.sedang, color: 'bg-indigo-500' },
                                { label: 'SLS Belum Mulai', count: dataMonitoringWilayah.statusSls.belum, color: 'bg-slate-300' }
                            ].map((item) => {
                                const totalSls = dataMonitoringWilayah.statusSls.total || 1;
                                return (
                                    <div key={item.label} className="flex items-center justify-between bg-slate-50/70 px-3 py-2 rounded-xl border border-slate-100 text-[10px]">
                                        <span className="font-bold text-slate-500 uppercase">{item.label}</span>
                                        <span className="font-mono font-black text-slate-700">{item.count} SLS</span>
                                    </div>
                                );
                            })}
                            <button onClick={handleDownloadSlsExcel} className="w-full bg-emerald-600 text-white py-2 rounded-xl text-[10px] font-black uppercase tracking-wider shadow-xs mt-2">Export Status SLS</button>
                        </div>
                    </div>
                </div>
            </div>

            {/* 🚀 BARIS TENGAH: DIAGRAM TREN TIME-SERIES 2 MINGGU TERAKHIR */}
            <div className="bg-white p-5 border border-slate-200 rounded-3xl shadow-sm">
                <div className="mb-4">
                    <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                        📈 Grafik Tren Realisasi Penugasan (2 Minggu Terakhir)
                    </h4>
                    <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">
                        Cakupan aktif: {selectedKecTab === "SEMUA" ? "Satu Kabupaten Boyolali" : selectedPetugasEmail ? `PCL ${selectedPetugas}` : selectedDesaCode ? `Desa ${selectedDesaName}` : `Kecamatan ${namaKecamatanTerpilihText}`}
                    </p>
                </div>
                <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartTrenData} margin={{ left: -20, right: 10, bottom: 5, top: 10 }}>
                            <defs>
                                <linearGradient id="colorCapaian" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2}/>
                                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="label" stroke="#94a3b8" fontSize={9} tickLine={false} tick={{ fontWeight: 600 }} />
                            <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} />
                            <Tooltip content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                    return (
                                        <div className="bg-slate-900 text-white p-2.5 rounded-xl text-[11px] font-mono shadow-xl border border-slate-800">
                                            <div className="font-sans font-bold border-b border-slate-700 pb-1 mb-1 text-slate-400">{payload[0].payload.tanggalRaw}</div>
                                            <div>Akumulasi: <strong className="text-indigo-400">{payload[0].value.toLocaleString('id-ID')}</strong> Muatan</div>
                                        </div>
                                    );
                                }
                                return null;
                            }}/>
                            <Area type="monotone" dataKey="Capaian Kumulatif" stroke="#6366f1" strokeWidth={2.5} fillOpacity={1} fill="url(#colorCapaian)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* 🚀 BARIS BAWAH: PANEL CONTROL CENTER - DAFTAR ANOMALI & RADAR PERINGATAN PCL */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Panel Kiri: Radar PCL Macet Total */}
                <div className="bg-white p-4 border border-slate-200 rounded-3xl shadow-sm flex flex-col h-[320px]">
                    <div className="border-b border-slate-100 pb-3 mb-3 flex justify-between items-center">
                        <span className="text-[10px] font-black text-rose-600 uppercase tracking-wider flex items-center gap-1">🚨 PCL Macet Total (3 Hari Tanpa Input)</span>
                        <span className="bg-rose-50 text-rose-600 text-[9px] font-mono font-black px-2 py-0.5 rounded-full">{criticalPcl.macet.filter(p => selectedKecTab === "SEMUA" || p.kodeKec === selectedKecTab).length} Orang</span>
                    </div>
                    <div className="overflow-y-auto flex-1 space-y-2 pr-1 scrollbar-thin">
                        {criticalPcl.macet.filter(p => selectedKecTab === "SEMUA" || p.kodeKec === selectedKecTab).length === 0 ? (
                            <div className="text-center text-slate-400 text-[10px] font-bold py-12 uppercase">✅ Semua PCL Aktif Bergerak</div>
                        ) : (
                            criticalPcl.macet.filter(p => selectedKecTab === "SEMUA" || p.kodeKec === selectedKecTab).map(pcl => (
                                <div key={pcl.email} className="flex justify-between items-center bg-slate-50 p-2.5 rounded-xl border border-slate-100 hover:bg-slate-100 transition-colors">
                                    <div className="max-w-[70%]">
                                        <div className="text-[11px] font-black text-slate-700 truncate">{pcl.nama}</div>
                                        <div className="text-[8px] text-slate-400 font-mono truncate">{pcl.email}</div>
                                    </div>
                                    <a 
                                        href={`https://wa.me/628123456789?text=Halo%20${encodeURIComponent(pcl.nama)},%20hasil%20monitoring%20Sensus%20Ekonomi%20Boyolali%20menunjukkan%20data%20Anda%20stagnan%20(tidak%20ada%20penambahan)%20dalam%203%20hari%20terakhir.%20Apakah%20ada%20kendala%20di%20lapangan?`} 
                                        target="_blank" rel="noreferrer"
                                        className="bg-rose-600 hover:bg-rose-700 text-white text-[9px] font-black px-3 py-1.5 rounded-lg flex items-center gap-1 uppercase transition-all shadow-xs"
                                    >
                                        ⚡ Senggol PCL
                                    </a>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Panel Kanan: Radar PCL Melambat */}
                <div className="bg-white p-4 border border-slate-200 rounded-3xl shadow-sm flex flex-col h-[320px]">
                    <div className="border-b border-slate-100 pb-3 mb-3 flex justify-between items-center">
                        <span className="text-[10px] font-black text-amber-600 uppercase tracking-wider flex items-center gap-1">⚠️ PCL Melambat (3 Hari Terakhir &lt; 10 Dokumen)</span>
                        <span className="bg-amber-50 text-amber-600 text-[9px] font-mono font-black px-2 py-0.5 rounded-full">{criticalPcl.melambat.filter(p => selectedKecTab === "SEMUA" || p.kodeKec === selectedKecTab).length} Orang</span>
                    </div>
                    <div className="overflow-y-auto flex-1 space-y-2 pr-1 scrollbar-thin">
                        {criticalPcl.melambat.filter(p => selectedKecTab === "SEMUA" || p.kodeKec === selectedKecTab).length === 0 ? (
                            <div className="text-center text-slate-400 text-[10px] font-bold py-12 uppercase">🎉 Ritme Kecepatan PCL Normal</div>
                        ) : (
                            criticalPcl.melambat.filter(p => selectedKecTab === "SEMUA" || p.kodeKec === selectedKecTab).map(pcl => (
                                <div key={pcl.email} className="flex justify-between items-center bg-slate-50 p-2.5 rounded-xl border border-slate-100 hover:bg-slate-100 transition-colors">
                                    <div className="max-w-[65%]">
                                        <div className="text-[11px] font-black text-slate-700 truncate">{pcl.nama}</div>
                                        <div className="text-[8px] text-amber-600 font-bold font-mono uppercase mt-0.5">Hanya bertambah: +{pcl.delta} Muatan</div>
                                    </div>
                                    <a 
                                        href={`https://wa.me/628123456789?text=Halo%20${encodeURIComponent(pcl.nama)},%20grafik%20monitoring%20menunjukkan%20ritme%20pendataan%20Anda%20sedang%20melambat%20(hanya%20bertambah%20${pcl.delta}%20dokumen%20dalam%203%20hari).%20Mari%20dikebut%20kembali%20targetnya.`} 
                                        target="_blank" rel="noreferrer"
                                        className="bg-amber-500 hover:bg-amber-600 text-white text-[9px] font-black px-3 py-1.5 rounded-lg flex items-center gap-1 uppercase transition-all shadow-xs"
                                    >
                                        💬 Motivasi PCL
                                    </a>
                                </div>
                            ))
                        )}
                    </div>
                </div>

            </div>

        </div>
    );
}