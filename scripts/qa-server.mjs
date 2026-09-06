import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
const port = Number(process.env.QA_PORT || 4178);
const directory = resolve(`output/playwright/qa-state-${Date.now()}`);
mkdirSync(directory, { recursive: true });
Object.assign(process.env, {
  NODE_ENV: 'test', BACKEND_HOST: '127.0.0.1', BACKEND_PORT: String(port),
  PUBLIC_SITE_URL: `http://127.0.0.1:${port}`, PUBLIC_API_BASE_URL: '/api',
  CORS_ORIGINS: `http://127.0.0.1:${port},http://localhost:${port}`,
  SITE_NAME: '校园 BBS Wiki', SITE_SHORT_NAME: '校园志', DEFAULT_THEME: 'margin',
  COOKIE_SECURE: 'false', COOKIE_SAME_SITE: 'lax', TRUST_PROXY: '0',
  DATABASE_PATH: join(directory, 'wiki.sqlite'), UPLOAD_DIR: join(directory, 'uploads'), BACKUP_DIR: join(directory, 'backups'),
  ADMIN_USERNAME: 'qa-admin', ADMIN_PASSWORD: 'Local-QA-only-passphrase-2026'
});
const { createApp } = await import('../dist/server/backend/src/app.js');
const { loadConfig } = await import('../dist/server/backend/src/config.js');
const { uploadMedia } = await import('../dist/server/backend/src/media.js');
const { artifactSchema } = await import('../dist/server/shared/schema.js');
const application = createApp(loadConfig());
const images = ['coffee.webp', 'cat.webp', 'mobius.png', 'hubble.webp'].map(name => {
  const buffer = readFileSync(join('assets', name));
  return uploadMedia(application.store, [{ originalname: name, buffer, size: buffer.length }], 'qa-admin')[0];
});
const titles = ['在校园里，留下一点共同的记忆。', '给刚刚来到这里的你，一份慢慢更新的生活指南。', '那些只有我们听得懂的校园词语。', '一个没有封面的故事，也值得被认真记下。', '这是一个用于验证两套主题在极长中文标题下仍然能够正常排版、保留阅读按钮并且不会挤占其他操作区域的校园资料条目，完整标题始终可以在阅读抽屉中查看。', '当图片暂时缺席，阅读仍然继续。'];
const fixtures = [];
for (let index = 35; index >= 0; index--) {
  const input = artifactSchema.parse({
    title: titles[index] || `校园记忆的第 ${index + 1} 页`, slug: `qa-artifact-${index + 1}`, externalId: `qa:${index + 1}`,
    summary: '从一段讨论、一张照片，到一份被反复翻阅的经验。把散落在 BBS 里的故事放在一起，让后来的人也能找到来时的路。',
    content: '> 此条目为隔离数据库中的浏览器验收数据，不是实际校园史料。\n\n## 记忆的起点\n\n从一段讨论、一张照片，到一份被反复翻阅的经验。每一份资料都有自己的来处。\n\n## 留下可追溯的线索\n\n- 原帖作者与时间\n- 可回访的 BBS 链接\n- 图片署名和资料附件\n\n| 内容 | 说明 |\n| --- | --- |\n| 原帖 | 保留可追溯来源 |\n| 别名 | 帮助找到曾用名 |\n\n<script>window.__wikiXss = true</script>\n\n[不安全链接](javascript:alert(1))',
    kind: index % 3 === 1 ? 'guide' : index % 3 === 2 ? 'glossary' : 'article', category: ['校园生活', '新生指南', '社区文化'][index % 3],
    tags: ['验收数据', index % 2 ? '日常' : '记忆'], aliases: index === 0 ? ['旧昵称125', '共同记忆'] : [], author: '示例编辑',
    sourceUrl: 'https://bbs.example.edu/forum.php?mod=viewthread&tid=12345', sourceTitle: '验收用示例链接', sourceThreadId: String(12345 + index),
    coverMediaId: index === 3 || index === 4 || index === 5 ? '' : images[index % images.length].id,
    coverUrl: index === 5 ? `http://127.0.0.1:${port}/api/media/missing-image` : '',
    coverAlt: '布局验收图片', coverCredit: index % 4 === 0 ? 'Rachel Michetti / CC0 · 布局验收图' : index % 4 === 1 ? 'Stefan van der Walt / CC0 · 布局验收图' : index % 4 === 2 ? '参数图解 / 原型原创 · 布局验收图' : 'NASA / ESA / HUDF09 Team · 布局验收图',
    status: 'published'
  });
  const artifact = application.store.save(input, 'qa-admin');
  fixtures.unshift({ id: artifact.id, slug: artifact.slug, title: artifact.title });
}
application.store.save(artifactSchema.parse({ title: '仅管理员可见的草稿', content: '这段内容不应出现在公开搜索结果中。', status: 'draft' }), 'qa-admin');
writeFileSync(join(directory, 'fixtures.json'), JSON.stringify(fixtures, null, 2));
writeFileSync('output/playwright/qa-server.json', JSON.stringify({ port, directory, fixtures }, null, 2));
const server = application.app.listen(port, '127.0.0.1', () => console.log(`Isolated QA server: http://127.0.0.1:${port}; ${fixtures.length} published fixtures; data: ${directory}`));
function close() { server.closeAllConnections(); server.close(() => { application.close(); process.exit(0); }); }
process.on('SIGINT', close); process.on('SIGTERM', close);
