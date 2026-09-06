# v2 适配验证报告

日期：2026-09-06。依据：本次上传工程的修改副本，不是远程 main 分支。测试数据位于隔离临时库；未使用现网数据库或用户凭据。以下项目彼此独立，不能将浏览器截图等同于生产构建通过。

## 结果

| 项目 | 结果 | 依据 |
| --- | --- | --- |
| 前后端 TypeScript 类型检查 | PASS | npm run typecheck；verification/typecheck.log |
| 自动化 HTTP / 数据库 / 配置测试 | PASS，33项 | npm test；verification/tests.log |
| 后端 JavaScript 编译 | PASS | npm run build 的 tsc 阶段完成 |
| Vite 生产构建 | BLOCKED | 缺少离线不可下载的 @rollup/rollup-linux-x64-gnu；verification/build.log |
| 浏览器组件与交互检查 | PASS，27项 | verification/browser-results.json；限定方式见下节 |
| 现网、Docker、真实 TLS/代理与 MCP 客户端联调 | 未执行 | 没有部署或修改远程仓库 |

执行环境使用 Node.js 24.11.1，TypeScript 5.9.x；依赖从上传工程所带缓存离线安装。Windows 原生构建依赖不能作为 Linux 构建二进制使用。没有为了绕过缺包而替换依赖锁、伪造 dist 或把 QA bundle 作为产物交付。

## 自动化测试覆盖

保留原有会话、CSRF、密码修改、登录/来源控制、Markdown数据、上传签名与文件可见性、批量导入预览/提交、事务、版本冲突、归档、恢复、导出和数据库备份回归。

新增测试覆盖：v1→v2 增量迁移保留 ID/slug/标签/历史；长文与切片混排、独立流、格式不匹配、草稿过滤；feedIds=[] 不投放但公开直链可用；分类/随机/搜索复用过滤；28条混合内容的游标无重复分页及跨条件/配置版本游标拒绝；信息流启用/默认设置、持久化、CAS、CSRF；原话/图片/两侧对照/来源/更正校验；来源文件自动关联并按发布状态决定公开；JSON/CSV 导入导出保留结构化短内容及空投放数组；MCP 独立 token、只读范围、协议头、Origin、通知、工具 schema、局部补丁、历史恢复、流配置、批量提交及上传；setup 首次生成独立凭据、不输出秘密、升级保留已有键且幂等。

npm test 先用 TypeScript 编译到 .test-build，再运行 Node test runner，最终清理输出。测试不需要 tsx/esbuild 的本机二进制；开发与 Vite 生产构建仍使用原工具链。

## 浏览器检查方式与限制

运行 Chromium/Playwright。当前环境对本地 HTTP 与 file 页面导航返回策略阻止，不能启动普通导航式端到端测试。检查方式为：加载正式源文件和 CSS 经 TypeScript 生成的**测试用模块 bundle** 到内存页面；仅在测试入口把 BrowserRouter 换为 MemoryRouter；fetch 经 Python requests 桥接到实际本机 Express 服务。生产源码没有替换 BrowserRouter，也没有 fetch 桥接代码。

27项检查包含：两主题渲染/切换保留当前内容、真实卡片偏移翻页、长短筛选、独立流、浏览器存储不可用时收藏降级、材料/背景/更正分栏与键盘切换、关闭抽屉保留位置、默认流内搜索和显式全站搜索、390px/320px无横向溢出、超屏文字可读完、后台登录/流管理、隐藏自动填充输入框不造成页面溢出、短内容无需 Markdown 正文即可保存发布、后台全部取消投放后公开流正确排除，以及长引文后的下一条定位。

未覆盖：真实 URL 硬刷新/前进后退、真实浏览器 Cookie/CORS 传输、Vite代码分块、外网图片/媒体下载、实际手指惯性滚动、屏幕阅读器和全部浏览器兼容性、主流 MCP 客户端连接。后端 HTTP 用例验证了服务端认证/CORS规则，但不替代这些浏览器部署验收。当前状态下不能宣称生产全链路验证完成。

材料图全部虚构。截图中的测试记录不写入交付源码数据库；运行 demo:import 只导入明确标注的草稿。

## 已知取舍

原固定屏高虚拟化改为原生可变高度卡片，防止长引文被截断或双滚动。已加载的卡片保留 DOM，图片懒加载；尚未实现针对数千条连续浏览的测量高度窗口化。取消信息流投放不是隐私控制；独立流也不是权限隔离。feed 配置变化导致旧游标无效时，前端重新从第一页加载，而不是反复重试失效游标。

## 在你的机器复核

使用 Node24，在干净目录 npm ci，再 npm run setup（旧配置加 -- --upgrade）。先在数据库备份副本运行 npm run check；确认 Vite 构建完成，再使用生产入口和真实域名测试路由刷新、来源图片、上传、Cookie登录与 MCP 工具调用。不能删除现有数据卷来“解决”迁移问题。详见 UPGRADE_V2.md 与 docs/DEPLOYMENT.md。
