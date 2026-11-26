import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { devApi } from './scripts/dev-api-plugin.js'

// 파이썬 백엔드로 가는 길. 공개 사이트에서는 vercel.json 의 rewrite 가 같은 일을 한다.
// 내 PC에서는 BACKEND_URL(기본: 내 PC의 8000번)로 보내고, 백엔드가 꺼져 있으면 화면이 브라우저 계산으로 돌아간다.
const backendProxy = {
  '/backend': {
    target: process.env.BACKEND_URL ?? 'http://127.0.0.1:8000',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/backend/, '/api'),
    timeout: 8000,
    proxyTimeout: 8000,
  },
}

// 5174번은 방꾸미 1.0이 쓰고 있어서 다른 번호를 쓴다.
export default defineConfig({
  plugins: [react(), tailwindcss(), devApi()],
  server: { port: 5180, proxy: backendProxy },
  preview: { port: 4180, proxy: backendProxy },
  build: {
    // three.js는 지연 로딩되는 덩어리 하나(약 540kB)라서 경고 기준만 올린다.
    chunkSizeWarningLimit: 700,
    // 첫 화면(/)은 public/index.html(방봄)이고, 방꾸미 편집 화면은 room.html이다.
    rollupOptions: { input: 'room.html' },
  },
})
