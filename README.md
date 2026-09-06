# 校园 BBS Wiki

把校园 BBS 中的故事、经验、人物、事件与社区词语整理为可检索、可追溯的 Wiki。正式应用已经接入自己的后端和 SQLite 数据库；读者可以在 **页外 MARGIN** 与 **游离 DRIFT** 两种布局间切换。

## 在 Windows 上启动

需要 **Node.js 24.x**。无需先安装数据库服务。PowerShell 中使用 `npm.cmd`，避免系统的 `.ps1` 执行策略影响 npm。

```powershell
Set-Location D:\workspace\wikitok-design-lab
npm.cmd ci
npm.cmd run setup
npm.cmd run dev
```

- 前台：<http://localhost:5173>
- 后台：<http://localhost:5173/admin>
- API：<http://127.0.0.1:3001/api/health>
- 管理员账号和初始随机密码：项目根目录 `.env` 的 `ADMIN_USERNAME` / `ADMIN_PASSWORD`。

`setup` 只在 `.env` 不存在时创建配置并生成随机密码。服务启动时自动创建数据库、迁移表结构，并在空库中创建管理员。**初始内容库为空**；请到后台新增或导入资料。

Linux / macOS 使用相同命令，将 `npm.cmd` 换成 `npm`。

## 配置你的站点

先在 `.env` 中修改这些字段：

```dotenv
SITE_NAME="你的校园 BBS Wiki"
SITE_SHORT_NAME="校园志"
SITE_DESCRIPTION="把校园里的故事、经验和共同记忆，慢慢收藏。"
SITE_TAGLINE="校园有回声，记忆有来处。"
DEFAULT_THEME=margin
PUBLIC_SITE_URL=http://localhost:5173
PUBLIC_API_BASE_URL=/api
BBS_BASE_URL=https://bbs.example.edu
BBS_THREAD_URL_TEMPLATE="https://bbs.example.edu/forum.php?mod=viewthread&tid={id}"
```

`margin` 是图文分栏，`drift` 是沉浸阅读；访客选择优先于站点默认主题。`BBS_THREAD_URL_TEMPLATE` 可留空；只有批量导入的记录缺少 `sourceUrl` 时，才会由帖子 ID 生成原帖地址。

配置字段、后端地址、跨域、管理员密码及生产环境的完整说明见 [配置文档](docs/CONFIGURATION.md)。不要把 `.env` 提交到版本库。

## 已提供的功能

- 两套独立布局、响应式排版、主题记忆、原生滑动和键盘浏览；切换主题保留当前条目。
- 数据库检索：标题、正文、原作者、人物别名、标签、BBS 帖子 ID；分类浏览、随机条目和分页。
- Markdown 阅读抽屉、来源与图片署名、附件、条目分享链接、当前浏览器收藏。
- 管理员登录、服务端会话、密码修改、登录限流、CSRF 校验。
- 单条创建与编辑、草稿、发布、归档、历史版本及恢复、并发编辑冲突检查。
- JSON / CSV / 多个 Markdown 文件批量导入；先预览再提交，重复处理策略、逐条错误提示、整批事务与过期预览保护。
- 图片、PDF、TXT 媒体库；真实文件格式校验、内容去重、草稿附件访问控制。
- JSON 内容导出、SQLite 自动迁移、在线一致性备份与完整性校验、Docker / Nginx 部署示例。

这里的 **artifact 就是一条 Wiki 内容**，可以是校园故事、指南、人物、事件或社区词语。后台只有管理员账号，访客无需注册。访客收藏保存在当前浏览器中，不跨设备同步。

## 录入内容

进入后台 →「条目管理」→「新建条目」，填写标题、正文，按需补充分类、标签、别名、原帖出处、图片与附件，再保存草稿或发布。

批量内容进入「批量导入」，上传文件、检查每条预览，再确认导入。下载模板：

- [JSON](frontend/public/templates/artifacts.json)
- [CSV](frontend/public/templates/artifacts.csv)
- [Markdown](frontend/public/templates/artifact.md)

详细字段、BBS 数据转换、重复策略与媒体导入见 [内容导入指南](docs/IMPORTING.md)。

需要试用示例时，可手动执行 `npm.cmd run demo:import`。它只添加明确标注的示例草稿，重复执行会跳过，不会替换已有内容。

## 构建、检查与单进程运行

```powershell
npm.cmd run check
npm.cmd run build
npm.cmd start
```

`check` 一次执行类型检查、接口测试和生产构建，并汇总结果。测试使用系统临时目录中的隔离数据库，不读取或修改正式内容。

`npm start` 从 `dist/` 启动单个 Node 服务，同时托管前台、后台与 API；默认入口为 <http://localhost:3001>，后台路径仍为 `/admin`。本机运行可保持 `NODE_ENV=development`，并将 `PUBLIC_SITE_URL` 改为该入口地址。真正公开部署应启用生产模式和 HTTPS，具体步骤见 [部署与维护](docs/DEPLOYMENT.md)。

```powershell
npm.cmd run db:backup
```

备份输出到 `.env` 指定的 `BACKUP_DIR`，包含独立的数据库快照、上传文件和校验清单。恢复步骤也在部署文档中。

## 项目结构

```text
frontend/src/             React + TypeScript 正式前台、主题和管理后台
frontend/public/templates/ 可下载的 JSON / CSV / Markdown 模板
backend/src/              Express API、SQLite、认证、导入、媒体与运维 CLI
shared/                   前后端共用类型与输入校验
tests/                    真实 HTTP 与数据库集成测试
scripts/                  初始化配置和集中检查
docs/                     配置、导入、API、部署、验证文档
deploy/                   Nginx 配置示例
data/                     运行时数据库（忽略提交）
uploads/                  上传文件（忽略提交）
backups/                  数据备份（忽略提交）
.env.example              配置模板
Dockerfile / compose.yaml 容器部署
```

原来的 `a-margin.html`、`b-drift.html`、`demo-*.html`、`src/`、`previews/` 保留为设计参考，仍是固定样例原型。**正式应用入口为 `frontend/`，不能用 `python -m http.server` 替代后端启动。** 原素材署名见 [ASSET_CREDITS.md](ASSET_CREDITS.md)。

- [完整配置](docs/CONFIGURATION.md)
- [数据导入](docs/IMPORTING.md)
- [API 契约](docs/API.md)
- [部署、备份与恢复](docs/DEPLOYMENT.md)
- [验收记录](docs/VERIFICATION.md)
