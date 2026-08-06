import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { localImageUploadPlugin } from './build/localImageUploadPlugin'

export default defineConfig({
  plugins: [vue(), localImageUploadPlugin()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 9090,
    host: '0.0.0.0', // allow LAN access from mobile
    allowedHosts: ['.loca.lt', 'localhost'], // allow tunnel domains
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        timeout: 120000,
      },
    },
  },
})
