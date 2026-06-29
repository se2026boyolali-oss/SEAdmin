import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import ReactMarkdown from 'react-markdown';

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

    // Fungsi Utama: Memanggil Serverless Backend Vercel dengan Sistem Multi-API Key
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
            // 🌟 Memanggil endpoint backend Vercel (bukan menembak API Google langsung dari browser)
            const response = await fetch('/api/cari-kode', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ deskripsiLapangan: userText }),
            });

            const data = await response.json();

            if (response.ok) {
                setMessages(prev => [...prev, { id: currentBotId, sender: 'bot', text: data.text }]);
            } else {
                throw new Error(data.error || "Gagal memproses AI");
            }
            
        } catch (error) {
            console.error("Error Endpoint Backend:", error);
            setMessages(prev => [
                ...prev, 
                { id: Date.now() + 2, sender: 'bot', text: "Gagal memproses data. Silakan coba lagi." }
            ]);
        } finally {
            setIsLoading(false);
        }
    };

    const isMobileView = profile.role === 'pcl' || profile.role === 'pml';

    return (
        <div className="fixed z-[9999] font-sans">
            
            {/* 🔘 TOMBOL BUBBLE FLOATING (Warna Oranye & Ikon Kaca Pembesar) */}
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

            {/* 📦 JENDELA INTERAKSI CHAT AI */}
            {isOpen && (
                <div className={`bg-white shadow-2xl border border-slate-200 flex flex-col transition-all duration-300 fixed left-0 right-0 z-[9999] ${
                    isMobileView 
                        ? "inset-x-0 bottom-[80px] top-0 w-full" 
                        : "bottom-24 right-6 w-96 h-[550px] rounded-2xl ml-auto"
                }`}>

                    {/* Header Chat (Warna Navy Gelap Menyesuaikan Dasbor) */}
                    <div className="bg-[#0F172A] text-white p-4 flex justify-between items-center rounded-t-xl isMobileView:rounded-none border-b border-slate-800">
                        <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
                            <h3 className="font-bold text-sm tracking-wide">Asisten AI Kode Pekerjaan</h3>
                        </div>
                        <button onClick={() => setIsOpen(false)} className="text-xl font-bold hover:text-slate-300">✕</button>
                    </div>

                    {/* Area Bubble Chat */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
                        {messages.map(msg => (
                            <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                                {/* Bubble Chat Petugas berubah menjadi Oranye agar serasi */}
                                <div className={`max-w-[85%] rounded-2xl p-3 text-xs leading-relaxed markdown-container ${
                                    msg.sender === 'user'
                                        ? 'bg-orange-500 text-white rounded-tr-none shadow-md'
                                        : 'bg-white text-slate-800 shadow-sm border border-slate-200 rounded-tl-none'
                                }`}>
                                    <ReactMarkdown>{msg.text}</ReactMarkdown>
                                </div>
                            </div>
                        ))}

                        {/* Indikator Loading */}
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

                    {/* Kolom Input */}
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