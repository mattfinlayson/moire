import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  base: './',
  build: {
    outDir: 'docs',
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        install: resolve(__dirname, 'install.html')
      }
    }
  }
})
