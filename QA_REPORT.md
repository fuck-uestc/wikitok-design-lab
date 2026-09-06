# 原型阶段验证记录

> 本文件只记录原始静态 Demo。正式校园 BBS Wiki 的接口、构建与浏览器验收见 docs/VERIFICATION.md。

## 本次已执行

在无头 Chromium 中渲染最终单文件 HTML，检查两套原型。交互检查每套 13 组，共 26 组通过；运行期间未捕获页面 JavaScript 异常，也没有发出外部 HTTP 资源请求。

验证了上下键与 J/K、原生滚轮切换、回到首页、收藏/取消收藏、收藏列表与列表切换、搜索与结果跳转、阅读抽屉与来源链接、关闭后保留当前位置、分类筛选、随机切换、无图词条、分享失败时的链接回退、窗口缩放后位置保持、手机宽度下的收藏入口，以及模拟图片加载失败后的版式回退。

A 额外验证完整图片弹层；B 额外验证专注模式、Esc 退出和隐藏导航的 inert 状态。

## 布局覆盖

两套分别在以下 6 个视口中遍历全部 6 条样例，共检查 72 个“方案 × 尺寸 × 词条”组合：

1440×900、1280×720、768×1024、390×844、360×640、320×568。

检查页面横向溢出、标题边界和操作区是否落在可视区域内。检查通过。previews 中的 4 张截图来自实际 Chromium 渲染，不是另外绘制的概念图。桌面与 390×844 手机截图也进行了目视核对。

机器记录：previews/qa-results.json。

## 没有验证的部分

这是离线前端原型，未连接真实 Wikipedia 接口，也没有修改或构建用户的 WikiTok 仓库。没有验证真实无限流、大量条目下的内存表现、切换语言或网络错误重试；这些是 CODEX_TASK.md 中的数据适配验收项，不是本原型已完成的能力。

测试环境通过 set_content 渲染内嵌页面，不能代表真实 iOS Safari、Android 浏览器、触摸惯性或屏幕阅读器的行为。它也没有验证真实设备上的系统分享面板、剪贴板权限或刷新后的 localStorage 持久化。收藏检查覆盖的是存储不可用时的会话内回退；HTML 已实现正常浏览器中的 localStorage 读写，但仍应在部署域名下复验。

没有运行自动化对比度审计或对用户目标仓库执行 TypeScript 类型检查。src/adapter.ts 是待移植的参考代码。

## 重跑

环境需要 Python、Playwright 和 Chromium。安装方式请遵循相应工具的官方说明。

```sh
python src/build.py
python src/qa.py --browser /path/to/chromium
```

也可分组执行：`--part functional`、`--part layout-a`、`--part layout-b`。单组结果写入 previews/qa-<part>.json；无参数写入 qa-all.json。检查脚本不需要启动本地 HTTP 服务。
