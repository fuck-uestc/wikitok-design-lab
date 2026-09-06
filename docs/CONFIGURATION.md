# 配置说明

所有服务配置从项目根目录 `.env` 或进程环境变量读取。环境变量优先于 `.env`。文件使用 UTF-8；含空格、`#`、中文长句的值建议加双引号。

## 首次配置

```powershell
npm.cmd ci
npm.cmd run setup
```

`setup` 复制 `.env.example` 并生成 24 字节随机管理员密码。已经存在 `.env` 时，不会覆盖它。可以直接用编辑器打开 `.env` 查看并调整配置；不要将密码填入前端代码、命令行参数或公开文档。

启动服务会自动创建 `DATABASE_PATH` 的父目录、数据库及 `UPLOAD_DIR`，执行尚未应用的迁移。空库首次启动要求有效 `ADMIN_PASSWORD`；不会内置通用默认密码。后续启动沿用数据库中的管理员及密码。

## 品牌与浏览器配置

| 字段 | 默认值 / 示例 | 含义 |
| --- | --- | --- |
| `SITE_NAME` | `校园 BBS Wiki` | 网站完整名称，页面标题、后台、关于站点使用 |
| `SITE_SHORT_NAME` | `校园志` | 导航短名称，建议 2–6 个汉字 |
| `SITE_DESCRIPTION` | 校园内容说明 | 关于站点、空内容页与页面 description |
| `SITE_TAGLINE` | `校园有回声，记忆有来处。` | 页脚短句 |
| `DEFAULT_THEME` | `margin` | `margin` 或 `drift`；只作用于没有自行选择主题的访客 |
| `PUBLIC_SITE_URL` | `http://localhost:5173` | 读者访问前台的完整地址，用于分享永久链接；生产必须 HTTPS，不填写 `/admin` 或 `/api` |
| `PUBLIC_API_BASE_URL` | `/api` | 浏览器调用后端的地址；只支持 `/api` 或完整 `https://api.example.edu/api`，末尾不要加 `/` |
| `BBS_BASE_URL` | 空 | BBS 首页地址；非空时在主题/站点弹窗提供入口 |
| `BBS_THREAD_URL_TEMPLATE` | 空 | 导入时由帖子 ID 生成原帖链接；例如 `https://bbs.example.edu/forum.php?mod=viewthread&tid={id}` |
| `CONTACT_EMAIL` | 空 | 公开站点联系邮箱元数据 |

`PUBLIC_API_BASE_URL` 必须是浏览器能访问的地址，不能填写 Docker 容器内部主机名或只在服务器可见的地址。项目 API 固定挂载在 `/api` 下。

只有 `siteName`、`shortName`、`description`、`tagline`、`defaultTheme`、`siteUrl`、`apiBaseUrl`、`bbsBaseUrl`、`contactEmail` 会进入 `/runtime-config.js` 与 `/api/config`。管理员密码、数据库路径、会话配置均不进入前端。

正式 Node 服务在每次启动时生成运行时配置。因此，使用完整 Node 服务或 Docker 部署时，修改品牌或后端地址后重启服务即可，不需要重建前端。若将 `dist/client` 单独部署到静态托管，则需要重新构建或更新静态站点的 `runtime-config.js`；浏览器必须先从这个文件得知 API 地址。

## 服务与开发代理

| 字段 | 默认值 | 含义 |
| --- | --- | --- |
| `NODE_ENV` | `development` | 本机开发使用 development；正式公开服务使用 production |
| `BACKEND_HOST` | `127.0.0.1` | API 监听地址。容器内为 `0.0.0.0`；直接在主机反向代理后运行可保留回环地址 |
| `BACKEND_PORT` | `3001` | Node 服务端口 |
| `FRONTEND_PORT` | `5173` | Vite 开发前台端口；生产前端由 Node 托管，不使用此端口 |
| `DEV_API_TARGET` | `http://127.0.0.1:3001` | Vite 开发代理访问的后端地址；不是浏览器公开地址 |
| `CORS_ORIGINS` | 两个本地 5173 origin | 允许携带会话访问 API 的前台来源，多个值逗号分隔，精确到协议+主机+端口；禁止 `*` |
| `TRUST_PROXY` | `0` | 客户端到服务之间可信代理的精确层数，允许 0–5；Nginx 示例为 1 |

`PUBLIC_SITE_URL` 的 origin 自动加入允许列表。CORS origin 不包含路径和末尾斜线，如 `https://wiki.example.edu`。

修改后端端口时，本地开发应同步修改 `DEV_API_TARGET`；浏览器仍可继续使用 `/api`，Vite 会代为转发。开发服务固定绑定本机并要求端口空闲，不会悄悄换到其他端口。

## 数据库与上传

| 字段 | 默认值 | 含义 |
| --- | --- | --- |
| `DATABASE_PATH` | `./data/wiki.sqlite` | SQLite 文件路径，相对于项目工作目录。不是数据库 URL，不支持 PostgreSQL/MySQL 连接串 |
| `UPLOAD_DIR` | `./uploads` | 上传文件目录，原文件名只作为元数据，实际文件采用 UUID 命名 |
| `BACKUP_DIR` | `./backups` | 备份目录；每次备份创建一个独立子目录 |
| `MAX_UPLOAD_MB` | `10` | 单个媒体文件上限，1–50 MiB；最多 20 个文件/请求 |
| `MAX_IMPORT_MB` | `5` | 单个导入文件上限，1–20 MiB；最多 20 个文件/请求 |
| `IMPORT_MAX_RECORDS` | `500` | 单个导入批次条目上限，1–2000 |

相对路径统一从执行 npm / Node 的项目根目录解析。服务需要写入数据库、上传目录；备份命令还需要写入备份目录。使用 Docker 时由 Compose 映射至独立命名卷。

SQLite 采用 WAL、外键和 5 秒 busy timeout。当前部署面向单服务实例的校园 Wiki，不应让 Windows 与 WSL 同时打开同一个活动数据库，也不要用多个容器争用同一个数据库文件。

## 管理员与会话

| 字段 | 默认值 | 含义 |
| --- | --- | --- |
| `ADMIN_USERNAME` | `admin` | 首次建库或显式重置时的管理员名 |
| `ADMIN_PASSWORD` | setup 随机生成 | 首次建库或显式重置时使用，至少 12 个字符 |
| `SESSION_TTL_HOURS` | `12` | 会话有效期，1–168 小时，固定到期后需重新登录 |
| `COOKIE_SECURE` | 本机 false，生产 true | HTTPS 环境必须 true |
| `COOKIE_SAME_SITE` | `lax` | 支持 lax / strict / none；none 必须配合 Secure |

密码使用独立随机盐的 scrypt 哈希。会话为随机不透明 token；数据库只保存其 SHA-256 哈希。Cookie 为 HttpOnly，路径限定 `/api`。管理写操作必须同时有合法会话和 `X-CSRF-Token`。

在后台「站点与账号」修改密码后，该账号所有旧会话立即失效。**修改 `.env` 中 `ADMIN_PASSWORD` 不会自动覆盖已有密码。** 忘记密码时，在服务器上设置新的 `.env` 密码，然后执行：

```powershell
npm.cmd run admin:reset
```

已构建且只安装生产依赖时执行：

```sh
node dist/server/backend/src/cli.js reset-admin
```

该操作只重置所选管理员，不清空条目。若该用户名不存在，会创建对应管理员。初始化后可从运行环境移除 `ADMIN_PASSWORD`；仅在创建或重置账号时重新提供。

## 三种典型环境

### 本机开发

```dotenv
NODE_ENV=development
BACKEND_HOST=127.0.0.1
BACKEND_PORT=3001
FRONTEND_PORT=5173
DEV_API_TARGET=http://127.0.0.1:3001
PUBLIC_SITE_URL=http://localhost:5173
PUBLIC_API_BASE_URL=/api
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
COOKIE_SECURE=false
COOKIE_SAME_SITE=lax
TRUST_PROXY=0
```

使用 localhost 访问前台即可。Vite 会代理 `/api`，无需浏览器直接连接后端域名。

### 同域生产部署（推荐）

```dotenv
NODE_ENV=production
PUBLIC_SITE_URL=https://wiki.example.edu
PUBLIC_API_BASE_URL=/api
CORS_ORIGINS=https://wiki.example.edu
BACKEND_HOST=127.0.0.1
BACKEND_PORT=3001
COOKIE_SECURE=true
COOKIE_SAME_SITE=lax
TRUST_PROXY=1
```

Nginx / 其他单层可信 HTTPS 代理将前台、`/admin`、`/api` 全部转发给 Node。若前面还有另一层可信代理，应核对转发头并按实际链路配置。

### 前后端不同子域

```dotenv
NODE_ENV=production
PUBLIC_SITE_URL=https://wiki.example.edu
PUBLIC_API_BASE_URL=https://wiki-api.example.edu/api
CORS_ORIGINS=https://wiki.example.edu
COOKIE_SECURE=true
COOKIE_SAME_SITE=lax
TRUST_PROXY=1
```

同站点 HTTPS 子域一般可使用 lax。完全不同站点的前后端若需要管理登录，必须用 `COOKIE_SAME_SITE=none`，且可能受浏览器第三方 Cookie 限制；优先通过同域 `/api` 反向代理部署。静态前台请配置 SPA 回退，使 `/a/条目标识` 和 `/admin/...` 返回 `index.html`，同时确保 `/runtime-config.js` 不被长期缓存。

## 排错

| 现象 | 检查项 |
| --- | --- |
| npm.ps1 执行策略错误 | Windows 使用 `npm.cmd` / `npx.cmd` |
| 首次启动提示缺少密码 | 运行 setup，确认 `.env` 中密码至少 12 位；已存在的空配置不会被 setup 覆盖 |
| 登录成功但下一次请求变成 401 | HTTP 本机环境不能使用 Secure Cookie；核对 cookie path、前台 API 地址、SameSite、CORS 与代理 |
| 403 `CSRF_INVALID` | 刷新后台以重新获取会话 token；脚本调用必须设置 X-CSRF-Token |
| 403 `ORIGIN_DENIED` | 将准确的前台 origin 放入 CORS_ORIGINS，并重启后端 |
| 409 `VERSION_CONFLICT` / `IMPORT_STALE` | 内容在读取后已变化，重新载入或重新预览，核对后提交 |
| 413 上传失败 | 同时检查 env 单文件限制和反向代理总请求体限制 |
| 导入 CSV 中文异常 | 导出为 CSV UTF-8；支持 UTF-8 BOM，不自动猜测 GBK |
| 网站仍显示旧名称或旧 API | 完整 Node 服务重启；静态托管更新 runtime-config.js，检查代理缓存 |
| 数据库锁定或 I/O 错误 | 检查是否有多个服务或跨系统进程共用 DB、文件系统权限与磁盘空间 |
| public API 返回空列表 | 初始库为空，或所有条目还在草稿/归档；后台发布后才会公开 |
