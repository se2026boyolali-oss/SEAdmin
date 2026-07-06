import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import ReactMarkdown from 'react-markdown';
// 🚀 Impor SDK Google Gen AI langsung di sisi klien
import { GoogleGenAI } from "@google/genai";

export default function ChatAssistant() {
    const { profile } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [inputMessage, setInputMessage] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const chatEndRef = useRef(null);

    // Auto-scroll ke pesan paling baru
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isLoading]);

    // Pesan sambutan pertama kali chat dibuka
    useEffect(() => {
        if (profile?.nama_pengguna) {
            setMessages([
                {
                    id: 1,
                    sender: 'bot',
                    text: `Halo ${profile.nama_pengguna.toUpperCase()}! Silakan ketik deskripsi pekerjaan responden, dan saya akan carikan kandidat kode pekerjaan yang paling sesuai.`
                }
            ]);
        }
    }, [profile]);

    if (!profile) return null;

    // Fungsi Utama: Memanggil Gemini Langsung dari Browser Petugas (Bypass Vercel)
    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!inputMessage.trim() || isLoading) return;

        const userText = inputMessage;
        setInputMessage(""); 
        setIsLoading(true);

        const currentUserId = Date.now();
        const currentBotId = currentUserId + 1;

        // Tampilkan ketikan petugas di layar chat
        setMessages(prev => [...prev, { id: currentUserId, sender: 'user', text: userText }]);

        try {
            // 🌟 STRATEGI MULTI-API KEY DI SISI KLIEN
            // Ambil string API Keys dari environment variable Vite Anda
            const keysString = import.meta.env.VITE_GEMINI_API_KEYS || "";
            const apiKeysPool = keysString.split(",").map(key => key.trim()).filter(key => key.length > 0);

            if (apiKeysPool.length === 0) {
                throw new Error('Konfigurasi VITE_GEMINI_API_KEYS belum dipasang di sistem.');
            }

            // Acak atau gilir kunci API yang akan digunakan
            const randomIndex = Math.floor(Math.random() * apiKeysPool.length);
            const selectedApiKey = apiKeysPool[randomIndex];

            // Inisialisasi AI langsung di browser
            const ai = new GoogleGenAI({ apiKey: selectedApiKey });

            const systemInstruction = `
                Kamu adalah asisten pintar sensus ekonomi (SE2026). Tugasmu menerjemahkan deskripsi pekerjaan dari petugas menjadi kode profesi 3-digit yang paling cocok berdasarkan daftar resmi yang kamu miliki.
                
                000. Tidak Bekerja
                001. Agen Tenaga Kerja
                002. Ahli Sejarah dan Cagar budaya
                003. Akuntan
                004. Analis Keuangan
                005. Anggota DPD
                006. Anggota DPR RI/MPR RI
                007. Anggota DPRD Provinsi/ Anggota DPRD Kabupaten/Kota
                008. Apoteker
                009. Arsiparis
                010. Arsitek
                011. Asisten Apoteker
                012. Atase
                013. Atlet/Olahragawan
                014. Awak Kapal
                015. Bhikkhu
                016. Biarawan
                017. Biarawati
                018. Bidan
                019. Broker/Pialang Saham
                020. Bupati
                021. Buruh Angkut Barang
                022. Buruh Bangunan
                023. Buruh Industri
                024. Buruh Perikanan
                025. Buruh Pertambangan
                026. Buruh Pertanian/Kehutanan
                027. Buruh Peternakan
                028. Camat
                029. Chef
                030. Chief Executive Officer (CEO)
                031. Dokter Gigi
                032. Dokter Hewan
                033. Dokter Spesialis
                034. Dokter Umum
                035. Dosen
                036. Duta Besar
                037. Empu Keris
                038. Fotografer
                039. Gembala
                040. Gubernur
                041. Guru
                042. Hakim
                043. Hakim Agung
                044. Imam Masjid
                045. Jaksa
                046. Jaksa Agung
                047. JiaoSheng
                048. Juru Gambar Teknik/Drafter
                049. Kameramen
                050. Kapten Kapal
                051. Kasir
                052. Kepala Desa
                053. Ketua Adat
                054. Ketua Organisasi
                055. Konsultan
                056. Kreator Konten
                057. Kurator
                058. Kurir
                059. Lurah
                060. Makelar
                061. Manajer
                062. Masinis
                063. Mekanik
                064. Menteri/Kepala Badan (setingkat Menteri)/ Wakil Menteri/Wakil Kepala Badan
                065. Nakhoda
                066. Nelayan
                067. Notaris
                068. Operator Layanan Pelanggan (Customer Service)
                069. Operator Mesin
                070. Pendita
                071. Panitera Pengadilan
                072. Paraji
                073. Paranormal
                074. Pastor
                075. Pedagang
                076. Pedagang Asongan/Keliling Makanan
                077. Pedagang Asongan/Keliling Nonmakanan
                078. Pedagang Online
                079. Pegawai Pemerintah dengan Perjanjian Kerja (PPPK)
                080. Pekerja Garmen/Konveksi
                081. Pekerja Percetakan
                082. Pekerja Profesional Penjualan (agen asuransi, sales penjualan, dll)
                083. Pekerja Sosial
                084. Pelaku Ekosistem Musik
                085. Pelaku Ekosistem Perfilman
                086. Pelaku Ekosistem Seni Pertunjukan
                087. Pelaku Ekosistem Seni Rupa dan Kriya
                088. Pelatih/ Instruktur Olahraga
                089. Pelayan Toko
                090. Pembantu/Asisten Rumah Tangga
                091. Pemberi Pinjaman
                092. Pembuat Makanan/Juru Masak
                093. Pembuat Minuman (Barista, Bartender, dll)
                094. Pembuat Rokok/Cerutu/Tembakau Gulung
                095. Pembuat Sepatu dan Tas
                096. Pembudi Daya Ikan dan Biota Air Lainnya
                097. Pemulung
                098. Penagih Hutang (Debt Collector)
                099. Penasihat Spiritual
                100. Penata Busana
                101. Penata Rambut
                102. Penata Rias
                103. Penata Suara
                104. Pendeta
                105. Peneliti
                106. Penerjemah
                107. Pengacara
                108. Pengasuh Anak (Baby Sitter)
                109. Pengelola Gedung/Properti
                110. Pengemudi Ojek Online
                111. Pengemudi Ojek Pangkalan
                112. Pengepul
                113. Penjaga Keamanan/Satpam
                114. Penjahit
                115. Penulis
                116. Penyelenggara Acara (Event Organizer/EO)
                117. Penyiar Radio
                118. Penyiar Televisi
                119. Perajin Batu
                120. Perajin Kayu, Bambu, dan Anyaman
                121. Perajin Kulit dan Tekstil
                122. Perajin Logam
                123. Perajin Perhiasan
                124. Perajin Tembikar/Keramik
                125. Peramal
                126. Perancang Busana/Desainer
                127. Perangkat Desa
                128. Perawat
                129. Petani/Pekebun/Petani Hutan
                130. Peternak
                131. Petugas Pemadam Kebakaran
                132. Petugas Stasiun Pengisian Bahan Bakar
                133. Pilot
                134. Pinandita
                135. PNS Fungsional Tertentu
                136. PNS Fungsional Umum
                137. PNS Struktural
                138. Polisi
                139. Pramugara/i
                140. Pramusaji
                141. Presiden
                142. Programer
                143. Psikiater
                144. Psikolog
                145. Pustakawan
                146. Resepsionis
                147. Sekretaris
                148. Seniman/Artis
                149. Sopir
                150. Supervisor/Mandor
                151. Tabib
                152. Teknisi
                153. Teller Bank
                154. Tenaga Cuci
                155. Tenaga Humas
                156. Tenaga Kebersihan
                157. Tenaga Tata Usaha
                158. Tentara Nasional Indonesia (TNI)
                159. Tukang Bangunan
                160. Tukang Cat
                161. Tukang Cukur
                162. Tukang Fotokopi
                163. Tukang Gigi
                164. Tukang Kaca
                165. Tukang Kayu
                166. Tukang Kunci
                167. Tukang Las/Pandai Besi
                168. Tukang Listrik
                169. Tukang Pijat
                170. Tukang Pipa
                171. Tukang Sablon
                172. Tukang Sol Sepatu
                173. Tukang Tambal Ban
                174. Tukang Tebang Kayu
                175. Uskup
                176. Ustaz/Mubalig
                177. Wakil Bupati
                178. Wakil Gubernur
                179. Wakil Presiden
                180. Wakil Walikota
                181. Walikota
                182. Wartawan
                183. Wenshi
                184. Xueshi
                185. Lainnya

                ATURAN FORMAT JAWABAN (MANDATORI):
                1. Langsung berikan maksimal 3 rekomendasi teratas tanpa kalimat sapaan pembuka dan tanpa kalimat penutup.
                2. Setiap rekomendasi WAJIB ditulis dengan format kaku seperti ini:
                
                **KODE. NAMA PROFESI** (Persentase Kecocokan%)
                *Alasan:* Tulis alasan logis singkat di sini kenapa kode ini cocok.

                3. Pisahkan setiap rekomendasi dengan satu baris kosong.
            `;

            // 🌟 Tembak langsung ke API Google dari sisi klien
            const response = await ai.models.generateContent({
                model: "gemini-3.1-flash-lite",
                contents: `Tentukan kode yang paling pas untuk deskripsi pekerjaan berikut: "${userText}"`,
                config: {
                    systemInstruction: systemInstruction,
                }
            });

            if (response && response.text) {
                setMessages(prev => [...prev, { id: currentBotId, sender: 'bot', text: response.text }]);
            } else {
                throw new Error("Respons AI kosong.");
            }
            
        } catch (error) {
            console.error("Error AI di Browser Klien:", error);
            setMessages(prev => [
                ...prev, 
                { id: Date.now() + 2, sender: 'bot', text: "Gagal memproses data AI langsung dari penjelajah web. Silakan coba lagi." }
            ]);
        } finally {
            setIsLoading(false);
        }
    };

    const isMobileView = profile.role === 'pcl' || profile.role === 'pml';

    return (
        <div className="fixed z-[9999] font-sans">
            {!isOpen && (
                <button
                    onClick={() => setIsOpen(true)}
                    className={`bg-orange-500 text-white rounded-full shadow-lg border border-orange-500/50 flex items-center justify-center transition-all hover:scale-105 active:scale-95 fixed ${
                        isMobileView 
                            ? "bottom-[80px] right-4 w-12 h-12 text-xl" 
                            : "bottom-6 right-6 w-16 h-16 text-xl"
                    }`}
                >
                    🔍
                </button>
            )}

            {isOpen && (
                <div className={`bg-white shadow-2xl border border-slate-200 flex flex-col transition-all duration-300 fixed left-0 right-0 z-[9999] ${
                    isMobileView 
                        ? "inset-x-0 bottom-[80px] top-0 w-full" 
                        : "bottom-24 right-6 w-96 h-[550px] rounded-2xl ml-auto"
                }`}>

                    <div className="bg-[#0F172A] text-white p-4 flex justify-between items-center rounded-t-xl border-b border-slate-800">
                        <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
                            <h3 className="font-bold text-sm tracking-wide">Asisten AI Kode Pekerjaan</h3>
                        </div>
                        <button onClick={() => setIsOpen(false)} className="text-xl font-bold hover:text-slate-300">✕</button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
                        {messages.map(msg => (
                            <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] rounded-2xl p-3 text-xs leading-relaxed markdown-container ${
                                    msg.sender === 'user'
                                        ? 'bg-orange-500 text-white rounded-tr-none shadow-md'
                                        : 'bg-white text-slate-800 shadow-sm border border-slate-200 rounded-tl-none'
                                }`}>
                                    <ReactMarkdown>{msg.text}</ReactMarkdown>
                                </div>
                            </div>
                        ))}

                        {isLoading && (
                            <div className="flex justify-start">
                                <div className="bg-white text-slate-400 border border-slate-200 rounded-2xl rounded-tl-none p-3 text-xs flex items-center gap-1.5 shadow-sm">
                                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></span>
                                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                                </div>
                            </div>
                        )}
                        <div ref={chatEndRef} />
                    </div>

                    <form onSubmit={handleSendMessage} className="p-3 bg-white border-t border-slate-200 flex gap-2 items-center">
                        <input
                            type="text"
                            value={inputMessage}
                            onChange={(e) => setInputMessage(e.target.value)}
                            placeholder="Ketik deskripsi pekerjaan di sini..."
                            disabled={isLoading}
                            className="flex-1 p-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-orange-500 text-slate-800"
                        />
                        <button
                            type="submit"
                            disabled={isLoading || !inputMessage.trim()}
                            className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all disabled:opacity-40"
                        >
                            Cari
                        </button>
                    </form>

                </div>
            )}
        </div>
    );
}