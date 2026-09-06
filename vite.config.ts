import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { defaultFeeds, feedSettingsSchema } from './shared/feeds';
import { resolve } from 'node:path';

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  // Explicit allowlist: credentials and database paths never enter the frontend bundle.
  const feeds = feedSettingsSchema.parse({ feeds: env.FEEDS_JSON ? JSON.parse(env.FEEDS_JSON) : defaultFeeds, defaultFeed: env.DEFAULT_FEED || 'main', version: 1 });
  const site = {
    feeds: feeds.feeds.filter(f => f.enabled), defaultFeed: feeds.defaultFeed,
    siteName: env.SITE_NAME || '校园 BBS Wiki', shortName: env.SITE_SHORT_NAME || '校园志',
    description: env.SITE_DESCRIPTION || '把校园里的故事、经验和共同记忆，慢慢收藏。',
    tagline: env.SITE_TAGLINE || '校园有回声，记忆有来处。', defaultTheme: env.DEFAULT_THEME || 'margin',
    siteUrl: env.PUBLIC_SITE_URL || 'http://localhost:3001', apiBaseUrl: env.PUBLIC_API_BASE_URL || '/api',
    bbsBaseUrl: env.BBS_BASE_URL || '', contactEmail: env.CONTACT_EMAIL || ''
  };
  const source = `window.__WIKI_CONFIG__=${JSON.stringify(site).replace(/</g, '\\u003c')};`;
  return {
    root: resolve('frontend'), envDir: process.cwd(),
    plugins: [react(), {
      name: 'public-runtime-config',
      configureServer(server) { server.middlewares.use('/runtime-config.js', (_req, res) => { res.setHeader('Content-Type', 'application/javascript'); res.setHeader('Cache-Control', 'no-store'); res.end(source); }); },
      generateBundle() { this.emitFile({ type: 'asset', fileName: 'runtime-config.js', source }); }
    }],
    build: { outDir: resolve('dist/client'), emptyOutDir: true },
    server: { host: '127.0.0.1', port: Number(env.FRONTEND_PORT || 5173), strictPort: true, proxy: { '/mcp': { target: env.DEV_API_TARGET || 'http://127.0.0.1:3001', changeOrigin: true }, '/api': { target: env.DEV_API_TARGET || 'http://127.0.0.1:3001', changeOrigin: true } } }
  };
});
