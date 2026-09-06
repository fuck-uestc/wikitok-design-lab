# 内容录入与批量导入

一个 artifact 是一条完整的 Wiki 内容。可以先在后台单条录入，也可以把整理好的 JSON、CSV 或 Markdown 文件作为一个批次导入。所有示例均为格式演示，请替换成核对过的校园资料。

## 1. 在后台录入一条内容

1. 访问站点 `/admin`，用初始化时设置的管理员账号登录。
2. 进入「条目管理」→「新建条目」，填写标题与 Markdown 正文。
3. 按需填写类型、分类、标签、人物别名、原作者、BBS 原帖链接和帖子 ID。
4. 选择已上传的封面、上传新封面或填写图片外链；按需添加附件。
5. 保存为草稿，核对预览后将状态改为「发布」并保存。

草稿和归档条目只有管理员可读取。前台搜索、分类、随机浏览和详情只返回已发布内容。归档保留内容及历史版本，可以在后台编辑或恢复；不会物理删除数据库记录。

表单保存会检查当前版本。出现并发更新提示时，应先重新读取最新内容再合并；不要反复提交旧版本。发布、编辑、归档、导入更新及恢复都会产生历史版本。

## 2. 批量导入流程

1. 进入后台「批量导入」，下载 [JSON 模板](../frontend/public/templates/artifacts.json)、[CSV 模板](../frontend/public/templates/artifacts.csv) 或 [Markdown 模板](../frontend/public/templates/artifact.md)。运行中的站点也提供 `/templates/artifacts.json`、`/templates/artifacts.csv`、`/templates/artifact.md`。
2. 按下方字段说明整理文件。需要本地图片或附件时，先上传到媒体库，复制返回的媒体 ID。
3. 上传一个或多个文件，选择重复处理策略与缺省状态。
4. 点击「校验并生成预览」，核对新增、更新、跳过、错误数量及逐条结果。
5. 修正所有错误后重新预览；确认内容后点击「确认导入」。

预览只解析数据和保存待提交计划，不写入 Wiki 条目。有效期为 **30 分钟**，绑定生成预览的管理员账号。提交必须使用同一个管理员账号；同一账号重新登录后，在有效期内仍可提交原批次。

只要有一行错误，整个批次都不能提交。全部条目均为跳过时也无需提交。提交采用一个数据库事务，所有新增与更新一起成功或一起回滚。若预览后目标内容被编辑、归档或另一个导入修改，应重新预览后再确认。

### 数量、格式与大小

| 项目 | 当前默认值 | 配置或固定限制 |
| --- | --- | --- |
| 单批文件数 | 最多 20 个 | 固定；可在同一批中混合 JSON、CSV、Markdown |
| 单个导入文件 | 5 MiB | `MAX_IMPORT_MB`，允许 1–20；以 1024 × 1024 字节计算 |
| 单批记录数 | 500 条 | `IMPORT_MAX_RECORDS`，允许 1–2000；所有文件中的记录合计 |
| 文件编码 | UTF-8 | 支持 UTF-8 BOM；不自动转换 GBK、UTF-16 |
| CSV 单条记录 | 300000 | CSV 解析器的 `max_record_size` 限制，还需满足各字段长度限制 |
| 单个媒体文件 | 10 MiB | `MAX_UPLOAD_MB`，允许 1–50 |
| 单次媒体上传 | 最多 20 个 | 使用独立的媒体上传接口 |

当前实际限制可以在后台查看，也可调用 `GET /api/admin/settings`。反向代理的请求体限制也需要容纳整个请求，详见 [部署文档](DEPLOYMENT.md)。超出单批记录数会直接返回 HTTP 413；格式或字段问题通常在预览的逐行错误中显示。

## 3. 标准字段

以下为创建、替换更新与导入共用的字段。长文要求标题和正文；切片要求标题及对应 short 内容，不要求 Markdown 正文。其余字段按下表和 v2 补充说明处理。字符串会去掉首尾空白，`null` 一般不是空值；空字符串使用 `""`，空数组使用 `[]`。

| 字段 | 类型、限制 | 省略或为空时的行为 |
| --- | --- | --- |
| `title` | 字符串，1–200 | 必填；Markdown 可在未声明标题时从正文标题或文件名推断 |
| `slug` | 字符串，最多 120；首字符须为文字或数字，后续允许文字、数字、`_`、`-` | 省略或 `""` 时由标题生成；建议提供稳定值 |
| `summary` | 字符串，最多 600 | 长文空值时派生；切片始终由 short 内容派生，不能单独编辑 |
| `content` | Markdown 字符串，最多 200000 | 长文必填；Markdown 文件正文直接作为此字段 |
| `kind` | `article` / `guide` / `person` / `event` / `glossary` | 省略为 `article`，不能用 `""` 代替 |
| `category` | 字符串，最多 60 | `""`；新分类随条目保存自动出现 |
| `tags` | 字符串数组，最多 30 项；每项 1–60 | `[]`；去掉完全重复的项 |
| `aliases` | 字符串数组，最多 30 项；每项 1–60 | `[]`；人物曾用名、俗称可参与搜索，去掉完全重复的项 |
| `author` | 字符串，最多 100 | `""`；用于保留资料作者，不等同于操作管理员 |
| `sourceUrl` | 完整 HTTP/HTTPS URL，最多 2048 | `""`；仅批量导入时可由帖子 ID 和 env 模板补全 |
| `sourceTitle` | 字符串，最多 200 | `""`；原帖标题或来源说明 |
| `sourceThreadId` | 字符串，最多 100 | `""`；原 BBS 帖子 ID，可搜索，本身不参与唯一性判断 |
| `externalId` | 字符串，最多 200 | `""`；非空时全站唯一，用于稳定识别导入来源 |
| `coverUrl` | 完整 HTTP/HTTPS URL，最多 2048 | `""`；与 `coverMediaId` 不能同时非空 |
| `coverMediaId` | 已上传图片的媒体 ID，最多 64 | `""`；不能指向 PDF、TXT 或不存在的文件 |
| `coverAlt` | 字符串，最多 300 | `""`；图片替代文字 |
| `coverCredit` | 字符串，最多 500 | `""`；图片作者、来源及授权说明 |
| `eventDate` | 有效的 `YYYY-MM-DD` 字符串 | `""`；这是内容发生日期，不是站点发布时间 |
| `status` | `draft` / `published` / `archived` | 直接创建省略时为 `draft`；导入省略或空字符串时采用该批缺省状态 |
| `attachmentIds` | 已上传文件 ID 的数组，最多 20 项，每项 1–64 | `[]`；保留首次出现顺序并去重 |

类型对应：`article` 校园故事、`guide` 实用指南、`person` 校园人物、`event` 校园事件、`glossary` 社区词典。

其他规则：

- 原帖、封面 URL 不能带 URL 用户名或密码，不能用 `javascript:`、`data:`、磁盘路径或相对路径。正文中的 Markdown 链接由阅读器另外处理。
- 自动 slug 会对标题做 NFKC 规范化、转小写，将非文字数字的连续字符变成 `-`，截取前 100 个字符；结果为空时使用 `artifact`。不会自动为重名添加序号。
- 创建和导入不接受 `id`、`version`、`createdAt`、`updatedAt`、`publishedAt`、`attachments` 等响应字段。`PUT` 更新接口额外要求 `version`，详见 [API 文档](API.md)。
- 未声明的字段会报错。源数据中的点赞数、抓取时间、完整用户对象等应先转换或移除，不会自动混入 Wiki 内容。
- 标准 API 请求应使用表中的类型。下述字符串拆分、字段别名及正文数组转换仅适用于文件导入。

## 4. JSON

### 可直接导入的完整例子

保存为 UTF-8 的 `campus-artifacts.json`：

```json
{
  "schemaVersion": 2,
  "artifacts": [
    {
      "title": "[示例] 新生资料整理索引",
      "slug": "example-freshman-index",
      "summary": "演示如何整理 BBS 经验帖，内容待管理员核对。",
      "content": "> 这是导入格式示例。\n\n## 资料清单\n\n- 报到经验\n- 校园生活\n\n## 来源说明\n\n请替换成真实资料，并保留原作者与原帖链接。",
      "kind": "guide",
      "category": "新生指南",
      "tags": ["示例", "新生"],
      "aliases": ["入学索引"],
      "author": "示例编辑",
      "sourceUrl": "https://bbs.example.edu/forum.php?mod=viewthread&tid=12345",
      "sourceTitle": "[示例] 新生经验汇总",
      "sourceThreadId": "12345",
      "externalId": "example-bbs:thread:12345",
      "coverUrl": "",
      "coverMediaId": "",
      "coverAlt": "",
      "coverCredit": "",
      "eventDate": "2026-09-01",
      "status": "draft",
      "attachmentIds": []
    },
    {
      "title": "[示例] 一个社区词语",
      "slug": "example-campus-word",
      "externalId": "example-bbs:glossary:campus-word",
      "kind": "glossary",
      "content": "## 含义\n\n请在这里填写已核对的词语解释。",
      "status": "draft"
    }
  ]
}
```

支持四种顶层结构：

1. 对象数组：`[{"title":"…","content":"…"}]`。
2. `{"artifacts":[...]}`，也就是上面的完整例子与站点内容导出的结构。
3. `{"data":{"rows":[...]}}`，便于转换已有 BBS 导出。
4. 单个条目对象：`{"title":"…","content":"…"}`。

包装对象中的 `schemaVersion`、`exportedAt` 等字段不作为条目字段导入；当前不会基于 `schemaVersion` 自动进行格式迁移。文件必须是完整 JSON，不能使用注释、尾逗号或 JSONL。

### 从 BBS 导出转换

以下文件也能导入：

```json
{
  "data": {
    "rows": [
      {
        "title": "[示例] 校园经验帖整理",
        "slug": "example-bbs-thread-24680",
        "body": ["## 整理概述", "这里是第一段资料。", "这里是第二段资料。"],
        "excerpt": "内容待核对。",
        "author_name": "示例作者",
        "forum_name": "校园生活",
        "thread_id": "24680",
        "external_id": "example-bbs:thread:24680",
        "tags": "示例|生活",
        "aliases": "曾用名,社区俗称",
        "status": "draft"
      }
    ]
  }
}
```

若 `.env` 配置：

```dotenv
BBS_THREAD_URL_TEMPLATE="https://bbs.example.edu/forum.php?mod=viewthread&tid={id}"
```

且记录没有非空 `sourceUrl`，导入会把帖子 ID URL 编码后替换 `{id}`，生成原帖链接。`BBS_BASE_URL` 只配置 BBS 入口，不承担拼接原帖地址的作用。直接调用单条创建 API 不会自动执行此转换。

| 标准字段 | 文件导入接受的别名，按优先顺序排列 |
| --- | --- |
| `content` | `contentMarkdown`、`content_markdown`、`body` |
| `summary` | `excerpt`、`extract` |
| `author` | `author_name`、`username` |
| `category` | `board`、`forum_name` |
| `sourceUrl` | `source_url`、`url` |
| `sourceTitle` | `source_title` |
| `sourceThreadId` | `source_thread_id`、`thread_id`、`tid` |
| `externalId` | `external_id` |
| `coverUrl` | `cover_url` |
| `coverMediaId` | `cover_media_id` |
| `coverAlt` | `cover_alt` |
| `coverCredit` | `cover_credit` |
| `eventDate` | `event_date` |
| `attachmentIds` | `attachment_ids` |

标准字段已经存在时优先使用标准字段，即使其值为空字符串；否则使用上表第一个存在的别名。已识别的别名会从记录移除。

导入还会把正文字符串数组用两个换行连接，把 `sourceThreadId`、`externalId` 转成字符串；`tags`、`aliases`、`attachmentIds` 既可使用数组，也可用 `|`、英文逗号或中文逗号分隔的字符串。需要在单个标签内保留逗号时使用 JSON 数组。帖子 ID 建议从源头使用字符串，避免表格或 JSON 大整数精度造成损失。

`externalId` 建议使用 `来源:类型:原始ID`，例如 `bbs:thread:24680`。保留它和稳定的 `slug`，同一资料以后才能可靠跳过或更新。这里只整理并导入显式提供的文件，不会连接或修改原 BBS 数据库，也不会自动抓取附件。

## 5. CSV

首行为字段名，使用英文逗号分隔。可以只保留需要的列。下面是两个条目的完整 CSV；引号内的正文换行是真实换行：

```csv
title,slug,content,kind,category,tags,aliases,author,sourceThreadId,externalId,status
"[示例] 新生资料索引","example-csv-freshman","## 资料概述

请替换为核对过的校园资料。

正文可以有逗号，例如：报到,选课,住宿。",guide,新生指南,"示例|新生","入学索引",示例编辑,13579,example-bbs:thread:13579,draft
"[示例] 一段校园记忆","example-csv-memory","## 故事

保留原作者及原帖来源。",article,校园故事,"示例|记忆","校园往事",示例编辑,13580,example-bbs:thread:13580,draft
```

操作要点：

- Excel 另存为「CSV UTF-8（逗号分隔）」，不要使用系统默认的本地编码 CSV。
- 单元格包含逗号、引号或换行时，用双引号包围；正文内的 `"` 写成 `""`。
- 标签、别名、附件 ID 建议用 `|` 分隔；以逗号分隔时还需要正确引用整个 CSV 单元格。
- CSV 中 `[]` 是字面字符串，不会被当作 JSON 数组解析；空数组应留空单元格。
- 可选的 `kind`、`eventDate` 等列不需要时可以直接删去。若保留 `kind` 列，每行应填合法类型；空 `kind` 会报错。空 `status` 使用导入界面的缺省状态。
- 不要保留 Excel 自动添加的空白列标题或多余导出列；未知字段会报错。
- 保留帖子 ID 的文本格式，避免科学计数法和前导零被表格软件改写。

## 6. 多个 Markdown 文件

每份 `.md` 或 `.markdown` 文件生成一条内容；后端也兼容 `.mdown` 扩展名。一次最多选择 20 份，可以与 JSON、CSV 文件一起预览。

保存为 `example-campus-memory.md`：

```markdown
---
title: "[示例] 一段校园记忆"
slug: example-markdown-memory
externalId: example:markdown:memory
kind: article
category: 校园故事
tags:
  - 示例
  - 校园记忆
aliases:
  - 示例旧称
author: 示例编辑
sourceUrl: "https://bbs.example.edu/forum.php?mod=viewthread&tid=35791"
sourceTitle: "[示例] 记忆原帖"
sourceThreadId: "35791"
eventDate: "2026-09-01"
status: draft
---

> 这是一份格式示例。

## 故事概述

在这里填写核对过的时间、地点和经过。

## 来源说明

保留原作者和原帖地址，注明整理时的补充说明。
```

另存一份 `example-library-guide.md`，可以不写 YAML：

```markdown
# [示例] 图书馆资料查找指南

这是第二个条目。请替换成学校实际提供的资料入口。

## 查找步骤

1. 确认资料名称。
2. 核对来源与适用时间。
```

没有 YAML `title` 字段时，使用正文第一个一级标题 `# ...`；没有一级标题时使用去掉扩展名的文件名。若显式写了 `title: ""`，仍会按空标题报错。标题行保留在正文中。

元数据只接受文件开头由独立 `---` 行包围的 YAML；不支持 `---js`、JavaScript 或其他可执行 front matter。正文是 YAML 后面的全部 Markdown，front matter 中另写 `content` 不会替换它。日期建议加引号，标签使用 YAML 数组。阅读器支持常用 Markdown 和 GFM 表格、任务列表，跳过原始 HTML，不执行脚本。

## 7. 重复策略与更新语义

系统在草稿、已发布、归档全部条目中查找相同 `slug` 或非空 `externalId`：

| 策略 | 已存在时 | 不存在时 |
| --- | --- | --- |
| `skip`，默认 | 保留原内容，预览显示跳过 | 新增 |
| `update` | 用导入记录替换条目并增加版本，保留数据库 ID 与创建时间 | 新增 |
| `error` | 该行报错，阻止整批提交 | 新增 |

**`update` 是完整内容替换。** 缺省字段先按字段表补齐，再写回已有条目。例如，已有条目有标签和封面，而导入记录省略两者，更新会清空原标签和封面关联；只上传标题、正文不能保留其余旧字段。需要保留已有字段时，先导出完整条目，再修改并导入。

缺省状态仅接受 `draft` 或 `published`，默认 `draft`。文件中明确填写的 `status` 优先，可指定 `archived`。使用 `update` 而文件省略状态时，默认会把原来的已发布内容改成草稿；预览中应核对每条状态。所有附带模板都显式写了 `draft`，仅改变界面的缺省状态不会发布模板条目。

以下情况始终报错，与选择 `skip` 无关：

- 同一批次中重复的 slug、externalId，或两条记录实际指向同一个已有条目。
- 记录的 slug 指向条目 A，externalId 却指向条目 B。
- 记录字段不合法、封面 ID 不是已上传图片，或附件 ID 不存在；重复记录也须通过这些校验。

重复提交已经成功的同一个预览会返回 `409 IMPORT_COMMITTED`。使用原文件重新预览并采用 `skip` 可避免重复新增。`update` 即使文本没有变化也会增加版本，因此需要避免无意义的重复更新。

首次发布会生成 `publishedAt`；之后编辑、归档和恢复不重置原首次发布时间。改 `eventDate` 不会改变前台按首次发布时间排序的规则。

## 8. 图片和附件

导入文件不会携带图片二进制，也不会把 `coverUrl` 或原帖链接下载到服务器。媒体流程如下：

1. 在「媒体库」上传 PNG、JPEG、GIF、WebP、PDF 或 UTF-8 TXT。
2. 复制图片 ID 到 `coverMediaId`，清空 `coverUrl`；复制附件 ID 到 `attachmentIds`。
3. 正文内插图可用 `![说明](/api/media/实际ID)`；同时把该 ID 加入 `attachmentIds`，让公开条目具备明确的文件关联。若已经用作 `coverMediaId`，不必重复关联。
4. 导入或保存条目，发布后匿名读者即可访问相关文件。

只在正文中写文件 URL 不会建立媒体关联。未被任何已发布条目的 `coverMediaId` 或 `attachmentIds` 引用的文件，仅登录管理员可访问，匿名请求返回 404；文件被多个条目复用时，只要其中一个已发布，它仍然公开。

上传按 SHA-256 内容去重，同一文件重复上传会复用原媒体 ID 和原文件名元数据。图片和 PDF 检查文件签名，TXT 检查 UTF-8 编码与空字节；不是仅看上传时声明的 MIME 类型。SVG、HTML、ZIP、Word 文档等不在当前白名单中。PDF/TXT 通过下载方式返回，图片可直接显示。

媒体 UUID 是本 Wiki 数据库的标识，**不是 BBS 的 `attachment_id`**。迁移原 BBS 附件时，应先上传文件，并在自己的转换流程中维护「原附件 ID → Wiki 媒体 ID」映射，再生成 `attachmentIds`。

## 9. 导出、迁移与脚本调用

后台内容导出接口 `GET /api/admin/export` 返回：

```json
{
  "schemaVersion": 2,
  "exportedAt": "2026-09-06T00:00:00.000Z",
  "artifacts": []
}
```

实际 `artifacts` 包含草稿、已发布及归档条目的标准输入字段，能重新导入。它不含条目数据库 ID、版本、历史记录、管理员、会话或上传文件本体。导入空库会生成新 ID；文件中的媒体 ID 必须在目标库已存在，否则预览报错。

整站搬迁应同时保留 SQLite 数据库与上传目录，使用 [部署文档](DEPLOYMENT.md) 中的备份和恢复流程。内容导出适合人工整理及内容交换；它不是完整的站点备份。

自动化处理仍使用「上传预览 → 检查 `canCommit` 和逐行结果 → 提交预览 ID」流程。媒体上传、cookie 会话、`X-CSRF-Token`、PowerShell `curl.exe` 示例及全部响应结构见 [API 文档](API.md)。

## 10. 常见问题

| 现象 | 处理方法 |
| --- | --- |
| 文件解析错误且 `row` 为 0 | 检查扩展名、UTF-8 编码、JSON/CSV/YAML 语法及空文件 |
| 第 N 行报字段错误 | 这里的 N 是该文件的第 N 条记录，不一定是文本行号；根据 `errors` 修正字段 |
| `canCommit` 为 false | 有错误行，或全部为跳过；先修正后重新预览 |
| 导入后前台没有内容 | 检查条目状态；默认和下载模板均为草稿 |
| 相同标题重复报错 | 自动生成的 slug 可能相同；为不同内容提供不同稳定 slug |
| `409 IMPORT_STALE` | 预览之后目标记录已变化，重新预览并核对更新内容 |
| `410 IMPORT_EXPIRED` | 超过 30 分钟、预览不存在、不是该管理员生成，或预览不可提交；重新上传预览 |
| 封面/附件在后台能看，前台 404 | 核对文件是否被已发布条目的封面或附件关联 |
| 更新后标签、封面或状态变化 | `update` 使用完整替换与默认值；恢复合适的历史版本，再重新整理完整输入 |
| 导入大批数据超限 | 按记录数、文件大小和代理请求体限制拆分；保留稳定 externalId，先预览再提交 |


## 11. 长文与切片的结构化导入（v2）

推荐 JSON；下载的 artifacts.json 已包含两个长文与三个虚构切片草稿。CSV/Markdown 旧模板继续有效，省略 format 按长文处理。不要把虚构示例发布成真实事件。

| 字段 | 类型与限制 | 语义 |
| --- | --- | --- |
| `format` | long / short | 缺省 long，与原 kind 分类独立 |
| `feedIds` | 最多 12 个流 ID | 缺省 long→main/wiki，short→main/slices；显式 [] 不投放任何流 |
| `short.layout` | quote / image / comparison / note | 原话 / 原图 / 对照 / 行为概述 |
| `short.text` | 字符串，最多 1600 | quote/note 必填 |
| `short.context` | 最多 600 | 必要背景；禁止用它伪装成原话 |
| `short.attribution` | 最多 120 | 发言主体或材料署名 |
| `short.verification` | unverified / source-checked / disputed / corrected | 编辑核对状态，不代表系统判定真伪 |
| `short.sources` | 最多 8 项 | 每项 label（必填，最多200）、url、mediaId、excerpt（最多3000）、date（最多40） |
| `short.comparison` | 最多 2 项，对照卡恰好 2 项 | 每项 label（最多80）、text（必填，最多800）、sourceIndex（0起或null） |
| `short.correction` | 最多 2000 | corrected 状态必填 |

image 卡必须使用 coverMediaId 或 coverUrl。source-checked 至少需要来源链接或已上传文件；对照卡的每一侧还须指向带链接/文件的 sources 项。来源 mediaId 自动建立附件关联，文件仍必须真实存在。附件去重后总数最多20。

切换为 long 时 short 会清空；通过完整 PUT/import update 切换格式时请保留需要的字段。导入 unknown 字段被拒绝，不会把未经约定的 JSON 默默丢弃。

```json
{
  "schemaVersion": 2,
  "artifacts": [{
    "title": "[虚构示例] 自愿参加",
    "format": "short",
    "feedIds": ["main", "slices"],
    "status": "draft",
    "short": {
      "layout": "quote",
      "text": "活动完全自愿，不参加的同学请说明理由。",
      "context": "用于检验版式，不是真实通知。",
      "verification": "unverified",
      "sources": []
    }
  }]
}
```

CSV 的 short 单元格填写完整 JSON，并按 CSV 规则转义内部引号；feedIds 推荐 JSON 数组（例如 `[]`），也兼容分隔字符串。导入别名支持 `feed_ids`→feedIds、`short_content`→short。Markdown front matter 可以写结构化 short 对象，正文可留空用于短内容；复杂对照建议 JSON。

**update 是完整替换**，遗漏 feedIds 会重新应用默认投放，而不是保留旧关系。仅改变投放时使用 MCP artifact_patch，或先读出完整内容再改动。内容导出现在写 schemaVersion=2，但版本号本身不触发另一套迁移器；旧记录按字段兼容规则解析。
