import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3443,
    https: {
      key: fs.readFileSync(path.resolve(__dirname, '../certs/selfsigned.key')),
      cert: fs.readFileSync(path.resolve(__dirname, '../certs/selfsigned.crt')),
    },
    proxy: {
      '/api': 'http://localhost:8080'
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Split Three.js into its own chunk
          three: ['three'],
          vrm: ['@pixiv/three-vrm'],
          react: ['react', 'react-dom']
        }
      }
    },
    // Suppress chunk size warning since Three.js is large
    chunkSizeWarningLimit: 1000
  }
})
