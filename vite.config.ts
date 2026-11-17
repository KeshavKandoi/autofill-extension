import { defineConfig } from 'vite'
import tailwind from '@tailwindcss/vite'
export default defineConfig({plugins:[tailwind()], build:{ rollupOptions:{input:{popup:'popup.html',options:'options.html',worker:'src/background/worker.ts'},output:{entryFileNames:'[name].js'}}}})
