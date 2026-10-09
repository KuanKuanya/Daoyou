import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { workbenchMiddleware } from '../../../scripts/workbench/server.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
export default defineConfig({
  root: path.join(root, 'apps/web/workbench'),
  publicDir: path.join(root, 'apps/web/public'),
  resolve: { alias: { '@app': path.join(root, 'apps/web/src') } },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'local-content-workbench',
      configureServer(server) {
        server.middlewares.use(workbenchMiddleware(root));
      },
    },
  ],
  server: {
    host: '127.0.0.1',
    port: 5180,
    strictPort: true,
    fs: { allow: [root] },
  },
});
