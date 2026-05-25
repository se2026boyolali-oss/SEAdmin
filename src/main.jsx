import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css' // Pastikan ini yang paling bawah di antara import CSS
import { registerSW } from 'virtual:pwa-register';

// Otomatis melakukan update service worker jika Anda melakukan update kode di Vercel
registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)