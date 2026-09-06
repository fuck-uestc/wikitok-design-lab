import { createApp } from './app.js';
import { loadConfig } from './config.js';
const config = loadConfig();
const application = createApp(config);
const server = application.app.listen(config.port, config.host, () => {
  console.log(`${config.site.siteName} API: http://${config.host}:${config.port}`);
  console.log('管理员入口：/admin；数据库迁移已完成。');
});
server.requestTimeout = 60_000;
server.headersTimeout = 15_000;
server.on('error', error => { console.error(error.message); application.close(); process.exitCode = 1; });
let closing = false;
function shutdown() {
  if (closing) return;
  closing = true;
  server.close(() => { application.close(); process.exit(0); });
  server.closeIdleConnections();
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
