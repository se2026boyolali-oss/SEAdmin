import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt', 'apple-touch-icon.png'],
      // Strategi caching file static
      workbox: {
        // Daftarkan ekstensi file yang wajib bisa dibuka offline
        globPatterns: ['**/*.{js,css,html,png,svg,woff2,json,gjson}'],
        // Menjaga agar fetch spasial geojson berukuran besar tetap diizinkan masuk cache HP
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, 
      },
      manifest: {
        name: 'Sensus Ekonomi 2026 Boyolali',
        short_name: 'SE2026',
        description: 'Aplikasi Absensi Geotagging Offline PCL & PML',
        theme_color: '#0f172a',
        background_color: '#f8fafc',
        display: 'standalone', // Membuat web app tampil fullscreen seperti aplikasi installan
        orientation: 'portrait',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ]
});