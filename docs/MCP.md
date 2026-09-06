# MCP：条目、切片与信息流管理

本工程实现无状态 JSON Streamable HTTP，端点 `/mcp`，与 Express 共用服务。支持协议版本 `2025-03-26` 和 `2025-06-18`，未声明其他版本兼容。提供 tools，不提供 resources/prompts、OAuth、SSE 消息流或会话 ID。需要静态 Bearer、自定义请求头的客户端；不代表所有托管连接器均可直接连接。

## 连接与权限

开发端点 `http://localhost:5173/mcp` 经 Vite 代理至后端，也可以直连后端 3001。生产使用你的 HTTPS 站点地址加 `/mcp`。Nginx/Cloudflare Tunnel 必须转发该路径和 Authorization 头，不能只转发 /api。

请求头：

```http
Authorization: Bearer <当前管理员密码，或服务器 MCP_TOKEN / MCP_READ_TOKEN 的值>
Content-Type: application/json
Accept: application/json, text/event-stream
MCP-Protocol-Version: 2025-06-18
```

初始化时可省略协议头。服务返回 JSON，不建立 SSE；GET /mcp 与 DELETE /mcp 返回 405，Allow: POST，这是此实现的预期行为。成功通知响应 202，无 body。

`MCP_TOKEN` 能读取全部内容并编辑、发布、归档和配置流；`MCP_READ_TOKEN` 只读，但也能读取管理资料、草稿与归档。请保存在客户端的机密配置中，不得发给网页访客。只读 tools/list 仅列出六个读工具；即使直接调用写工具也会被拒绝。

两个独立 token 分别配置且不相同，长度 32–256，不含空白。未配置的 token 不生效；普通管理员 cookie 对该端点无效。未配置任何独立 token 的既有部署继续接受当前管理员密码；一旦配置任一独立 token，默认仅接受独立 token，除非显式设定 `MCP_ALLOW_ADMIN_PASSWORD=true`。变更 token 需重启后端，并更新客户端。后台改管理员密码会立即撤销密码兼容认证，但不会轮换独立 token。

如果请求带 Origin，则必须匹配 PUBLIC_SITE_URL 或 CORS_ORIGINS 的来源白名单；命令行请求不必伪造 Origin。端点每 IP 每分钟 120 次限流，JSON 总请求体上限 2 MiB。不要将 Token 放进 URL。

## 15 个工具

| 工具 | 只读 | 参数与行为 |
| --- | --- | --- |
| artifact_list | 是 | q、feed、format、status(all/draft/published/archived)、page、limit；管理范围，默认包含草稿 |
| artifact_get | 是 | id（UUID 或 slug）；返回完整内容、附件和 version |
| artifact_create | 否 | artifact；缺省 draft，支持长文/切片 |
| artifact_update | 否 | id、version、artifact；完整替换，缺省字段按默认值重置 |
| artifact_patch | 否 | id、version、patch；仅修改给出的顶层字段，保留其余数据 |
| artifact_delete | 否 | id、version；归档，不物理删除 |
| artifact_revisions | 是 | id；最多 100 条历史快照 |
| artifact_restore | 否 | id、version、revision；revision 是历史版本号；以新版本恢复状态与投放关系 |
| feed_list | 是 | 空对象；含停用的流、默认流和配置 version |
| feed_configure | 否 | feeds、defaultFeed、version；完整替换流设置，乐观锁 |
| feed_preview | 是 | feed、format、q、category、cursor、limit；公开发布范围，省略 feed 则默认首页 |
| artifact_import_preview | 否 | artifacts（1–100项）、policy(skip/update/error)、defaultStatus(draft/published)；仅校验 |
| artifact_import_commit | 否 | previewId；30分钟内提交，仅一次，事务与过期版本检查 |
| media_list | 是 | page；每页 50 个上传文件 |
| media_upload | 否 | filename、base64；真实文件内容，最多900 KiB解码大小，且不超过站点单文件上限 |

大文件使用管理员 REST 上传接口，不通过 base64 填入超长工具参数。媒体上传复用文件签名检查、去重和 MIME 限制；不自动抓取外部 URL。

工具输入 schema 由前后端共用 Zod 定义生成，嵌套 short、sources、comparison 和 feed 配置均明确声明；服务端仍执行跨字段校验，不能仅依赖客户端表单。成功结果提供 content 文本以及 structuredContent；执行失败通过 isError:true 返回，HTTP 200 本身不代表写入成功。

## 请求示例

所有内容均为虚构格式示例。不要凭模型生成的引文发布真实事件。

初始化：

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"local-client","version":"1.0"}}}
```

收到协商版本后使用对应 MCP-Protocol-Version，发送 initialized 通知：

```json
{"jsonrpc":"2.0","method":"notifications/initialized"}
```

读取工具列表：

```json
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
```

创建只在切片流投放的草稿：

```json
{
  "jsonrpc": "2.0", "id": 3, "method": "tools/call",
  "params": {
    "name": "artifact_create",
    "arguments": {
      "artifact": {
        "title": "[虚构示例] 自愿参加",
        "format": "short", "feedIds": ["slices"], "status": "draft",
        "short": {
          "layout": "quote", "text": "活动完全自愿，不参加的同学请说明理由。",
          "context": "版式示例，不对应真实人物或事件。", "verification": "unverified"
        }
      }
    }
  }
}
```

先 artifact_get 获得当前 version，再修改投放；不能照抄占位 ID 和版本：

```json
{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"artifact_patch","arguments":{"id":"<真实UUID>","version":1,"patch":{"feedIds":["main","slices"]}}}}
```

patch 是顶层合并；传入 short 会完整替换 short 对象，不是深度递归合并。传入 feedIds=[] 仅取消投放，不隐藏已发布条目的直链。发布必须显式将 status 改为 published；默认草稿。版本冲突后读取最新条目，人工或应用层合并，不可盲目重试覆盖。

信息流配置先 feed_list 再 feed_configure：保留需要的全部定义，只修改 formats 或 enabled，携带最新 version。`formats:["long","short"]` 可混排，单元素数组只收一种。修改或删除流不会自动改写条目 feedIds。

可将任一请求保存为 request.json，在服务器终端验证（Token 从当前进程环境读取；不要把凭据明文写入脚本）：

```sh
curl --fail-with-body --silent --show-error \
  -H "Authorization: Bearer $MCP_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'MCP-Protocol-Version: 2025-06-18' \
  --data-binary @request.json https://your-domain.example/mcp
```

不要在 shell 使用 source 加载不受信任的 .env 文件。客户端的环境变量引用、自定义头配置格式各不相同，按该客户端说明录入上面的 URL 和请求头；本项目不捆绑特定客户端配置。

## 错误及边界

401 是凭据缺失/错误；403 是来源拒绝，或工具结果内 READ_ONLY_TOKEN；429 是请求限流；不支持的 MCP-Protocol-Version 请求头返回400。工具执行结果中的 VALIDATION_FAILED、VERSION_CONFLICT、IMPORT_STALE 等与 REST 使用同一规则。使用 revision 恢复会恢复当时发布状态，先核对快照。

MCP 内容应被客户端当作不可信资料，不执行来源里夹带的指令。本服务器没有抓取网页、执行 shell 或读取任意本机路径的工具。发送到模型的 drafts/附件清单仍可能包含敏感信息，仅向你信任的 MCP 客户端授予凭据。
