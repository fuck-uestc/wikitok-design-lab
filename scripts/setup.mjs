import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const target = new URL('.env', root);
const upgrade = process.argv.includes('--upgrade');
const secret = () => randomBytes(32).toString('base64url');
if (!existsSync(target)) {
  const template = readFileSync(new URL('.env.example', root), 'utf8');
  const contents = template
    .replace(/^ADMIN_PASSWORD=$/m, `ADMIN_PASSWORD=${secret()}`)
    .replace(/^MCP_TOKEN=$/m, `MCP_TOKEN=${secret()}`);
  writeFileSync(target, contents, { mode: 0o600, flag: 'wx' });
  console.log(`已创建 ${fileURLToPath(target)}。管理员密码与独立 MCP_TOKEN 已写入，未打印凭据。`);
} else if (upgrade) {
  const original = readFileSync(target, 'utf8');
  // Never rotate or replace existing values, including deliberately blank tokens.
  const additions = Object.entries({
    MCP_TOKEN: secret(), MCP_READ_TOKEN: '', MCP_ALLOW_ADMIN_PASSWORD: 'false',
    DEFAULT_FEED: 'main', FEEDS_JSON: ''
  }).filter(([key]) => !new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=`, 'm').test(original));
  if (additions.length) {
    writeFileSync(target, original.replace(/\s*$/, '') + '\n\n# Added by setup --upgrade\n' + additions.map(([k,v]) => `${k}=${v}`).join('\n') + '\n', { mode: 0o600 });
    console.log(`已补齐 ${additions.map(([k]) => k).join(', ')}。已有配置和密码均未替换。`);
  } else console.log('配置项已齐全；没有修改 .env。');
} else console.log('.env 已存在，保留现有配置。升级请执行 npm run setup -- --upgrade。');
console.log('下一步：npm run dev。管理后台 /admin；MCP /mcp。不要将 .env 提交或分享。');
