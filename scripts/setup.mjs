import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const target = new URL('.env', root);
if (existsSync(target)) {
  console.log('.env 已存在，保留现有配置。');
} else {
  const template = readFileSync(new URL('.env.example', root), 'utf8');
  writeFileSync(target, template.replace('ADMIN_PASSWORD=\n', `ADMIN_PASSWORD=${randomBytes(24).toString('base64url')}\n`), { mode: 0o600, flag: 'wx' });
  console.log(`已创建 ${fileURLToPath(target)}。管理员账号及随机密码保存在 ADMIN_USERNAME / ADMIN_PASSWORD。`);
}
console.log('下一步：npm run dev。开发前台 http://localhost:5173，管理后台 /admin。');
