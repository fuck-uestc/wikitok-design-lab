import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../backend/src/config.js';

test('production configuration fails fast on inconsistent HTTPS, cookies, origins and API URLs', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'production', PUBLIC_SITE_URL: 'http://wiki.example.edu', COOKIE_SECURE: 'true' }), /HTTPS/);
  assert.throws(() => loadConfig({ NODE_ENV: 'production', PUBLIC_SITE_URL: 'https://wiki.example.edu', COOKIE_SECURE: 'false' }), /COOKIE_SECURE/);
  assert.throws(() => loadConfig({ COOKIE_SAME_SITE: 'none', COOKIE_SECURE: 'false' }), /Secure|SECURE/);
  assert.throws(() => loadConfig({ CORS_ORIGINS: '*' }));
  assert.throws(() => loadConfig({ PUBLIC_API_BASE_URL: 'https://admin:secret@example.edu/api' }));
  assert.throws(() => loadConfig({ TRUST_PROXY: '-1' }), /TRUST_PROXY/);
  assert.throws(() => loadConfig({ DEFAULT_THEME: 'invented' }), /DEFAULT_THEME/);
  const config = loadConfig({ NODE_ENV: 'production', PUBLIC_SITE_URL: 'https://wiki.example.edu', PUBLIC_API_BASE_URL: 'https://api.example.edu/api', CORS_ORIGINS: 'https://wiki.example.edu', COOKIE_SECURE: 'true', TRUST_PROXY: '1' });
  assert.equal(config.cookieSecure, true); assert.equal(config.trustProxy, 1); assert.deepEqual(config.origins, ['https://wiki.example.edu']);
});
