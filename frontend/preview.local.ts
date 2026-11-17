import { defineConfig, mergeConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import base from './vite.config';

export default defineConfig(mergeConfig(base, {
  server: { host: '127.0.0.1', port: 5178, strictPort: true },
  plugins: [{
    name: 'local-mock-preview',
    transformIndexHtml() {
      return [{ tag: 'script', injectTo: 'head-prepend', children: transformSync(
        readFileSync(new URL('./preview-bootstrap.local.ts', import.meta.url), 'utf8'),
        { loader: 'ts', format: 'iife' },
      ).code }];
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (!request.url?.startsWith('/api/')) return next();
        response.statusCode = 503;
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({ detail: 'Local preview: backend access blocked' }));
      });
    },
  }],
}));
