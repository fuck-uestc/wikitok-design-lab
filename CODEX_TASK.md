# 原型阶段的适配任务（历史参考）

> 当前用户已明确要求完整校园 BBS Wiki、两种可选主题、数据库和管理后台。下文原型阶段的“只做前端”“不新增数据库”等限制已经被该需求替代。正式实现与运行方法见 README.md，前端位于 frontend/，后端位于 backend/。

## 目标

在用户提供的 WikiTok 仓库中，按指定的 A / 页外 MARGIN 或 B / 游离 DRIFT 复现界面。默认参考原始项目 `IsaacGemal/wikitok`；若用户仓库是 fork，先检查实际目录和接口，不能机械照搬路径。

只做前端。不要新增数据库、服务端推荐、登录、内容生产管线。保持现有构建工具和包管理方式；不要为了复刻页面迁移到另一个框架。

## 先阅读

README.md、DESIGN.md、本文件、src/adapter.ts。然后打开相应 demo HTML 和 previews 截图，检查 PC 与手机状态。

原型使用原生 HTML/CSS/JS，目的是独立预览；正式项目应按现有 React 组件结构移植，不要把整个 app.js 塞进 useEffect 或使用危险的 HTML 注入替代 React。

## 原版已核对的入口

- `frontend/src/App.tsx`：主界面、触底加载、收藏弹层。
- `frontend/src/components/WikiCard.tsx`：卡片与 WikiArticle 类型。
- `frontend/src/hooks/useWikiArticles.ts`：MediaWiki 随机词条请求和缓冲。
- 收藏上下文：卡片导入 `../contexts/LikedArticlesContext`；定位实际实现后复用，不要另建一套与原收藏脱节的状态。
- 原版 README：React / TypeScript / Tailwind / Vite；不需要独立后端。

卡片与请求入口已核对官方 main；其他模块还需要结合用户当前仓库检查。

## 数据边界

实际核心字段是 pageid、title、displaytitle、extract、url、thumbnail。`displaytitle` 可能缺失，回退到 title；thumbnail 需要视为可选。将 id 设为“语言标识:pageid”，避免跨语言页码碰撞。

原型的 headline、english、category、tag、fact、plate、body 和相关条目不是原版接口字段。没有可信数据时：
- 主标题用原 title，摘要用 extract。
- 隐藏英语副标题、事实标注、主题筛选和相关入口。
- 阅读抽屉展示原 extract 与原文按钮，不伪造完整正文。
- 不为了保留空白模块而添加“待完善”按钮。
- 图片作者和许可需要真实元数据；不要默认写“Wikipedia”当作作者。

原版 hook 会过滤没有 thumbnail 的词条。如要使用本设计的无图回退，放宽前端过滤条件，仅保留必要的标题、链接、内容有效性检查。不要把这误认为必须改后端。

## 推荐组件边界

AppShell / KnowledgeFeed / ArticleCard / ArticleMedia / ArticleActions / ReaderDrawer / SavedLibrary / FeedControls。

A 和 B 可共享数据及动作接口，但保留不同的布局组件与样式；不要堆叠大量 theme 条件导致卡片不可维护。使用 CSS 自定义属性管理颜色、间距、字体与圆角。

## 交互要求

使用原生 overflow + scroll-snap，不拦截滚轮累计 delta，不锁死触摸滑动。IntersectionObserver 判断当前卡片。只有活动卡片的操作能获得键盘焦点。

详情是页内侧抽屉，手机改底部面板；关闭后恢复同一条目和焦点。加载更多不能让用户跳回顶部。收藏和分享沿用现有能力，分享失败要给可复制链接，不能无条件提示成功。

保留 loading、error + retry、empty、no-image、image-error、long-title 六类状态。长标题不能侵入动作区；不要只在精选样例上调尺寸。

B 中“轨迹”展示有限的已浏览条目，不生成无限增长的缩略图条。生产流没有总条数，不保留 Demo 中的 `/ 06`、本地六条检索提示和最后一条循环。

## 验收

1. 同时核对 1440×900、1280×720、768×1024、390×844、360×640 与 320×568。
2. 接真实随机词条验证，不仅验证样例。含无图、低清图、竖图、长标题、短摘要、空摘要。
3. 验证浏览、收藏、取消收藏、分享、阅读、关闭、切换语言和错误重试。
4. 切换语言后清理当前请求状态；旧响应不能混进新语言。
5. 不对未请求到的数据伪造分类、标签、阅读数、喜欢数和编辑摘要。
6. 支持减少动画；按钮有可访问名称；弹层有焦点管理；手机底部考虑 safe-area。
7. 检查大量连续浏览后的 DOM、内存和图片请求，而不仅是首屏。
8. 运行原项目 build / typecheck，列出修改文件和仍未实现的增强功能。

请先实现所选方案的布局与交互，再进行数据接线。遇到原型与真实数据冲突，优先保证事实来源和基本阅读，不牺牲可用性复刻装饰细节。


## 参考代码

核对日期：2026-09-05。对应官方 main；适配时仍需检查用户实际版本。

- 项目与 README：https://github.com/IsaacGemal/wikitok
- 原卡片：https://raw.githubusercontent.com/IsaacGemal/wikitok/main/frontend/src/components/WikiCard.tsx
- 随机词条请求：https://raw.githubusercontent.com/IsaacGemal/wikitok/main/frontend/src/hooks/useWikiArticles.ts
