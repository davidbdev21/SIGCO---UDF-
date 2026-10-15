import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  const isHmrDisabled = process.env.DISABLE_HMR === 'true';
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: isHmrDisabled
        ? false
        : {
            clientPort: process.env.APP_URL?.startsWith('https://') || process.env.K_SERVICE ? 443 : undefined,
          },
      watch: isHmrDisabled ? null : {},
    },
  };
});
