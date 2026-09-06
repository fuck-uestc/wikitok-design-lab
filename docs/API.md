# API 契约

API 固定挂载在 `/api`。下面使用本机开发入口 `http://localhost:5173/api`；正式部署请换成 `.env` 中面向浏览器的 `PUBLIC_API_BASE_URL` 对应地址。同域部署中它通常是 `https://你的站点/api`。

除文件下载、`/runtime-config.js` 和明确标注的 204 响应外，响应体均为 JSON；成功响应直接返回对象或数组，没有统一的 `data` 包装。请求 JSON 使用 `Content-Type: application/json`，请求体限制为 2 MiB。上传使用 `multipart/form-data`，由客户端生成 boundary。

## 1. 路径总览

「会话 + CSRF」表示同时携带管理员 cookie 和 `X-CSRF-Token`。

| 方法与路径 | 认证 | 成功响应 |
| --- | --- | --- |
| `GET /api/health` | 无 | 200，`{status:"ok"}` |
| `GET /api/config` | 无 | 200，`SiteConfig` |
| `GET /runtime-config.js` | 无 | 200，JavaScript，路径不在 `/api` 下 |
| `GET /api/taxonomy` | 无 | 200，分类与标签计数 |
| `GET /api/artifacts` | 无 | 200，公开条目游标分页 |
| `GET /api/artifacts/random` | 无 | 200，`ArtifactSummary` |
| `GET /api/artifacts/:idOrSlug` | 无 | 200，已发布的 `Artifact` |
| `GET /api/media/:id` | 公开文件无需登录；其余需会话 | 200，文件流 |
| `POST /api/admin/login` | 用户名和密码 | 200，`AdminSession`，设置 cookie |
| `GET /api/admin/session` | 会话 | 200，`AdminSession` |
| `POST /api/admin/logout` | 会话 + CSRF | 204，无响应体，清除当前会话 |
| `POST /api/admin/password` | 会话 + CSRF | 204，无响应体，撤销该账号全部会话 |
| `GET /api/admin/stats` | 会话 | 200，数量及最近条目 |
| `GET /api/admin/settings` | 会话 | 200，站点公开配置与上传限制 |
| `GET /api/admin/artifacts` | 会话 | 200，管理端页码分页 |
| `POST /api/admin/artifacts` | 会话 + CSRF | 201，创建后的 `Artifact` |
| `GET /api/admin/artifacts/:idOrSlug` | 会话 | 200，任意状态的 `Artifact` |
| `PUT /api/admin/artifacts/:id` | 会话 + CSRF | 200，完整替换后的 `Artifact` |
| `DELETE /api/admin/artifacts/:id` | 会话 + CSRF | 200，归档后的 `Artifact` |
| `GET /api/admin/artifacts/:id/revisions` | 会话 | 200，`Revision[]` |
| `POST /api/admin/artifacts/:id/restore` | 会话 + CSRF | 200，恢复后的 `Artifact` |
| `GET /api/admin/media` | 会话 | 200，媒体列表 |
| `POST /api/admin/media` | 会话 + CSRF | 201，`{items: Media[]}` |
| `POST /api/admin/imports/preview` | 会话 + CSRF | 200，`ImportPreview` |
| `POST /api/admin/imports/:id/commit` | 会话 + CSRF | 200，导入数量对象 |
| `GET /api/admin/export` | 会话 | 200，JSON 下载 |
| `GET /api/admin/audit` | 会话 | 200，最近 100 条审计记录数组 |

管理写入接口中的 `:id` 请使用读取响应返回的条目 UUID。公开详情及管理员详情可以使用 UUID 或 URL 编码后的 slug。没有普通用户注册、API key、Bearer token、PATCH、物理删除条目或删除媒体的接口。

## 2. 会话、CSRF 与 curl 登录

登录成功设置名为 `bbswiki_session` 的 HttpOnly cookie，路径为 `/api`。服务端保存会话 token 的哈希，会话有效期由 `SESSION_TTL_HOURS` 设置，默认 12 小时。`Secure`、`SameSite`、跨域与反向代理配置见 [CONFIGURATION.md](CONFIGURATION.md)。

除登录外，`/api/admin` 所有接口都需要有效会话。`POST`、`PUT`、`DELETE` 等写入操作还必须携带会话对应的 `X-CSRF-Token`，包含登出、媒体上传、预览和提交导入。GET 请求无需 CSRF。修改密码后该账号全部旧会话失效，须重新登录并取得新 token。

浏览器跨域调用必须使用 `credentials: 'include'`，来源须在允许列表中。发送了 `Origin` 的脚本同样遵守允许来源检查；没有 `Origin` 的命令行请求可正常使用 cookie 与 CSRF 认证。

### PowerShell + curl.exe

以下各节示例沿用本段变量。Windows 请明确使用 `curl.exe`，避免旧版 PowerShell 的 `curl` 别名。服务器上启用了 HTTPS 时，使用正确 HTTPS 地址，不添加 `-k` 跳过证书验证。

```powershell
$wikiApi = 'http://localhost:5173/api'
$wikiUsername = Read-Host '管理员用户名'
$wikiSecurePassword = Read-Host '管理员密码' -AsSecureString
$wikiPassword = [System.Net.NetworkCredential]::new('', $wikiSecurePassword).Password
$wikiAuthDir = Join-Path $env:TEMP ('bbs-wiki-api-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $wikiAuthDir | Out-Null
$wikiCookieFile = Join-Path $wikiAuthDir 'cookies.txt'

# 保证经 stdin 传给 curl 的 JSON 使用 UTF-8。
$wikiPreviousEncoding = $OutputEncoding
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$wikiLoginJson = @{ username = $wikiUsername; password = $wikiPassword } | ConvertTo-Json -Compress
$wikiLoginText = $wikiLoginJson | curl.exe --silent --show-error --fail-with-body --cookie-jar $wikiCookieFile --header 'Content-Type: application/json' --data-binary '@-' "$wikiApi/admin/login"
if ($LASTEXITCODE -ne 0) { throw '登录失败，请检查返回的错误。' }
$wikiSession = ($wikiLoginText -join "`n") | ConvertFrom-Json
$wikiCsrf = $wikiSession.csrfToken
$wikiLoginJson = $null
$wikiPassword = $null
$wikiSecurePassword = $null
$wikiSession | Select-Object username, expiresAt
```

密码通过隐藏输入获得，经标准输入提交，不写入示例代码或命令行参数。cookie 文件位于当前用户的临时目录；把它与 `$wikiCsrf` 当作登录凭据保存，不提交到版本库。

`POST /api/admin/login` 请求：

```json
{"username":"admin","password":"此处仅为占位符，请使用你设置的密码"}
```

用户名为去除首尾空白后的 1–100 字符，密码为 1–256 字符。成功响应 `AdminSession`：

```json
{
  "username": "admin",
  "csrfToken": "由服务器生成的43字符base64url令牌",
  "expiresAt": "2026-09-06T12:00:00.000Z"
}
```

上例 token 与时间仅示意结构。后续应读取真实响应，不生成或硬编码 CSRF 值。

读取当前会话：

```powershell
curl.exe --silent --show-error --fail-with-body --cookie $wikiCookieFile "$wikiApi/admin/session"
```

`POST /api/admin/password` 的 JSON 体为 `{"currentPassword":"当前密码","newPassword":"新密码"}`。新密码长度 12–256，当前密码最长 256；成功返回 204，失败的当前密码返回 `400 WRONG_PASSWORD`。两个字段以外的属性会被拒绝。自动化脚本应像登录例子一样用隐藏输入、JSON 序列化与 stdin 传值。

使用结束后登出并删除本次临时 cookie：

```powershell
curl.exe --silent --show-error --fail-with-body --request POST --cookie $wikiCookieFile --cookie-jar $wikiCookieFile --header "X-CSRF-Token: $wikiCsrf" "$wikiApi/admin/logout"
Remove-Item -LiteralPath $wikiCookieFile
Remove-Item -LiteralPath $wikiAuthDir
$wikiCsrf = $null
$wikiSession = $null
$wikiLoginText = $null
$OutputEncoding = $wikiPreviousEncoding
```

登出只撤销当前会话。以上清理针对本段新建的临时目录；若自行在其中保存了其他文件，应先自行处理它们。

## 3. 共用数据结构

### ArtifactInput、Artifact 与 ArtifactSummary

`ArtifactInput` 的字段、默认值、长度和类型见 [导入字段表](IMPORTING.md#3-标准字段)。直接创建的最小请求体为：

```json
{"title":"[示例] 校园条目","content":"这里是待核对的 Markdown 正文。"}
```

创建请求缺省 `status` 为 `draft`。空 slug 从标题生成，空摘要从正文生成。输入采用严格字段校验；单条 API 不接受导入专用别名、字符串形式的标签数组或正文数组，不自动拼接 BBS 原帖 URL。

完整 `Artifact` 响应示例：

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "title": "[示例] 校园条目",
  "slug": "example-campus-entry",
  "summary": "这里是待核对的 Markdown 正文。",
  "content": "这里是待核对的 Markdown 正文。",
  "kind": "article",
  "category": "校园故事",
  "tags": ["示例"],
  "aliases": [],
  "author": "示例编辑",
  "sourceUrl": "",
  "sourceTitle": "",
  "sourceThreadId": "",
  "externalId": "example:entry:1",
  "coverUrl": "",
  "coverMediaId": "",
  "coverAlt": "",
  "coverCredit": "",
  "eventDate": "",
  "status": "draft",
  "attachmentIds": [],
  "version": 1,
  "createdAt": "2026-09-06T00:00:00.000Z",
  "updatedAt": "2026-09-06T00:00:00.000Z",
  "publishedAt": null,
  "attachments": []
}
```

`ArtifactSummary` 等于上述对象去掉 `content` 和 `attachments`，保留 `attachmentIds`、`version` 等其他字段。公开列表、随机接口、管理员列表及统计中的 `recent` 返回摘要；详情和写入成功响应返回完整条目。

`version` 是从 1 开始递增的整数。时间戳使用 UTC ISO 8601 字符串；从未发布的条目 `publishedAt` 为 `null`，首次发布后保留第一次发布时间，包括后续改回草稿或归档。`eventDate` 是单独的内容日期字符串。

`attachments` 包含按关联顺序排列的 `Media` 对象。标签在读取时按名称排序，不能依赖输入时的标签顺序。API 保存并返回原始 Markdown 文本，调用方自行展示时也应使用安全的 Markdown 渲染器；前台已配置跳过 HTML 和过滤危险链接。

### Media

```json
{
  "id": "22222222-2222-4222-8222-222222222222",
  "originalName": "校园资料.pdf",
  "mimeType": "application/pdf",
  "size": 10240,
  "url": "/api/media/22222222-2222-4222-8222-222222222222",
  "createdAt": "2026-09-06T00:00:00.000Z"
}
```

`size` 为字节数，`url` 是相对于 **API 所在 origin** 的路径。前后端分域时应使用后端域名解析它，而不是当前静态前台域名。封面由 `coverMediaId` 或 `coverUrl` 表示，封面媒体不会自动加入 `attachments`。

### Revision

每个历史版本对象的结构为：

```text
{
  id: number,             // 历史记录 ID
  version: number,        // 此条目的版本号，恢复时使用它
  action: string,         // create / update / archive / restore / import
  actor: string,          // 操作管理员用户名
  createdAt: string,      // UTC ISO 8601
  snapshot: ArtifactInput
}
```

## 4. 公开读取

### 健康状态、站点配置

`GET /api/health` 会执行数据库 `SELECT 1`，成功返回 `{"status":"ok"}`。

`GET /api/config` 返回 `SiteConfig`，包含以下全部字段：

```json
{
  "siteName": "校园 BBS Wiki",
  "shortName": "校园志",
  "description": "把校园里的故事、经验和共同记忆，慢慢收藏。",
  "tagline": "校园有回声，记忆有来处。",
  "defaultTheme": "margin",
  "siteUrl": "http://localhost:5173",
  "apiBaseUrl": "/api",
  "bbsBaseUrl": "",
  "contactEmail": ""
}
```

实际值由部署 env 决定，`defaultTheme` 为 `margin` 或 `drift`。不会包含数据库路径、管理员密码、私密会话配置等。`GET /runtime-config.js` 返回相同对象的 JavaScript 赋值：`window.__WIKI_CONFIG__={...};`，并设置 `Cache-Control: no-store`。

### 分类与标签

`GET /api/taxonomy`：

```json
{
  "categories": [{"name":"校园故事","count":3}],
  "tags": [{"name":"示例","count":3}]
}
```

只统计已发布条目，不返回空分类；按条目数降序、名称排序。分类无分页，标签最多返回前 100 个。空库返回两个空数组。

### 条目列表、检索与分页

`GET /api/artifacts` 支持：

| 查询参数 | 默认值 / 限制 | 含义 |
| --- | --- | --- |
| `q` | 可选，去首尾空白后最多 100 字符 | 标题、摘要、正文、别名、作者、帖子 ID、标签的包含匹配 |
| `category` | 可选，最多 60 字符 | 精确分类名 |
| `tag` | 可选，最多 60 字符 | 精确标签名 |
| `ids` | 可选，英文逗号分隔 | 最多 100 个条目 UUID，各最多 64 字符；总字符串最多 6500 字符 |
| `limit` | 12，允许 1–100 整数 | 单页条数 |
| `cursor` | 可选，最多 500 字符 | 上一次响应的 `nextCursor`，不自行构造 |

多个筛选条件同时生效。`q` 会做 NFKC 规范化，`%` 和 `_` 按普通字符查找，不视作通配符；这是数据库文本匹配，不是语义搜索。`ids` 只筛选结果，不保留参数中的顺序；空 `ids=` 返回空列表，未提供 `ids` 时不过滤 ID。

响应：

```text
{
  items: ArtifactSummary[],
  total: number,
  nextCursor: string | null
}
```

条目按 `publishedAt` 降序、UUID 降序排列。`total` 是筛选条件下的全部公开条目数，不受当前 cursor 影响。`nextCursor=null` 表示没有下一页；空结果为 `{"items":[],"total":0,"nextCursor":null}`。翻页时保留原有筛选条件，变更筛选时移除 cursor。

```powershell
curl.exe --silent --show-error --fail-with-body --get --data-urlencode 'q=校园' --data-urlencode 'category=校园故事' --data-urlencode 'limit=12' "$wikiApi/artifacts"
```

### 随机条目与详情

- `GET /api/artifacts/random?category=...`：`category` 可选，最长 60，按分类精确过滤；返回一个 `ArtifactSummary`，没有候选时返回 `404 NOT_FOUND`。
- `GET /api/artifacts/:idOrSlug`：返回一个已发布的完整 `Artifact`。不存在、草稿或归档都返回 `404 NOT_FOUND`，即使请求携带管理员 cookie 也是如此。

```powershell
$wikiSlug = [uri]::EscapeDataString('example-campus-entry')
curl.exe --silent --show-error --fail-with-body "$wikiApi/artifacts/$wikiSlug"
```

### 文件读取

`GET /api/media/:id` 返回文件流：PNG/JPEG/GIF/WebP 以正确图片 MIME 类型显示，PDF/TXT 带 `Content-Disposition: attachment` 和原文件名供下载。不存在或匿名无权读取的文件均返回 404。

媒体被至少一个已发布条目的 `coverMediaId` 或 `attachmentIds` 引用后可匿名读取。仅在正文写文件 URL 不建立公开关联。管理员携带有效 cookie 可读取未公开媒体，无需 CSRF。详情见 [图片与附件](IMPORTING.md#8-图片和附件)。

## 5. 管理条目、版本和统计

### 列表与读取

`GET /api/admin/artifacts` 查询参数：

| 参数 | 默认值 / 限制 |
| --- | --- |
| `q` | 可选，去首尾空白后最多 100 字符，匹配范围与公开搜索一致 |
| `status` | 可选，`draft` / `published` / `archived` / 空字符串；未提供或空字符串表示全部 |
| `page` | 1，允许 1–100000 整数 |
| `limit` | 20，允许 1–100 整数 |

响应 `{"items":ArtifactSummary[],"total":number,"page":number,"pages":number}`，按 `updatedAt` 降序、UUID 降序排列。空结果的 `pages=0`，越界页返回空 `items`。管理列表不使用 cursor，不提供分类或标签筛选参数。

`GET /api/admin/artifacts/:idOrSlug` 返回完整条目，不限制发布状态。

### 创建、完整更新与归档

- `POST /api/admin/artifacts`：JSON 体为 `ArtifactInput`，返回 201 与创建后的完整 `Artifact`。
- `PUT /api/admin/artifacts/:id`：JSON 体为 `ArtifactInput` 加正整数 `version`，返回 200 与新版本。它执行完整替换；省略的可选字段按默认值重置，不是局部更新。
- `DELETE /api/admin/artifacts/:id`：JSON 体仅为 `{"version":当前版本号}`，返回 200 与状态为 `archived` 的完整条目。保留历史版本和数据库记录。

请求版本与数据库不一致返回 `409 VERSION_CONFLICT`，不会覆盖较新的编辑。创建时相同 slug 或非空 externalId 返回 409；这两个标识全站唯一，包含草稿及归档内容。

创建示例（会创建明确标记的示例草稿）：

```powershell
$wikiNewInput = @{
  title = '[示例] API 录入练习'
  slug = 'example-api-' + [guid]::NewGuid().ToString('N')
  content = '这是 API 格式演示，请替换成真实资料。'
  kind = 'article'
  tags = @('示例')
  status = 'draft'
} | ConvertTo-Json -Depth 10 -Compress
$wikiCreatedText = $wikiNewInput | curl.exe --silent --show-error --fail-with-body --cookie $wikiCookieFile --header "X-CSRF-Token: $wikiCsrf" --header 'Content-Type: application/json' --data-binary '@-' "$wikiApi/admin/artifacts"
if ($LASTEXITCODE -ne 0) { throw '创建失败。' }
$wikiArtifact = ($wikiCreatedText -join "`n") | ConvertFrom-Json
$wikiArtifact | Select-Object id, slug, status, version
```

保留完整已有字段更新的例子。应先取得最新详情；此处沿用刚创建的响应，仅修改摘要，继续保留草稿状态：

```powershell
$wikiUpdate = $wikiArtifact | Select-Object * -ExcludeProperty id, createdAt, updatedAt, publishedAt, attachments
$wikiUpdate.summary = '这是更新后的示例摘要。'
$wikiUpdateJson = $wikiUpdate | ConvertTo-Json -Depth 10 -Compress
$wikiUpdatedText = $wikiUpdateJson | curl.exe --silent --show-error --fail-with-body --request PUT --cookie $wikiCookieFile --header "X-CSRF-Token: $wikiCsrf" --header 'Content-Type: application/json' --data-binary '@-' "$wikiApi/admin/artifacts/$($wikiArtifact.id)"
if ($LASTEXITCODE -ne 0) { throw '更新失败，请检查版本冲突或字段错误。' }
$wikiArtifact = ($wikiUpdatedText -join "`n") | ConvertFrom-Json
```

上述 `Select-Object` 保留 `version`，移除服务端生成且更新不接受的其他响应字段。发布时将完整输入中的 `status` 改为 `published`；改回草稿、调整附件也通过同一 PUT 接口完成。

归档示例：

```powershell
$wikiArchiveJson = @{ version = $wikiArtifact.version } | ConvertTo-Json -Compress
$wikiArchiveText = $wikiArchiveJson | curl.exe --silent --show-error --fail-with-body --request DELETE --cookie $wikiCookieFile --header "X-CSRF-Token: $wikiCsrf" --header 'Content-Type: application/json' --data-binary '@-' "$wikiApi/admin/artifacts/$($wikiArtifact.id)"
if ($LASTEXITCODE -ne 0) { throw '归档失败。' }
$wikiArtifact = ($wikiArchiveText -join "`n") | ConvertFrom-Json
```

### 历史版本和恢复

`GET /api/admin/artifacts/:id/revisions` 返回 `Revision[]`，按版本号降序，最多最近 100 条。不存在的条目返回 404。

`POST /api/admin/artifacts/:id/restore` 请求体：

```json
{"version":3,"revision":1}
```

`version` 是条目当前版本，`revision` 是要恢复的历史 **版本号**，不是 Revision 的数据库 `id`。两者均为正整数。恢复完整快照，包含内容、附件关联、slug、externalId 和发布状态，并生成新的递增版本；不会把当前版本号倒退。若快照与现有其他内容的唯一标识冲突，仍会返回 409。

### 仪表盘与设置

`GET /api/admin/stats`：

```text
{
  published: number,
  draft: number,
  archived: number,
  media: number,
  revisions: number,
  recent: ArtifactSummary[]   // 按最近更新时间排列，最多 6 条，包含全部状态
}
```

`GET /api/admin/settings`：

```text
{
  site: SiteConfig,
  limits: {
    uploadMb: number,         // 默认 10，单个媒体文件，MiB
    importMb: number,         // 默认 5，单个导入文件，MiB
    importMaxRecords: number, // 默认 500，整个批次
    maxFiles: 20
  }
}
```

此接口只读取当前配置。修改网站名、后端地址和限制应修改 env 后重启服务，没有写配置 API。

## 6. 媒体上传与列表

`POST /api/admin/media` 使用 multipart，重复文件字段名必须为 **`files`**。每次 1–20 个文件，单文件默认 10 MiB，不接受额外的文本字段。支持 PNG、JPEG、GIF、WebP、PDF、UTF-8 TXT；校验文件签名/编码，拒绝空文件及不支持的格式。

```powershell
$wikiImagePath = 'C:\资料\campus.jpg'
$wikiPdfPath = 'C:\资料\guide.pdf'
$wikiMediaText = curl.exe --silent --show-error --fail-with-body --cookie $wikiCookieFile --header "X-CSRF-Token: $wikiCsrf" --form "files=@$wikiImagePath" --form "files=@$wikiPdfPath" "$wikiApi/admin/media"
if ($LASTEXITCODE -ne 0) { throw '上传失败。' }
$wikiMedia = ($wikiMediaText -join "`n") | ConvertFrom-Json
$wikiMedia.items | Select-Object id, originalName, mimeType, size
```

请将示例文件路径换成实际文件。不要手动添加 `Content-Type: multipart/form-data`，curl 会生成包含 boundary 的完整请求头。

成功返回 201 和 `{"items":Media[]}`，顺序对应上传文件顺序。相同 SHA-256 文件复用原 ID，不重复落盘；即使全是已存在文件仍返回 201。响应可能包含重复 ID，客户端应按 ID 处理复用。

整批媒体先校验格式，成功写入才提交；其中一个不支持的文件会使请求失败，不产生部分新媒体记录。上传本身不会将文件公开，需再通过条目建立发布关联。

`GET /api/admin/media?page=1`：`page` 默认 1，须为正整数，固定每页 50 个，按创建时间降序。返回 `{"items":Media[],"total":number}`，不返回 `page`、`pages` 或 cursor。无需单独的媒体详情 JSON 接口，文件内容使用 `/api/media/:id`。

## 7. 文件导入预览与提交

文件格式、字段映射及完整 JSON/CSV/多文件 Markdown 示例见 [IMPORTING.md](IMPORTING.md)。预览接口只接收 multipart 文件，不接收直接把整个数据集放在 JSON 请求体中的调用方式。

### 生成预览

`POST /api/admin/imports/preview` multipart 字段：

| 字段 | 说明 |
| --- | --- |
| `files` | 必填，可重复 1–20 次；JSON/CSV/Markdown，可混合 |
| `policy` | 可选，`skip` / `update` / `error`，默认 `skip` |
| `defaultStatus` | 可选，`draft` / `published`，默认 `draft` |

最多两个文本字段，字段值最多 100 字节；每个文件默认最大 5 MiB，整个批次默认最多 500 条。不能额外增加未声明的 multipart 字段。

沿用登录例子的会话，先对自带 JSON 模板生成预览：

```powershell
$wikiImportFile = (Resolve-Path -LiteralPath 'frontend/public/templates/artifacts.json').Path
$wikiPreviewText = curl.exe --silent --show-error --fail-with-body --cookie $wikiCookieFile --header "X-CSRF-Token: $wikiCsrf" --form "files=@$wikiImportFile" --form 'policy=skip' --form 'defaultStatus=draft' "$wikiApi/admin/imports/preview"
if ($LASTEXITCODE -ne 0) { throw '预览请求失败。' }
$wikiPreview = ($wikiPreviewText -join "`n") | ConvertFrom-Json
$wikiPreview.counts
$wikiPreview.rows | Format-Table file, row, title, status, action, errors -Wrap
```

需要多文件时，为每个路径增加一个 `--form "files=@路径"`。成功的 `ImportPreview` 结构如下（仅示意一个新条目）：

```json
{
  "id": "33333333-3333-4333-8333-333333333333",
  "expiresAt": "2026-09-06T00:30:00.000Z",
  "rows": [
    {
      "row": 1,
      "file": "artifacts.json",
      "title": "[示例] 校园条目",
      "slug": "example-campus-entry",
      "status": "draft",
      "action": "create",
      "errors": []
    }
  ],
  "counts": {"create":1,"update":0,"skip":0,"error":0},
  "canCommit": true
}
```

`action` 为 `create` / `update` / `skip` / `error`。`row` 从每个文件的第 1 条记录开始计数，不是文本行号；文件级解析失败使用 `row=0`、空 `title`、`action="error"`。错误行可以没有 `slug` 或 `status`，`errors` 为字符串数组。

解析失败或记录字段错误通常仍返回 **200** 和 `canCommit=false`，必须检查结果，不能仅看 HTTP 状态。文件/记录数量超限、无文件或认证失败会返回相应的 4xx。

`canCommit` 仅在没有错误行且至少有一条 create/update 时为 true。无效预览和全 skip 预览虽然有响应 ID，却不会保存为可提交计划。

### 确认提交

核对上一步逐条结果后，单独运行以下命令：

```powershell
if (-not $wikiPreview.canCommit) { throw '没有可提交的预览，请处理错误或确认全部条目已被跳过。' }
curl.exe --silent --show-error --fail-with-body --request POST --cookie $wikiCookieFile --header "X-CSRF-Token: $wikiCsrf" "$wikiApi/admin/imports/$($wikiPreview.id)/commit"
```

`POST /api/admin/imports/:id/commit` 不需要请求体，不再接收策略和文件。执行服务端保存的计划，成功返回：

```json
{"create":1,"update":0,"skip":0,"error":0}
```

预览有效期 30 分钟，绑定生成它的管理员账号。提交在一个事务内执行；会复核全部记录的身份与版本，包含计划中的 skip 项，避免依照过时的预览写入。

- `409 IMPORT_STALE`：预览后目标版本/身份变化或原计划新增的条目已经存在；重新预览。
- `409 IMPORT_COMMITTED`：同批次已成功提交；不要把它当作可重试的新批次。
- `410 IMPORT_EXPIRED`：不存在、已过期、属于别的管理员，或该预览从未保存为可提交计划。

提交接口没有按行部分成功模式。`update` 会整条替换并增加版本；重复文件使用 `skip` 可避免重复新增，但重复使用 `update` 即使内容一样也会生成新版本。

## 8. 内容导出与审计

### 内容导出

`GET /api/admin/export` 下载 `campus-wiki-YYYY-MM-DD.json`，日期按 UTC 计算。包含所有状态的条目，按创建时间升序：

```text
{
  schemaVersion: 1,
  exportedAt: string,
  artifacts: ArtifactInput[]
}
```

```powershell
$wikiExportPath = Join-Path (Get-Location) 'wiki-content-export.json'
curl.exe --silent --show-error --fail-with-body --cookie $wikiCookieFile --output $wikiExportPath "$wikiApi/admin/export"
if ($LASTEXITCODE -ne 0) { throw '导出失败，请检查下载文件中的错误响应。' }
```

导出可能包含尚未公开的草稿内容，请存放在适当目录。文件不包含条目 ID、历史版本、原发布时间、管理员或文件二进制；`coverMediaId`、`attachmentIds` 仍是源数据库中的媒体标识。完整迁移使用数据库与上传目录备份，见 [DEPLOYMENT.md](DEPLOYMENT.md)。

### 操作日志

`GET /api/admin/audit` 返回数组，最多最新 100 条，按内部记录 ID 降序：

```json
[
  {
    "actor": "admin",
    "action": "create",
    "targetId": "11111111-1111-4111-8111-111111111111",
    "detail": "version=1;status=draft",
    "createdAt": "2026-09-06T00:00:00.000Z"
  }
]
```

账号相关操作的 `targetId` 可为空。`detail` 是字符串，导入批次操作可能包含 JSON 序列化后的计数；不要假设它始终是 JSON 对象。记录包括条目写入、媒体上传、导入、登录登出、密码修改与初始化/重置等操作，无日志写入或删除 API。

## 9. 错误响应与限流

常规失败结构：

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "输入内容不符合要求",
    "details": [{"field":"title","message":"标题不能为空"}]
  }
}
```

`details` 为可选字段；输入校验错误时为 `{field,message}[]`，根对象错误的 `field` 可能为空字符串。客户端应根据 HTTP 状态和 `code` 处理流程，用 `message` 展示说明，不匹配中文文案来判断错误类型。

| HTTP | `error.code` | 原因与处理 |
| --- | --- | --- |
| 400 | `VALIDATION_FAILED` | 字段、类型、长度、日期、URL 或未声明属性不符合要求 |
| 400 | `INVALID_BODY` | 请求不是有效 JSON；请求过大时同一 code 可为 413 |
| 400 | `INVALID_CURSOR` / `INVALID_IDS` | 游标或 ID 列表非法；重新开始分页或拆分请求 |
| 400 | `MISSING_FILES` | 上传没有 `files` 文件 |
| 400 | `UNSUPPORTED_MEDIA` | 文件为空或不支持其真实格式 |
| 400 | `INVALID_COVER` / `MISSING_ATTACHMENT` | 媒体不存在或封面不是图片 |
| 400 | `WRONG_PASSWORD` | 修改密码时当前密码不正确 |
| 400 | `INVALID_IMPORT` | 服务端计划不可提交；常规流程不应调用无效预览 |
| 400 | `LIMIT_FILE_COUNT` / `LIMIT_PART_COUNT` / `LIMIT_FIELD_COUNT` / `LIMIT_FIELD_VALUE` / `LIMIT_UNEXPECTED_FILE` 等 | multipart 文件数量、字段或名称不符合限制，code 来自上传解析器 |
| 401 | `INVALID_CREDENTIALS` | 登录账号或密码错误 |
| 401 | `UNAUTHENTICATED` | 没有有效管理员会话，重新登录 |
| 403 | `CSRF_INVALID` | token 缺失或不匹配，读取当前会话或重新登录 |
| 403 | `ORIGIN_DENIED` | 请求来源不在 env 的允许列表中 |
| 404 | `NOT_FOUND` | 内容/文件/版本不存在，或公开接口不能读取该内容 |
| 404 | `ENDPOINT_NOT_FOUND` | 未定义的 API 路径 |
| 409 | `VERSION_CONFLICT` | 旧版本编辑；读取最新详情后合并 |
| 409 | `DUPLICATE_ARTIFACT` | slug 或 externalId 已存在 |
| 409 | `IDENTITY_CONFLICT` | slug 与 externalId 指向两个不同条目 |
| 409 | `IMPORT_STALE` / `IMPORT_COMMITTED` | 预览已过时或已提交 |
| 410 | `IMPORT_EXPIRED` | 预览不可获取或已过期，重新预览 |
| 413 | `LIMIT_FILE_SIZE` | 单个文件超出媒体/导入大小限制 |
| 413 | `IMPORT_TOO_LARGE` | 单批记录数超限 |
| 429 | `RATE_LIMITED` / `LOGIN_LIMITED` | 达到请求/失败登录限流，按返回的重试信息等待 |
| 500 | `INTERNAL_ERROR` | 服务端异常，查看服务日志 |

文件预览中的单行验证失败位于 `rows[].errors`，不套用上述顶层 `error` 结构。

`/api` 请求有每来源 IP 每分钟 300 次的限制。登录与修改密码共用额外的每 IP 每 15 分钟 10 次失败请求限制，成功请求不计入该失败次数。限流状态保存在当前进程内存，重启会重置；反向代理需正确设置 `TRUST_PROXY`，让来源 IP 与实际网络拓扑一致。接口返回标准限流响应头，达到限制时返回 429。

`/api` 响应使用 `Cache-Control: no-store`。当前契约没有 API 版本前缀；需要集成时应以本文与仓库 `shared/types.ts`、`shared/schema.ts` 为准，并在升级时核对变更。
