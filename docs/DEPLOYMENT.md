# 部署与维护

使用 Node.js 24.x。本交付环境未完成 Vite 生产构建或 Docker/现网联调，请在有依赖下载能力的目标机器先运行 `npm ci && npm run check`。不能用其他操作系统的 node_modules 替代本机安装。无需删除 package-lock.json；它是本版依赖锁文件。

## 单进程

构建 `npm run build` 后，`npm start` 启动 Express，同时提供 dist/client、/api、/mcp 和前台路由回退。设置 `NODE_ENV=production`、真实 HTTPS `PUBLIC_SITE_URL`、`COOKIE_SECURE=true`，按实际代理层数设置 TRUST_PROXY；静态站点与 API 分离部署时，另行核对运行时配置、跨域和 cookie 设置。

不要把私钥、.env、data、uploads、backups 放进公开静态目录。MCP Bearer 仅发往 HTTPS 服务；代理应保留 Authorization 请求头。`deploy/nginx.conf.example` 的根路径代理会覆盖 /mcp；实际域名、证书与端口须替换并验证。

## Docker Compose

仓库 Compose 的主机映射是 `127.0.0.1:5173` → 容器 3001，保留上传工程的本机 Tunnel 接入方式，不是把 API 直接暴露公网。生产前台地址必须是你的真实域名，而不是端口映射本身。

```sh
docker compose build
docker compose up -d
docker compose logs --tail=100 wiki
```

已有部署保留原 Compose 项目名称与 wiki-data/wiki-uploads/wiki-backups 命名卷。不执行 down -v，不在新项目名下误建空卷。确有换项目名需求时，先确认并显式挂载原有卷。

## 备份

暂停编辑、上传和导入，再执行：

```sh
npm run db:backup
# 仅安装生产依赖时：
node dist/server/backend/src/cli.js backup
# Docker：
docker compose exec wiki node dist/server/backend/src/cli.js backup
```

备份采用 SQLite 在线备份 API，包含数据库快照、上传目录复制及 manifest.json 的完整性检查结果与计数。不是数据库和文件系统的跨系统原子事务；暂停写入可避免复制期间新增附件。将备份复制到独立位置并定期验证恢复，不只放在同一硬盘。

恢复必须停服务：保留故障数据副本，将对应备份 wiki.sqlite 和 uploads 恢复到配置路径，清理旧数据库的失配 WAL/SHM 旁文件（先完整备份它们），核对文件权限，再启动与备份兼容的程序。旧版回滚使用升级前备份，不对新库执行破坏性降级。完整步骤和新字段见 ../UPGRADE_V2.md。

内容 JSON 导出不包含二进制附件、账号和历史，不能替代整站备份。单纯取消条目的信息流投放不会撤销公开文件访问；文件是否公开由已发布条目的引用决定。

## 发布验收

确认 /api/health、默认首页、/f/main、/f/slices、/a/已有slug、浏览器硬刷新、Cookie登录、媒体上传、来源图片、MCP initialize/tools/list。两个不同版本编辑者同时保存时，旧版本必须收到409。验证只读 MCP 不可写入、公开配置不含 token，并核对 CORS、上传体积限制与真实反向代理链。
