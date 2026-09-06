import { backup, DatabaseSync } from 'node:sqlite';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { loadConfig } from './config.js';
import { Store } from './store.js';
import { bootstrapAdmin, hashPassword } from './auth.js';
import { artifactSchema } from '../../shared/schema.js';

const config = loadConfig();
const store = new Store(config);
try {
  const command = process.argv[2];
  if (command === 'migrate') {
    console.log('数据库迁移完成。管理员将在首次启动服务时创建。');
  } else if (command === 'reset-admin') {
    if (config.adminPassword.length < 12) throw new Error('请先在 .env 中设置至少 12 位 ADMIN_PASSWORD；密码不会写入命令行或输出。');
    const existing = store.db.prepare('SELECT id FROM admins WHERE username=?').get(config.adminUsername);
    store.transaction(() => {
      if (existing) {
        store.db.prepare('UPDATE admins SET password_hash=? WHERE id=?').run(hashPassword(config.adminPassword), String(existing.id));
        store.db.prepare('DELETE FROM sessions WHERE admin_id=?').run(String(existing.id));
      } else {
        store.db.prepare('INSERT INTO admins VALUES(?,?,?,?)').run(randomUUID(), config.adminUsername, hashPassword(config.adminPassword), new Date().toISOString());
      }
      store.audit(config.adminUsername, 'reset-admin-cli');
    });
    console.log(`管理员 ${config.adminUsername} 已创建或重置；该账号旧会话已失效。`);
  } else if (command === 'backup') {
    const stamp = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
    const destination = join(config.backupDir, stamp);
    mkdirSync(destination, { recursive: true });
    const database = join(destination, 'wiki.sqlite');
    await backup(store.db, database);
    cpSync(config.uploadDir, join(destination, 'uploads'), { recursive: true, errorOnExist: true });
    const check = new DatabaseSync(database, { readOnly: true });
    try {
      const integrity = check.prepare('PRAGMA integrity_check').get();
      if (!integrity || Object.values(integrity)[0] !== 'ok') throw new Error('备份数据库完整性检查失败');
      const manifest = { createdAt: new Date().toISOString(), appVersion: '1.0.0', schemaVersion: Number(check.prepare('SELECT MAX(version) version FROM schema_migrations').get()?.version), artifacts: Number(check.prepare('SELECT COUNT(*) n FROM artifacts').get()?.n), media: Number(check.prepare('SELECT COUNT(*) n FROM media').get()?.n), uploadedFiles: readdirSync(join(destination, 'uploads')).length, integrity: 'ok' };
      writeFileSync(join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2), { encoding: 'utf8', flag: 'wx' });
    } finally { check.close(); }
    console.log(`备份及完整性检查完成：${destination}`);
  } else if (command === 'demo') {
    bootstrapAdmin(store);
    const template = [join(config.root, 'frontend/public/templates/artifacts.json'), join(config.root, 'dist/client/templates/artifacts.json')].find(existsSync);
    if (!template) throw new Error('找不到示例模板，请保留 frontend/public/templates 或先完成构建。');
    const source = JSON.parse(readFileSync(template, 'utf8'));
    let created = 0;
    store.transaction(() => {
      for (const raw of source.artifacts) {
        const input = artifactSchema.parse(raw);
        if (store.identity(input)) continue;
        store.save(input, config.adminUsername, undefined, undefined, 'demo-import'); created++;
      }
    });
    console.log(`已导入 ${created} 条明确标注的示例草稿。请在后台预览并按需发布；现有条目未被替换。`);
  } else {
    throw new Error('用法：npm run db:migrate | db:backup | admin:reset | demo:import');
  }
} finally { store.close(); }
