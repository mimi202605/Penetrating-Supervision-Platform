import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages 项目站点部署在 https://<user>.github.io/Penetrating-Supervision-Platform/
  // 使用相对路径 base，保障资源在任何子路径下均可正确加载
  base: './',
  build: {
    sourcemap: 'hidden',
  },
  server: {
    watch: {
      // 排除 pnpm-store / node_modules 中不需要监听的目录，避免触发 inotify 上限
      ignored: [
        '**/.pnpm-store/**',
        '**/node_modules/.pnpm/**',
      ],
    },
  },
  plugins: [
    react({
      babel: {
        plugins: [
          'react-dev-locator',
        ],
      },
    }),
    tsconfigPaths()
  ],
})
