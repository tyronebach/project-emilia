import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
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
