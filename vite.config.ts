import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { devApi } from './scripts/dev-api-plugin.js'

// 5174번은 방꾸미 1.0이 쓰고 있어서 다른 번호를 쓴다.
export default defineConfig({
  plugins: [react(), tailwindcss(), devApi()],
  server: { port: 5180 },
  preview: { port: 4180 },
  build: {
    // three.js는 지연 로딩되는 덩어리 하나(약 540kB)라서 경고 기준만 올린다.
    chunkSizeWarningLimit: 700,
    // 첫 화면(/)은 public/index.html(방봄)이고, 방꾸미 편집 화면은 room.html이다.
    rollupOptions: { input: 'room.html' },
  },
})
