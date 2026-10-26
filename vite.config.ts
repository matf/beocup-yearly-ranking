import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  // relative base so the build works from any folder or file:// location
  base: './',
  test: {
    include: ['src/**/*.test.ts'],
  },
})
